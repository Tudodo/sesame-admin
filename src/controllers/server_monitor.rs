use crate::data::permissions::require_platform_admin;
use crate::middleware::tenant::TenantScope;
use axum::Extension;
use loco_rs::prelude::*;
use serde::Serialize;

/// TTL for the shared CPU sample stored in Redis. A fresh sample is written on
/// every monitor read, so this only bounds stale data left after the last request.
const CPU_SAMPLE_TTL_SECS: u64 = 30;

#[derive(Serialize)]
struct ServerInfo {
    cpu_usage: f64,
    cpu_count: usize,
    total_memory: u64,
    used_memory: u64,
    free_memory: u64,
    total_swap: u64,
    used_swap: u64,
    free_swap: u64,
    os_name: String,
    os_version: String,
    hostname: String,
    uptime: u64,
    process_count: usize,
}

#[debug_handler]
async fn get_info(
    auth: auth::JWT,
    State(_ctx): State<AppContext>,
    Extension(tenant): Extension<TenantScope>,
) -> Result<Response> {
    require_platform_admin(
        &auth,
        &tenant.code,
        "system:monitor:read",
        "服务器监控仅对平台租户管理员开放",
    )?;
    let info = gather_system_info().await;
    format::json(info)
}

async fn gather_system_info() -> ServerInfo {
    use std::process::Command;

    let cpu_count = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(1);

    // Read memory from /proc/meminfo (Linux)
    let (total_memory, free_memory, total_swap, free_swap) = read_meminfo();

    let hostname = std::fs::read_to_string("/proc/sys/kernel/hostname")
        .unwrap_or_else(|_| "unknown".into())
        .trim()
        .to_string();

    let os_name = std::fs::read_to_string("/proc/version")
        .unwrap_or_else(|_| "Linux".into())
        .trim()
        .chars()
        .take(60)
        .collect();

    let os_version = String::new();

    let uptime = std::fs::read_to_string("/proc/uptime")
        .ok()
        .and_then(|s| s.split_whitespace().next()?.parse::<f64>().ok())
        .map(|s| s as u64)
        .unwrap_or(0);

    let process_count = Command::new("sh")
        .arg("-c")
        .arg("ps aux | wc -l")
        .output()
        .map(|o| {
            String::from_utf8_lossy(&o.stdout)
                .trim()
                .parse::<usize>()
                .unwrap_or(0)
                .saturating_sub(1)
        })
        .unwrap_or(0);

    let cpu_usage = read_cpu_usage(&hostname).await;

    ServerInfo {
        cpu_usage,
        cpu_count,
        total_memory,
        used_memory: total_memory.saturating_sub(free_memory),
        free_memory,
        total_swap,
        used_swap: total_swap.saturating_sub(free_swap),
        free_swap,
        os_name,
        os_version,
        hostname,
        uptime,
        process_count,
    }
}

fn read_meminfo() -> (u64, u64, u64, u64) {
    let content = match std::fs::read_to_string("/proc/meminfo") {
        Ok(c) => c,
        Err(_) => return (0, 0, 0, 0),
    };
    let mut total = 0u64;
    let mut available = 0u64;
    let mut swap_total = 0u64;
    let mut swap_free = 0u64;
    for line in content.lines() {
        if line.starts_with("MemTotal:") {
            total = parse_kb(line);
        } else if line.starts_with("MemAvailable:") {
            available = parse_kb(line);
        } else if line.starts_with("SwapTotal:") {
            swap_total = parse_kb(line);
        } else if line.starts_with("SwapFree:") {
            swap_free = parse_kb(line);
        }
    }
    (
        total * 1024,
        available * 1024,
        swap_total * 1024,
        swap_free * 1024,
    )
}

fn parse_kb(line: &str) -> u64 {
    line.split_whitespace()
        .nth(1)
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(0)
}

// Cache the previous CPU sample (idle/total jiffies) in Redis, keyed by
// hostname, so multiple app instances on the same host share the same
// baseline. /proc/stat aggregates jiffies since boot, so a single snapshot
// reports the boot-to-now average rather than current load; the delta between
// two close samples approximates instantaneous CPU usage.
static LAST_CPU_SAMPLE: std::sync::Mutex<Option<(u64, u64)>> = std::sync::Mutex::new(None);

