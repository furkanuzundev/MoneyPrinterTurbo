"use client";

import { useState } from "react";

export function BuyButton({
  packageKey,
  label,
  featured,
}: {
  packageKey: string;
  label: string;
  featured: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        disabled={loading}
        className={`mt-6 w-full rounded-xl text-center text-[14.5px] font-bold transition-opacity disabled:opacity-60 ${
          featured
            ? "bg-caption p-3.5 text-caption-ink hover:opacity-90"
            : "border border-white/15 p-[13px] text-bone hover:border-white/30"
        }`}
        onClick={async () => {
          setLoading(true);
          setError(null);
          try {
            const res = await fetch("/api/checkout", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ packageKey }),
            });
            const data = await res.json();
            if (res.ok && data.url) {
              window.location.href = data.url;
            } else {
              setError(data.error ?? "Something went wrong. Please try again.");
              setLoading(false);
            }
          } catch {
            setError("Something went wrong. Please try again.");
            setLoading(false);
          }
        }}
      >
        {loading ? "Redirecting…" : `Buy ${label}`}
      </button>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </>
  );
}
