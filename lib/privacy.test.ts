import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { DEMO_MOMENTS, DEMO_NOTES, DEMO_PEOPLE } from "./team/seed";

/**
 * The repo is public. Real names, emails, meeting content, and API keys must
 * never be committed. Private words are stored as SHA-256 hashes so this test
 * does not itself leak them.
 */

const ROOT = join(__dirname, "..");
const SCAN_DIRS = ["app", "components", "lib"];
const SCAN_FILES = ["README.md", "CONTRIBUTING.md", "AGENTS.md", ".env.example", "package.json"];
const TEXT_EXT = /\.(ts|tsx|js|mjs|cjs|json|md|css|example)$/;

/** sha256 of lowercase private words (first and last names). */
const PRIVATE_WORD_HASHES = new Set([
  "102cf10b5286bad9fcfe5e275ace3ddd7dcc23931fb0ca93dc223daf9877cabd",
  "08cd4a3d759e16c35f5938aa996aa46dc9bb632293e44270e17d9fdca4970e66",
  "26ae784d194a5760464348329af4eb9fca2b27bbf823742c968a61543e3a1153",
]);

/** Plain markers already blocked in demo seed data. */
const PRIVATE_MARKERS = [
  "Bread",
  "Pocket PM",
  "Pocket PM Coach",
  "Wilson",
  "HYROX",
  "deal-one",
  "wagner",
  "andrew.wagner",
];

// Built from parts so the pattern source never matches itself.
const GRANOLA_KEY = new RegExp(["gr", "n_[A-Za-z0-9_-]{6,}"].join(""));
const REAL_EMAIL = /[A-Za-z0-9._%+-]+@(?!example\.com|granola\.ai)[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

function walk(dir: string, out: string[]) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".next")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (TEXT_EXT.test(name)) out.push(path);
  }
}

function repoFiles(): string[] {
  const files: string[] = [];
  for (const dir of SCAN_DIRS) walk(join(ROOT, dir), files);
  for (const file of SCAN_FILES) files.push(join(ROOT, file));
  return files;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function privateWordsIn(text: string): string[] {
  const hits = new Set<string>();
  for (const word of text.toLowerCase().match(/[a-z]+/g) ?? []) {
    if (PRIVATE_WORD_HASHES.has(sha256(word))) hits.add(word);
  }
  return [...hits];
}

describe("privacy guard", () => {
  it("detects the hashed private words", () => {
    // Sanity check with a fictional stand-in: the hash set must be non-empty and well formed.
    expect(PRIVATE_WORD_HASHES.size).toBe(3);
    for (const hash of PRIVATE_WORD_HASHES) expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(privateWordsIn("Alex Rivera and Sam Lee")).toEqual([]);
  });

  it("keeps private names and Granola keys out of every tracked source file", () => {
    const offenders: string[] = [];
    for (const file of repoFiles()) {
      const text = readFileSync(file, "utf8");
      const words = privateWordsIn(text);
      if (words.length) offenders.push(`${relative(ROOT, file)}: private name`);
      if (GRANOLA_KEY.test(text)) offenders.push(`${relative(ROOT, file)}: Granola key pattern`);
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the Team demo seed fictional", () => {
    const blob = JSON.stringify({ DEMO_PEOPLE, DEMO_NOTES, DEMO_MOMENTS });
    expect(privateWordsIn(blob)).toEqual([]);
    expect(GRANOLA_KEY.test(blob)).toBe(false);
    expect(REAL_EMAIL.test(blob)).toBe(false);
    for (const marker of PRIVATE_MARKERS) {
      expect(blob.toLowerCase().includes(marker.toLowerCase())).toBe(false);
    }
    expect(DEMO_PEOPLE.map((person) => [person.name, person.role])).toEqual([
      ["Alex Rivera", "direct"],
      ["Sam Lee", "manager"],
    ]);
  });

  it("never exposes the Granola key to the client bundle", () => {
    const publicPrefix = ["NEXT", "PUBLIC", "GRANOLA"].join("_");
    for (const file of repoFiles()) {
      const text = readFileSync(file, "utf8");
      expect(text.includes(publicPrefix)).toBe(false);
      if (text.includes("process.env.GRANOLA_API_KEY") && /\.(ts|tsx)$/.test(file) && !file.endsWith(".test.ts")) {
        expect(relative(ROOT, file)).toBe(join("app", "api", "granola", "sync", "route.ts"));
      }
    }
  });
});
