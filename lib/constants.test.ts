import { afterEach, describe, expect, it, vi } from "vitest";
import { allowedEmail, emailsMatch } from "./constants";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("allowlist", () => {
  it("treats empty allowlist as open local mode", () => {
    vi.stubEnv("NEXT_PUBLIC_ALLOWED_EMAIL", "");
    expect(allowedEmail()).toBe("");
    expect(emailsMatch("anyone@example.com")).toBe(true);
    expect(emailsMatch("")).toBe(false);
  });

  it("gates when allowlist is set", () => {
    vi.stubEnv("NEXT_PUBLIC_ALLOWED_EMAIL", "you@example.com");
    expect(allowedEmail()).toBe("you@example.com");
    expect(emailsMatch("you@example.com")).toBe(true);
    expect(emailsMatch("other@example.com")).toBe(false);
  });
});
