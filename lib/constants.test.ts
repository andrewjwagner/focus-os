import { afterEach, describe, expect, it } from "vitest";
import { allowedEmail, emailsMatch } from "./constants";

describe("email allowlist", () => {
  const original = process.env.NEXT_PUBLIC_ALLOWED_EMAIL;

  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_ALLOWED_EMAIL;
    else process.env.NEXT_PUBLIC_ALLOWED_EMAIL = original;
  });

  it("allows any non-empty email when the env is empty", () => {
    process.env.NEXT_PUBLIC_ALLOWED_EMAIL = "";
    expect(allowedEmail()).toBe("");
    expect(emailsMatch("anyone@example.com")).toBe(true);
    expect(emailsMatch("  Other.Person@Example.COM ")).toBe(true);
    expect(emailsMatch("")).toBe(false);
    expect(emailsMatch("   ")).toBe(false);
    expect(emailsMatch(null)).toBe(false);
  });

  it("gates to the configured email when set", () => {
    process.env.NEXT_PUBLIC_ALLOWED_EMAIL = "you@example.com";
    expect(allowedEmail()).toBe("you@example.com");
    expect(emailsMatch("you@example.com")).toBe(true);
    expect(emailsMatch("YOU@example.com")).toBe(true);
    expect(emailsMatch("other@example.com")).toBe(false);
  });
});
