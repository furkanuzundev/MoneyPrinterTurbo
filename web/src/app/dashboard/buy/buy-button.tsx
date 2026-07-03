"use client";

import { useState } from "react";

export function BuyButton({ packageKey }: { packageKey: string }) {
  const [loading, setLoading] = useState(false);
  return (
    <button
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        try {
          const res = await fetch("/api/checkout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ packageKey }),
          });
          const data = await res.json();
          if (data.url) window.location.href = data.url;
          else setLoading(false);
        } catch {
          setLoading(false);
        }
      }}
      className="w-full rounded-lg bg-white px-4 py-2 font-medium text-black hover:bg-zinc-200 disabled:opacity-50"
    >
      {loading ? "Redirecting…" : "Buy"}
    </button>
  );
}
