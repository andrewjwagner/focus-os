export const DEFAULT_ALLOWED_EMAIL = "andrew.wagner179@gmail.com";
export const LOCAL_SESSION_KEY = "focus-os.session.v1";
export const DB_NAME = "focus-os";
export const DB_VERSION = 2;
export const TIMEZONE = "America/New_York";

export function allowedEmail(): string {
  return (
    process.env.NEXT_PUBLIC_ALLOWED_EMAIL?.trim() || DEFAULT_ALLOWED_EMAIL
  ).toLowerCase();
}

export function emailsMatch(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === allowedEmail();
}
