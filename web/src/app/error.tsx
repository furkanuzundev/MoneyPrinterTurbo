"use client";

import Link from "next/link";
import { useEffect } from "react";
import {
  ErrorShell,
  primaryActionClass,
  secondaryActionClass,
} from "@/components/error/error-shell";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[reelate] unhandled route error", error);
  }, [error]);

  return (
    <ErrorShell
      code={error.digest ? `error — ${error.digest}` : "error"}
      title="Something broke on our side"
      description="This one is on us, not on you. Try again — if it keeps happening, your videos and credits are untouched."
    >
      <button type="button" onClick={reset} className={primaryActionClass}>
        Try again
      </button>
      <Link href="/" className={secondaryActionClass}>
        Back to home
      </Link>
    </ErrorShell>
  );
}
