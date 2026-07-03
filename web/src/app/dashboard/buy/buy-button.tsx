"use client";

import { useState } from "react";
import { buttonClasses } from "@/components/ui";

export function BuyButton({ packageKey }: { packageKey: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        disabled={loading}
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
        className={buttonClasses("primary", "mt-6 w-full")}
      >
        {loading ? "Redirecting…" : "Buy"}
      </button>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </>
  );
}
