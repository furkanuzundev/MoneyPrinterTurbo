// Spec Bölüm 5: 1 kredi = 30 sn hedef süre; kademeler ve 2.5 kelime/sn tahmini.
export const DURATION_TIERS = [
  { seconds: 30, credits: 1 },
  { seconds: 60, credits: 2 },
  { seconds: 90, credits: 3 },
  { seconds: 180, credits: 6 },
] as const satisfies readonly { seconds: number; credits: number }[];

export const WELCOME_BONUS_CREDITS = 2;

const WORDS_PER_SECOND = 2.5;

export function creditsForDuration(seconds: number): number {
  for (const tier of DURATION_TIERS) {
    if (seconds <= tier.seconds) return tier.credits;
  }
  return Math.ceil(seconds / 30);
}

export function estimateDurationSeconds(script: string): number {
  const words = script.trim().split(/\s+/).filter(Boolean).length;
  return Math.ceil(words / WORDS_PER_SECOND);
}
