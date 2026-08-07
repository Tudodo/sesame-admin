use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use rand::{rngs::OsRng, RngCore};
use sha2::{Digest, Sha256};

const SECRET_PREFIX: &str = "enc:v1:";
const NONCE_LEN: usize = 12;
const MASTER_KEY_ENV: &str = "STORAGE_SECRET_MASTER_KEY";

/// Whether the stored value is an encrypted payload rather than legacy
/// plaintext written before encryption was introduced.
#[must_use]
pub fn is_encrypted(value: &str) -> bool {
    value.starts_with(SECRET_PREFIX)
}

/// Encrypt a plaintext S3 secret for storage.
pub fn encrypt_secret(plaintext: &str) -> Result<String, String> {
    let key = master_key()?;
    encrypt_with_key(plaintext.as_bytes(), &key)
}

/// Decrypt a stored S3 secret. Legacy plaintext values are returned as-is so
/// existing tenants keep working while new writes are encrypted.
pub fn decrypt_secret(stored: &str) -> Result<String, String> {
    if !is_encrypted(stored) {
        return Ok(stored.to_string());
    }
    let key = master_key()?;
    decrypt_with_key(stored, &key)
}

fn master_key() -> Result<[u8; 32], String> {
    let raw = std::env::var(MASTER_KEY_ENV)
        .map_err(|_| format!("未配置 {MASTER_KEY_ENV}，无法加密存储密钥"))?;
    if raw.trim().is_empty() {
        return Err(format!("{MASTER_KEY_ENV} 不能为空"));
    }
    let digest = Sha256::digest(raw.as_bytes());
    let mut key = [0u8; 32];
    key.copy_from_slice(&digest);
    Ok(key)
}

fn encrypt_with_key(plaintext: &[u8], key: &[u8; 32]) -> Result<String, String> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| "无法初始化密钥加密器".to_string())?;
    let mut nonce = [0u8; NONCE_LEN];
    OsRng.fill_bytes(&mut nonce);
    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&nonce), plaintext)
        .map_err(|_| "S3 密钥加密失败".to_string())?;
    Ok(format!(
        "{SECRET_PREFIX}{}:{}",
        encode_hex(&nonce),
        encode_hex(&ciphertext)
    ))
}

fn decrypt_with_key(stored: &str, key: &[u8; 32]) -> Result<String, String> {
    let payload = stored
        .strip_prefix(SECRET_PREFIX)
        .ok_or_else(|| "S3 密钥格式不正确".to_string())?;
    let (nonce_hex, cipher_hex) = payload
        .split_once(':')
        .ok_or_else(|| "S3 密钥格式不正确".to_string())?;
    let nonce = decode_hex(nonce_hex)?;
    if nonce.len() != NONCE_LEN {
        return Err("S3 密钥 nonce 长度不正确".to_string());
    }
    let ciphertext = decode_hex(cipher_hex)?;
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| "无法初始化密钥解密器".to_string())?;
    let plaintext = cipher
        .decrypt(Nonce::from_slice(&nonce), ciphertext.as_ref())
        .map_err(|_| "S3 密钥解密失败，请检查 STORAGE_SECRET_MASTER_KEY".to_string())?;
    String::from_utf8(plaintext).map_err(|_| "S3 密钥解密结果不是合法文本".to_string())
}

fn encode_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn decode_hex(value: &str) -> Result<Vec<u8>, String> {
    if !value.len().is_multiple_of(2) || !value.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("S3 密钥密文不是合法十六进制".to_string());
    }
    (0..value.len())
        .step_by(2)
        .map(|i| {
            u8::from_str_radix(&value[i..i + 2], 16)
                .map_err(|_| "S3 密钥密文不是合法十六进制".to_string())
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{decrypt_secret, decrypt_with_key, encrypt_with_key, is_encrypted};

    #[test]
    fn secret_round_trip_uses_detached_nonce() {
        let key = [7u8; 32];
        let encrypted = encrypt_with_key(b"secret-key", &key).unwrap();
        assert!(is_encrypted(&encrypted));
        assert_ne!(encrypted, "secret-key");
        assert_eq!(decrypt_with_key(&encrypted, &key).unwrap(), "secret-key");
    }

    #[test]
    fn legacy_plaintext_is_accepted_without_master_key() {
        assert!(!is_encrypted("plain-secret"));
        assert_eq!(decrypt_secret("plain-secret").unwrap(), "plain-secret");
    }
}
