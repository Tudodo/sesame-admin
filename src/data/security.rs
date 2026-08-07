use std::net::IpAddr;

/// Check whether an IP address points to a private or local network.
/// Used to block SSRF attempts where an attacker supplies a connection URL
/// pointing to internal infrastructure (e.g. 127.0.0.1, 10.x, 169.254.169.254).
fn is_blocked_ip(ip: &IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            v4.is_loopback()
                || v4.is_private()
                || v4.is_link_local()
                || v4.is_unspecified()
                || v4.is_broadcast()
                // AWS / cloud metadata endpoint
                || (v4.octets() == [169, 254, 169, 254])
        }
        IpAddr::V6(v6) => {
            v6.is_loopback()
                || v6.is_unspecified()
                || v6.is_multicast()
                // IPv6 unique-local (fc00::/7) and link-local (fe80::/10)
                // — the IPv6 equivalents of RFC1918 / link-local ranges. Without
                // these checks an attacker can reach internal IPv6 infrastructure.
                || v6.is_unique_local()
                || v6.is_unicast_link_local()
        }
    }
}

/// Validate an S3-compatible endpoint to prevent SSRF.
/// Only HTTPS endpoints are accepted, and resolved addresses must not point
/// to loopback, private, link-local, multicast, or cloud metadata networks.
fn parse_validated_s3_endpoint(endpoint: &str) -> Result<url::Url, String> {
    let parsed = url::Url::parse(endpoint).map_err(|_| "无效的 S3 端点地址".to_string())?;
    if parsed.scheme() != "https" {
        return Err("S3 端点必须使用 HTTPS".to_string());
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("S3 端点不能包含用户名或密码".to_string());
    }
    let host = parsed
        .host_str()
        .ok_or_else(|| "S3 端点缺少主机名".to_string())?;
    if let Ok(ip) = host.parse::<IpAddr>() {
        if is_blocked_ip(&ip) {
            return Err("不允许连接到内部或本地地址".to_string());
        }
    }
    Ok(parsed)
}

/// Runtime endpoint guard without DNS resolution.
/// Used when constructing the storage operator on every file operation so a
/// stale or tampered config cannot reintroduce HTTP or internal literal
/// endpoints without adding a blocking DNS lookup to each request.
pub(crate) fn validate_s3_endpoint_format(endpoint: &str) -> Result<(), String> {
    parse_validated_s3_endpoint(endpoint).map(|_| ())
}

pub(crate) fn validate_s3_endpoint(endpoint: &str) -> Result<(), String> {
    let parsed = parse_validated_s3_endpoint(endpoint)?;
    let host = parsed
        .host_str()
        .ok_or_else(|| "S3 端点缺少主机名".to_string())?;
    let port = parsed.port_or_known_default().unwrap_or(443);
    let addrs = std::net::ToSocketAddrs::to_socket_addrs(&(host, port))
        .map_err(|_| "无法解析 S3 端点主机名".to_string())?;
    for addr in addrs {
        if is_blocked_ip(&addr.ip()) {
            return Err("不允许连接到内部或本地地址".to_string());
        }
    }
    Ok(())
}

/// Validate a database connection URL to prevent SSRF.
/// Only PostgreSQL URLs are allowed, and the resolved host must not be a
/// private/loopback/link-local address.
pub fn validate_db_connection_url(url: &str) -> Result<(), String> {
    // Only allow postgres:// or postgresql:// schemes.
    if !url.starts_with("postgres://") && !url.starts_with("postgresql://") {
        return Err("不支持的数据库协议".to_string());
    }

    // Parse the URL to extract the host.
    let parsed = url::Url::parse(url).map_err(|_| "无效的连接地址".to_string())?;
    let host = parsed
        .host_str()
        .ok_or_else(|| "连接地址缺少主机名".to_string())?;
    let port = parsed.port().unwrap_or(5432);

    // Resolve the hostname and check every returned IP.
    let addrs = std::net::ToSocketAddrs::to_socket_addrs(&(host, port))
        .map_err(|_| "无法解析主机名".to_string())?;

    for addr in addrs {
        if is_blocked_ip(&addr.ip()) {
            return Err("不允许连接到内部或本地地址".to_string());
        }
    }

    Ok(())
}

/// Validate a database URL and return a rebinding-safe URL whose host is
/// replaced with the resolved IP.
///
/// `validate_db_connection_url` checks the hostname at call time, but the
/// caller connects later, re-resolving DNS in between. A hostile DNS server
/// can flip its answer between the two resolutions (DNS rebinding): the first
/// lookup returns a public IP that passes the blocklist, the second returns
/// 169.254.169.254 or 127.0.0.1, letting the connection reach internal
/// infrastructure. Returning a URL that already embeds the validated IP
/// removes the rebinding window: the driver connects to the literal IP and
/// never re-resolves the hostname.
///
/// Caller must use the returned URL for the actual connection, not the
/// original. TLS/SNI scenarios that need the original hostname are not
/// supported here (internal cross-DB sync is not expected to use TLS with
/// hostname verification against the external source).
pub fn resolve_safe_db_url(url: &str) -> Result<String, String> {
    if !url.starts_with("postgres://") && !url.starts_with("postgresql://") {
        return Err("不支持的数据库协议".to_string());
    }

    let parsed = url::Url::parse(url).map_err(|_| "无效的连接地址".to_string())?;
    let host = parsed
        .host_str()
        .ok_or_else(|| "连接地址缺少主机名".to_string())?;
    let port = parsed.port().unwrap_or(5432);

    // Resolve once and pick the first non-blocked IP. We deliberately do NOT
    // fall back to a later address: if any resolved IP is internal we reject
    // outright (matches the original validate semantics) so a rebinding
    // attempt that mixes public + private records is still caught.
    let addrs = std::net::ToSocketAddrs::to_socket_addrs(&(host, port))
        .map_err(|_| "无法解析主机名".to_string())?;
    let mut chosen: Option<IpAddr> = None;
    for addr in addrs {
        if is_blocked_ip(&addr.ip()) {
            return Err("不允许连接到内部或本地地址".to_string());
        }
        if chosen.is_none() {
            chosen = Some(addr.ip());
        }
    }
    let ip = chosen.ok_or_else(|| "无法解析主机名".to_string())?;

    // Rebuild the URL with the host replaced by the literal IP. Preserve
    // scheme, userinfo, port, path, and query.
    let scheme = parsed.scheme(); // "postgres" / "postgresql"
    let userinfo = parsed.username();
    let password = parsed.password();
    let path = parsed.path();
    let query = parsed.query().map(|q| format!("?{q}")).unwrap_or_default();

    let host_str = match ip {
        IpAddr::V4(v4) => v4.to_string(),
        IpAddr::V6(v6) => format!("[{v6}]"),
    };

    let auth = match (userinfo, password) {
        ("", _) => String::new(),
        (u, Some(p)) => format!("{u}:{p}@"),
        (u, None) => format!("{u}@"),
    };

    Ok(format!("{scheme}://{auth}{host_str}:{port}{path}{query}"))
}
