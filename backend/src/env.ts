function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function optional(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

export const env = {
  DATABASE_URL: required("DATABASE_URL"),
  JWT_ACCESS_SECRET: required("JWT_ACCESS_SECRET"),
  JWT_REFRESH_SECRET: required("JWT_REFRESH_SECRET"),
  JWT_ACCESS_EXPIRES_IN: optional("JWT_ACCESS_EXPIRES_IN", "15m"),
  JWT_REFRESH_EXPIRES_IN: optional("JWT_REFRESH_EXPIRES_IN", "7d"),
  ALLOWED_EMAIL_DOMAIN: required("ALLOWED_EMAIL_DOMAIN"),
  SUPER_ADMIN_EMAIL: required("SUPER_ADMIN_EMAIL"),
  SUPER_ADMIN_PASSWORD: required("SUPER_ADMIN_PASSWORD"),
  SUPER_ADMIN_FULLNAME: optional("SUPER_ADMIN_FULLNAME", "Super Admin"),
  PORT: parseInt(optional("PORT", "4000"), 10),
  NODE_ENV: optional("NODE_ENV", "development"),
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "",
} as const;

export function validateEmailDomain(email: string): boolean {
  return email.toLowerCase().endsWith(`@${env.ALLOWED_EMAIL_DOMAIN}`);
}
