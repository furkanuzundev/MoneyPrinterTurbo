"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function BuyButton({ packageKey }: { packageKey: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button
        disabled={loading}
        className="mt-6 w-full"
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
        {loading ? "Redirecting…" : "Buy"}
      </Button>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </>
  );
}
