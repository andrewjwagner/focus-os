import { describe, expect, it } from "vitest";
import { createVault, decryptJson, encryptJson, unlockVault } from "./crypto";

const FAST = 1000;

describe("team vault crypto", () => {
  it("round-trips JSON with AES-GCM and hides the plaintext", async () => {
    const { key } = await createVault("correct horse battery", FAST);
    const envelope = await encryptJson(key, { text: "Alex to ship the demo" });
    expect(envelope.data).not.toContain("Alex");
    expect(atob(envelope.data)).not.toContain("Alex");
    expect(await decryptJson(key, envelope)).toEqual({ text: "Alex to ship the demo" });
  });

  it("uses a fresh IV per encryption", async () => {
    const { key } = await createVault("correct horse battery", FAST);
    const a = await encryptJson(key, "same");
    const b = await encryptJson(key, "same");
    expect(a.iv).not.toBe(b.iv);
    expect(a.data).not.toBe(b.data);
  });

  it("unlocks with the right passphrase and rejects the wrong one", async () => {
    const { meta, key } = await createVault("correct horse battery", FAST);
    const envelope = await encryptJson(key, [1, 2, 3]);
    const unlocked = await unlockVault("correct horse battery", meta);
    expect(unlocked).not.toBeNull();
    expect(await decryptJson(unlocked!, envelope)).toEqual([1, 2, 3]);
    expect(await unlockVault("wrong passphrase", meta)).toBeNull();
  });

  it("fails to decrypt tampered ciphertext", async () => {
    const { key } = await createVault("correct horse battery", FAST);
    const envelope = await encryptJson(key, "secret");
    const bytes = atob(envelope.data).split("");
    bytes[0] = String.fromCharCode(bytes[0].charCodeAt(0) ^ 1);
    await expect(decryptJson(key, { ...envelope, data: btoa(bytes.join("")) })).rejects.toThrow();
  });

  it("rejects short passphrases", async () => {
    await expect(createVault("short", FAST)).rejects.toThrow();
  });
});
