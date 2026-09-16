import OpenAI from "openai";
import { LANGUAGE_NAMES, PUNCTUATION_RULE } from "./generate";

let client: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!client) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY is not set");
    client = new OpenAI({ apiKey: key });
  }
  return client;
}

// /api/script ve /api/jobs konuyu 300 karaktere kırpıyor; parlatılmış konu
// da oraya sığmalı ki kullanıcı gördüğü metinle üretilen script aynı olsun.
export const SUBJECT_MAX_CHARS = 300;

// Kullanıcının yazdığı ham fikri, script prompt'unun ("…a short vertical
// video about: ${subject}") iyi çalıştığı tek satırlık keskin bir konuya
// çevirir. Çıktı brief'te seçili dilde: script de aynı dilde yazılıyor.
export function buildSubjectPrompt(
  raw: string,
  language: string,
  targetSeconds: number,
): string {
  const languageName = LANGUAGE_NAMES[language] ?? "English";
  return [
    "Rewrite this rough idea into one sharp topic line for a short vertical video.",
    `Rough idea: ${raw}`,
    `Language: ${languageName}. The video is ${targetSeconds}-second long, so the`,
    "topic must be narrow enough to cover well in that time.",
    "Rules: a single sentence or phrase, under 30 words; name a concrete angle and",
    "who it is for; keep any specifics the idea already has and invent no facts;",
    "no emojis, no hashtags, no markdown, no quotes around the line, no title case.",
    PUNCTUATION_RULE,
    "Return only the topic line.",
  ].join("\n");
}

// Model bazen satırı kod bloğuna sarıyor ya da tırnak içine alıyor; textarea
// tek satırlık bir konu beklediği için tek satıra indirip kırpıyoruz.
// Kullanılabilir bir şey çıkmazsa kullanıcının metnini bozmadan bırakıyoruz.
export function sanitizeSubject(raw: string, fallback: string): string {
  const oneLine = raw
    .replace(/```(?:[a-z]+)?/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .trim();
  if (!oneLine) return fallback;
  return oneLine.slice(0, SUBJECT_MAX_CHARS);
}

export async function refineSubject(
  raw: string,
  language: string,
  targetSeconds: number,
): Promise<string> {
  const openai = getOpenAI();
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const res = await openai.chat.completions.create({
    model,
    messages: [
      { role: "user", content: buildSubjectPrompt(raw, language, targetSeconds) },
    ],
  });
  return sanitizeSubject(res.choices[0]?.message?.content ?? "", raw);
}
