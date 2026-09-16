import { isPositive, type FeedbackTag } from "./rating";

export const STAR_LABELS: Record<number, string> = {
  1: "Not usable",
  2: "Needs work",
  3: "It's okay",
  4: "Good",
  5: "Loved it",
};

/** Yıldız seçildikten sonra açılan takip sorusu. */
export function followUpFor(rating: number): { showTags: boolean; question: string } {
  return isPositive(rating)
    ? { showTags: false, question: "What did you like most?" }
    : { showTags: true, question: "What fell short?" };
}

export function toggleTag(tags: FeedbackTag[], tag: FeedbackTag): FeedbackTag[] {
  return tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag];
}
