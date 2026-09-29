import type { Envelope, VaultMeta } from "./types";

/** Encryption at rest for Team data (WebCrypto AES-GCM, PBKDF2 key). */

export const PBKDF2_ITERATIONS = 310_000;
const CHECK_PLAINTEXT = "focus-os-team-vault-v1";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function subtle(): SubtleCrypto {
  const c = globalThis.crypto;
  if (!c?.subtle) throw new Error("WebCrypto is not available");
  return c.subtle;
}

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(length));
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

export async function deriveKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations = PBKDF2_ITERATIONS,
): Promise<CryptoKey> {
  const base = await subtle().importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return subtle().deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptJson(key: CryptoKey, value: unknown): Promise<Envelope> {
  const iv = randomBytes(12);
  const cipher = await subtle().encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(JSON.stringify(value)),
  );
  return { iv: toBase64(iv), data: toBase64(new Uint8Array(cipher)) };
}

export async function decryptJson<T>(key: CryptoKey, envelope: Envelope): Promise<T> {
  const plain = await subtle().decrypt(
    { name: "AES-GCM", iv: fromBase64(envelope.iv) },
    key,
    fromBase64(envelope.data),
  );
  return JSON.parse(decoder.decode(plain)) as T;
}

export const MIN_PASSPHRASE_LENGTH = 8;

/** First use: derive a key from a new passphrase and build the vault record. */
export async function createVault(
  passphrase: string,
  iterations = PBKDF2_ITERATIONS,
): Promise<{ key: CryptoKey; meta: VaultMeta }> {
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
    throw new Error("Passphrase too short");
  }
  const salt = randomBytes(16);
  const key = await deriveKey(passphrase, salt, iterations);
  const check = await encryptJson(key, CHECK_PLAINTEXT);
  return { key, meta: { salt: toBase64(salt), iterations, check } };
}

/** Returns the key when the passphrase is right, null otherwise. */
export async function unlockVault(
  passphrase: string,
  meta: VaultMeta,
): Promise<CryptoKey | null> {
  const key = await deriveKey(passphrase, fromBase64(meta.salt), meta.iterations);
  try {
    const check = await decryptJson<string>(key, meta.check);
    return check === CHECK_PLAINTEXT ? key : null;
  } catch {
    return null;
  }
}
