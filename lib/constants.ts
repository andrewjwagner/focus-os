export const LOCAL_SESSION_KEY = "focus-os.session.v1";
export const DB_NAME = "focus-os";
export const DB_VERSION = 1;

export function allowedEmail(): string {
  return (process.env.NEXT_PUBLIC_ALLOWED_EMAIL ?? "").trim().toLowerCase();
}

export function emailsMatch(email: string | null | undefined): boolean {
  if (!email?.trim()) return false;
  const allowed = allowedEmail();
  if (!allowed) return true;
  return email.trim().toLowerCase() === allowed;
}
