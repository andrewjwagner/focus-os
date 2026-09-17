export function todayLabel(date = new Date()): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}
