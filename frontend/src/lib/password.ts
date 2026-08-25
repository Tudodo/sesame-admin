export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;

/** 与后端 auth::validate_password_strength 保持一致的前端校验。 */
export function passwordError(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `密码至少 ${PASSWORD_MIN_LENGTH} 位`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `密码不能超过 ${PASSWORD_MAX_LENGTH} 位`;
  }
  if (!/[A-Z]/.test(password)) return "密码需包含大写字母";
  if (!/[a-z]/.test(password)) return "密码需包含小写字母";
  if (!/\d/.test(password)) return "密码需包含数字";
  return null;
}
