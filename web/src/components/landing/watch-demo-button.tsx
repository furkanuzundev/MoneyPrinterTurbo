"use client";

import { useSyncExternalStore } from "react";
import {
  getHeroMuted,
  getHeroMutedServer,
  playHeroWithSound,
  setHeroMuted,
  subscribeHeroMuted,
} from "./hero-video-store";

export function WatchDemoButton() {
  const muted = useSyncExternalStore(
    subscribeHeroMuted,
    getHeroMuted,
    getHeroMutedServer,
  );

  return (
    <button
      type="button"
      onClick={() => (muted ? playHeroWithSound() : setHeroMuted(true))}
      aria-pressed={!muted}
      className="inline-flex items-center gap-2.5 rounded-[13px] border border-white/10 px-[22px] py-[15px] text-base font-semibold text-bone transition-colors hover:border-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-caption"
    >
      <span aria-hidden>{muted ? "▷" : "❙❙"}</span>
      {muted ? "Play the demo with sound" : "Mute the demo"}
    </button>
  );
}
