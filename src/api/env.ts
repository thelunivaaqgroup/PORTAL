export const env = {
  API_BASE_URL: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000",
  API_MODE: (import.meta.env.VITE_API_MODE ?? "mock") as "mock" | "real",
  ALLOWED_EMAIL_DOMAIN: (import.meta.env.VITE_ALLOWED_EMAIL_DOMAIN ?? "") as string,
} as const;

export function validateEmailDomain(email: string): boolean {
  const domain = env.ALLOWED_EMAIL_DOMAIN;
  if (!domain) return true;
  return email.endsWith(`@${domain}`);
}
