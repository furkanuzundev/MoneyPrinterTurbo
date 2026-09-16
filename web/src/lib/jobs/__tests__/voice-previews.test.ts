import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { VOICES } from "@/lib/jobs/options";

// Önizlemeler statik dosya olarak sunuluyor (public/voice-previews). Listeye
// ses eklenip klip üretilmezse kullanıcı sessiz bir karta tıklar; bu testler
// o kaymayı build zamanında yakalar.
const PREVIEW_DIR = join(process.cwd(), "public", "voice-previews");

describe("static voice previews", () => {
  it("ships a clip for every voice in the catalog", () => {
    const missing = VOICES.filter(
      (v) => !existsSync(join(PREVIEW_DIR, `${v.id}.mp3`)),
    ).map((v) => v.id);
    expect(missing).toEqual([]);
  });

  it("ships clips with actual audio in them", () => {
    const empty = VOICES.filter((v) => {
      const p = join(PREVIEW_DIR, `${v.id}.mp3`);
      return existsSync(p) && statSync(p).size < 2000;
    }).map((v) => v.id);
    expect(empty).toEqual([]);
  });
});
