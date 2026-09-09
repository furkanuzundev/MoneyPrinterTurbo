import { formatDuration } from "@/lib/jobs/options";
import {
  DURATION_TIERS,
  WELCOME_BONUS_CREDITS,
  creditsForDuration,
} from "./pricing";

// Kullanıcıya gösterilen her kredi ifadesi buradan gelir ve DURATION_TIERS'ten
// türetilir. Daha önce pazarlama "One credit ≈ one short video" diyordu, oysa
// varsayılan 60 sn'lik video 2 kredi tutuyor — yani 5 hoşgeldin kredisi 5 değil
// 2 video demek. Fiyat kademesi değişirse bu metinler kendiliğinden düzelir.

/** Wizard varsayılanı (dashboard/create/wizard.tsx). Video sayımlarında taban. */
export const REFERENCE_SECONDS = 60;
export const CREDITS_PER_REFERENCE_VIDEO = creditsForDuration(REFERENCE_SECONDS);

function creditsLabel(credits: number): string {
  return `${credits} credit${credits === 1 ? "" : "s"}`;
}

export const CREDIT_COST_ROWS = DURATION_TIERS.map((tier) => ({
  seconds: tier.seconds,
  label: formatDuration(tier.seconds),
  credits: tier.credits,
  creditsLabel: creditsLabel(tier.credits),
}));

export const CREDITS_TAGLINE =
  "Credits never expire. A video costs 1 credit per 30 seconds.";

export const CREDITS_REFUND_NOTE =
  "If a render fails, your credits are returned automatically.";

export const CREDITS_FREE_NOTE =
  "Writing and rewriting the script is free. Editing the captions on a finished video and re-rendering it is free too.";

export const CREDITS_RETRY_NOTE =
  "A failed render is refunded, but trying again starts a new video and costs credits again.";

export const WELCOME_NOTE = `${WELCOME_BONUS_CREDITS} free credits to start — that is two 60-second videos, or five 30-second ones.`;

/** "50 credits · 25 × 60s videos" — paket kartlarındaki yanlış 1:1 sayımın yerine. */
export function formatCreditsForPack(credits: number): string {
  const videos = Math.floor(credits / CREDITS_PER_REFERENCE_VIDEO);
  const noun = videos === 1 ? "video" : "videos";
  return `${creditsLabel(credits)} · ${videos} × ${formatDuration(REFERENCE_SECONDS)} ${noun}`;
}

/** Bir 60 sn'lik videonun kuruş fiyatı — kredi başına fiyat değil. */
export function perVideoCents(amountCents: number, credits: number): number {
  return (amountCents / credits) * CREDITS_PER_REFERENCE_VIDEO;
}
