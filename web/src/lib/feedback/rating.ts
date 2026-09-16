// Video puanlama: istemci ve API'nin paylaştığı sözlük + doğrulama.
// Etiketler pipeline parçalarına birebir denk gelir (materyal, TTS, altyazı,
// script, süre) ki düşük puanların hangi aşamadan geldiği ölçülebilsin.

export const FEEDBACK_TAGS = [
  { id: "visuals", label: "Visuals didn't fit" },
  { id: "voice", label: "Voiceover" },
  { id: "captions", label: "Captions" },
  { id: "script", label: "Script" },
  { id: "length", label: "Length" },
  { id: "other", label: "Something else" },
] as const;

export type FeedbackTag = (typeof FEEDBACK_TAGS)[number]["id"];

export const FEEDBACK_SOURCES = ["done_screen", "library"] as const;
export type FeedbackSource = (typeof FEEDBACK_SOURCES)[number];

export const COMMENT_MAX = 1000;

export type FeedbackInput = {
  rating: number;
  tags: FeedbackTag[];
  comment: string | null;
  source: FeedbackSource;
};

/** Raporlamada 4–5 yıldız "beğendi" sayılır; ortalama tek başına yanıltıcı. */
export function isPositive(rating: number): boolean {
  return rating >= 4;
}

const TAG_IDS = new Set<string>(FEEDBACK_TAGS.map((t) => t.id));

export function parseFeedbackInput(
  body: unknown,
): { ok: true; value: FeedbackInput } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Invalid body" };
  }
  const raw = body as Record<string, unknown>;

  const rating = raw.rating;
  if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { ok: false, error: "Rating must be a whole number from 1 to 5" };
  }
  if (!FEEDBACK_SOURCES.includes(raw.source as FeedbackSource)) {
    return { ok: false, error: "Invalid source" };
  }

  // Sebep etiketleri yalnız olumsuz/nötr puanda anlamlı.
  const tags =
    !isPositive(rating) && Array.isArray(raw.tags)
      ? [...new Set(raw.tags.filter((t): t is FeedbackTag => typeof t === "string" && TAG_IDS.has(t)))]
      : [];

  const trimmed = typeof raw.comment === "string" ? raw.comment.trim() : "";
  const comment = trimmed ? trimmed.slice(0, COMMENT_MAX) : null;

  return {
    ok: true,
    value: { rating, tags, comment, source: raw.source as FeedbackSource },
  };
}
