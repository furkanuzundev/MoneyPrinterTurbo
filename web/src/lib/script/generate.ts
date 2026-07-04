import OpenAI from "openai";
import {
  sanitizeScenes,
  scriptFromScenes,
  type Scene,
} from "@/lib/jobs/scenes";

let client: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!client) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY is not set");
    client = new OpenAI({ apiKey: key });
  }
  return client;
}

// Locale kodu → İngilizce dil adı (LLM prompt'unda kullanılır). Hem tam
// locale (tr-TR) hem eski kısa kodlar (tr) desteklenir. Bilinmeyen kod
// çağıran tarafta "English"e düşer.
const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  tr: "Turkish",
  "en-US": "English",
  "en-GB": "English",
  "tr-TR": "Turkish",
  "es-ES": "Spanish",
  "es-MX": "Spanish",
  "de-DE": "German",
  "fr-FR": "French",
  "pt-BR": "Portuguese",
  "it-IT": "Italian",
  "ru-RU": "Russian",
  "ar-SA": "Arabic",
  "zh-CN": "Chinese",
  "ja-JP": "Japanese",
  "ko-KR": "Korean",
  "hi-IN": "Hindi",
  "nl-NL": "Dutch",
  "pl-PL": "Polish",
  "sv-SE": "Swedish",
  "id-ID": "Indonesian",
  "vi-VN": "Vietnamese",
  "th-TH": "Thai",
  "uk-UA": "Ukrainian",
  "ro-RO": "Romanian",
  "el-GR": "Greek",
  "cs-CZ": "Czech",
  "he-IL": "Hebrew",
  "da-DK": "Danish",
  "fi-FI": "Finnish",
  "nb-NO": "Norwegian",
  "fa-IR": "Persian",
};

export function buildScriptPrompt(
  subject: string,
  language: string,
  targetSeconds: number,
): string {
  const words = Math.round(targetSeconds * 2.5);
  const languageName = LANGUAGE_NAMES[language] ?? "English";
  return [
    `Write a voiceover script for a short vertical video about: ${subject}.`,
    `Language: ${languageName}. Target length: about ${words} words.`,
    "Rules: plain spoken prose only; no markdown, no headings, no emojis,",
    "no scene directions, no hashtags; hook the viewer in the first sentence;",
    "end with a single memorable takeaway. Return only the script text.",
  ].join("\n");
}

export function buildScenesPrompt(
  subject: string,
  language: string,
  targetSeconds: number,
): string {
  const words = Math.round(targetSeconds * 2.5);
  const sceneCount = Math.max(3, Math.min(8, Math.round(targetSeconds / 15) + 1));
  const languageName = LANGUAGE_NAMES[language] ?? "English";
  return [
    `Write a scene-based script for a short vertical video about: ${subject}.`,
    `Language: ${languageName}. Total voiceover length: about ${words} words across ${sceneCount} scenes.`,
    "The first scene is the HOOK (grab attention in one sentence), the last is the CTA",
    '(one memorable takeaway or follow prompt), middle scenes are tagged "SCENE 1", "SCENE 2", …',
    "Each scene has:",
    '- "caption": the on-screen text, max 8 punchy words',
    '- "voiceover": the spoken narration for that scene, plain prose, no emojis/hashtags',
    "Also give 5 short English stock-footage search terms matching the video.",
    "Return ONLY a JSON object, no code fences:",
    '{"scenes":[{"tag":"HOOK","caption":"…","voiceover":"…"}],"terms":["…"]}',
  ].join("\n");
}

export function buildTermsPrompt(subject: string, script: string): string {
  return [
    `Video subject: ${subject}`,
    `Script: ${script}`,
    "Give 5 short English stock-footage search terms matching this video.",
    'Return ONLY a JSON array of strings, e.g. ["term one","term two"].',
  ].join("\n");
}

export function parseTerms(raw: string): string[] {
  const cleaned = raw.replace(/```(?:json)?/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      return parsed.map(String).filter(Boolean).slice(0, 5);
    }
  } catch {
    // JSON değilse satır satır dene
  }
  return cleaned
    .split("\n")
    .map((line) => line.replace(/^[-*\d.\s"']+|["',]+$/g, "").trim())
    .filter(Boolean)
    .slice(0, 5);
}

export function parseScenesPayload(
  raw: string,
): { scenes: Scene[]; terms: string[] } | null {
  const cleaned = raw.replace(/```(?:json)?/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    const scenes = sanitizeScenes(parsed?.scenes);
    if (scenes.length === 0) return null;
    const terms = Array.isArray(parsed?.terms)
      ? parsed.terms.map(String).filter(Boolean).slice(0, 5)
      : [];
    return { scenes, terms };
  } catch {
    return null;
  }
}

export async function generateScenesAndTerms(
  subject: string,
  language: string,
  targetSeconds: number,
): Promise<{ scenes: Scene[]; script: string; terms: string[] }> {
  const openai = getOpenAI();
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const res = await openai.chat.completions.create({
    model,
    messages: [
      { role: "user", content: buildScenesPrompt(subject, language, targetSeconds) },
    ],
    response_format: { type: "json_object" },
  });
  const parsed = parseScenesPayload(res.choices[0]?.message?.content ?? "");
  if (parsed) {
    return {
      scenes: parsed.scenes,
      script: scriptFromScenes(parsed.scenes),
      terms: parsed.terms.length > 0 ? parsed.terms : [subject],
    };
  }
  // Sahne JSON'u çıkmadıysa eski düz-script yoluna düş: tek sahne olarak sar.
  const { script, terms } = await generateScriptAndTerms(
    subject,
    language,
    targetSeconds,
  );
  return {
    scenes: [{ tag: "HOOK", caption: subject.slice(0, 120), voiceover: script }],
    script,
    terms,
  };
}

export async function generateScriptAndTerms(
  subject: string,
  language: string,
  targetSeconds: number,
): Promise<{ script: string; terms: string[] }> {
  const openai = getOpenAI();
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const scriptRes = await openai.chat.completions.create({
    model,
    messages: [{ role: "user", content: buildScriptPrompt(subject, language, targetSeconds) }],
  });
  const script = (scriptRes.choices[0]?.message?.content ?? "").trim();
  if (!script) throw new Error("empty script from model");
  const termsRes = await openai.chat.completions.create({
    model,
    messages: [{ role: "user", content: buildTermsPrompt(subject, script) }],
  });
  const terms = parseTerms(termsRes.choices[0]?.message?.content ?? "");
  return { script, terms: terms.length > 0 ? terms : [subject] };
}
