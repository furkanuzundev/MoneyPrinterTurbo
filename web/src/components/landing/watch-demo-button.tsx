"use client";

import { HERO_VIDEO_ID } from "./hero-phone";

export function WatchDemoButton() {
  function handleClick() {
    const video = document.getElementById(HERO_VIDEO_ID);
    if (!(video instanceof HTMLVideoElement)) return;
    video.scrollIntoView({ behavior: "smooth", block: "center" });
    video.muted = false;
    video.currentTime = 0;
    void video.play();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-2.5 rounded-[13px] border border-white/10 px-[22px] py-[15px] text-base font-semibold text-bone transition-colors hover:border-white/25"
    >
      <span aria-hidden>▷</span> Watch a 30s demo
    </button>
  );
}
