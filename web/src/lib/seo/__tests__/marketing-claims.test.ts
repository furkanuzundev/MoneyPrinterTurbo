import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Tester geri bildirimindeki güven kırıcı metinlerin geri sızmasına karşı ucuz
// bir ağ. jsdom/component test kurulumu yok; bu dosyalar sadece metin taranır.
const ROOTS = [
  "src/components/landing",
  "src/lib/seo",
  "src/app/signin",
  "src/app/dashboard/buy",
  "src/app/use-cases",
];

const BANNED: { pattern: RegExp; why: string }[] = [
  { pattern: /One credit\s*(&asymp;|≈)\s*one short/i, why: "60s video costs 2 credits" },
  { pattern: /~\{pkg\.credits\} shorts/, why: "pack video count assumed 1:1" },
  { pattern: /under a minute/i, why: "lengths are 30s-3min" },
  { pattern: /Millions of licensed/i, why: "unsubstantiated stock-library claim" },
  { pattern: /Trained on high-retention/i, why: "unverifiable training claim" },
  { pattern: /Maya Chen/, why: "fabricated testimonial" },
  { pattern: /84K followers/, why: "fabricated testimonial" },
  { pattern: /Watch a 30s demo/i, why: "hero-demo.mp4 is not 30s" },
];

function walk(dir: string): string[] {
  let out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out = out.concat(walk(p));
    else if (/\.(tsx?|mdx?)$/.test(entry) && !p.includes("__tests__")) out.push(p);
  }
  return out;
}

describe("marketing copy guardrails", () => {
  const files = ROOTS.flatMap(walk);

  it("scans a non-trivial number of files", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  for (const { pattern, why } of BANNED) {
    it(`never says ${pattern.source} (${why})`, () => {
      const offenders = files.filter((f) =>
        pattern.test(readFileSync(f, "utf8")),
      );
      expect(offenders).toEqual([]);
    });
  }
});
