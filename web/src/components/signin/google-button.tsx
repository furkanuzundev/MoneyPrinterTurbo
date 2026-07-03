"use client";

import { useFormStatus } from "react-dom";

export function GoogleButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={`flex w-full items-center justify-center gap-3 rounded-[13px] bg-white p-[15px] text-[15.5px] font-bold text-[#1a1a1a] shadow-[0_8px_24px_rgba(0,0,0,0.25)] transition-opacity ${
        pending ? "opacity-85" : "hover:opacity-90"
      }`}
    >
      <span className="flex h-[22px] w-[22px] flex-none items-center justify-center">
        {pending ? (
          <span className="inline-block h-[18px] w-[18px] animate-spin rounded-full border-2 border-[rgba(20,18,8,0.25)] border-t-caption-ink" />
        ) : (
          <span className="font-display text-[17px] font-extrabold text-[#4285F4]">
            G
          </span>
        )}
      </span>
      <span>{pending ? "Connecting…" : "Continue with Google"}</span>
    </button>
  );
}