async fn read_cpu_usage(hostname: &str) -> f64 {
    let Some((idle, total)) = read_proc_stat_aggregate() else {
        return 0.0;
    };
    let name = format!("cpu:{hostname}");
    let payload = format!("{idle},{total}");
    let previous = match crate::data::shared_redis::get("monitor", &name).await {
        Ok(Some(raw)) => parse_cpu_sample(&raw),
        Ok(None) => None,
        Err(e) => {
            tracing::warn!(error = %e, "cpu sample redis read failed, using process-local fallback");
            local_previous_cpu_sample()
        }
    };
    let usage = cpu_usage_from_delta(idle, total, previous);
    if let Err(e) =
        crate::data::shared_redis::set("monitor", &name, &payload, CPU_SAMPLE_TTL_SECS).await
    {
        tracing::warn!(error = %e, "cpu sample redis write failed");
    }
    set_local_cpu_sample((idle, total));
    usage
}

fn parse_cpu_sample(raw: &str) -> Option<(u64, u64)> {
    let mut parts = raw.split(',');
    let idle = parts.next()?.trim().parse().ok()?;
    let total = parts.next()?.trim().parse().ok()?;
    Some((idle, total))
}

fn cpu_usage_from_delta(idle: u64, total: u64, previous: Option<(u64, u64)>) -> f64 {
    let Some((prev_idle, prev_total)) = previous else {
        return 0.0;
    };
    let idle_delta = idle.saturating_sub(prev_idle);
    let total_delta = total.saturating_sub(prev_total);
    // If total didn't advance (two reads within the same jiffy) the ratio is
    // undefined; fall back to 0.0 rather than NaN.
    if total_delta == 0 {
        0.0
    } else {
        let busy_delta = total_delta.saturating_sub(idle_delta);
        (busy_delta as f64 / total_delta as f64) * 100.0
    }
    .clamp(0.0, 100.0)
}

fn local_previous_cpu_sample() -> Option<(u64, u64)> {
    LAST_CPU_SAMPLE.lock().ok().and_then(|guard| *guard)
}

fn set_local_cpu_sample(sample: (u64, u64)) {
    if let Ok(mut guard) = LAST_CPU_SAMPLE.lock() {
        *guard = Some(sample);
    }
}

/// Read the aggregate `cpu` line from /proc/stat and return (idle, total)
/// jiffies since boot. Returns None if /proc/stat is unavailable or malformed.
fn read_proc_stat_aggregate() -> Option<(u64, u64)> {
    let content = std::fs::read_to_string("/proc/stat").ok()?;
    let line = content.lines().next()?;
    // Fields: user nice system idle iowait irq softirq steal guest guest_nice.
    // idle is index 3 (0-based after the "cpu" label); idle + iowait (index 4)
    // together count as "idle" time.
    let parts: Vec<u64> = line
        .split_whitespace()
        .skip(1)
        .filter_map(|s| s.parse().ok())
        .collect();
    if parts.len() < 4 {
        return None;
    }
    let idle = parts[3] + parts.get(4).copied().unwrap_or(0);
    let total: u64 = parts.iter().sum();
    Some((idle, total))
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/server-monitor")
        .add("/", get(get_info))
}

#[cfg(test)]
mod tests {
    use super::{cpu_usage_from_delta, parse_cpu_sample};

    #[test]
    fn parses_cpu_sample() {
        assert_eq!(parse_cpu_sample("42,100"), Some((42, 100)));
        assert_eq!(parse_cpu_sample("bad"), None);
    }

    #[test]
    fn first_sample_returns_zero() {
        assert_eq!(cpu_usage_from_delta(42, 100, None), 0.0);
    }

    #[test]
    fn computes_busy_percentage() {
        let usage = cpu_usage_from_delta(55, 120, Some((50, 100)));
        assert!((usage - 75.0).abs() < f64::EPSILON);
    }

    #[test]
    fn handles_zero_total_delta_and_clamps() {
        assert_eq!(cpu_usage_from_delta(42, 100, Some((42, 100))), 0.0);
        assert_eq!(cpu_usage_from_delta(10, 20, Some((100, 10))), 100.0);
    }
}
