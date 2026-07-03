import OpenAI from "openai";

let client: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!client) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY is not set");
    client = new OpenAI({ apiKey: key });
  }
  return client;
}

const LANGUAGE_NAMES: Record<string, string> = { en: "English", tr: "Turkish" };

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
