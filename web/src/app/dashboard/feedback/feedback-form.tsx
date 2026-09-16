"use client";

import { useState } from "react";
import {
  FEEDBACK_KINDS,
  MAX_MESSAGE_CHARS,
  MIN_MESSAGE_CHARS,
  type FeedbackKind,
} from "@/lib/feedback/message";

export function FeedbackForm({ page }: { page: string }) {
  const [kind, setKind] = useState<FeedbackKind>("idea");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const length = message.trim().length;
  const canSend = length >= MIN_MESSAGE_CHARS && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSend) return;
    setBusy(true);
    setError(null);
    setSent(false);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, message, page }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Couldn't send your feedback. Please try again.");
        return;
      }
      setMessage("");
      setSent(true);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-[20px] border border-white/5 bg-[#141310] p-6 sm:p-7"
    >
      <div className="mb-2 block text-sm font-semibold text-bone">
        What is it about?
      </div>
      <div className="mb-5 flex flex-wrap gap-2" role="radiogroup">
        {FEEDBACK_KINDS.map((k) => {
          const active = k.value === kind;
          return (
            <button
              key={k.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setKind(k.value)}
              className={
                active
                  ? "rounded-full border border-caption bg-caption px-4 py-1.5 text-[13.5px] font-bold text-caption-ink"
                  : "rounded-full border border-white/10 px-4 py-1.5 text-[13.5px] font-semibold text-muted transition-colors hover:border-white/25 hover:text-bone"
              }
            >
              {k.label}
            </button>
          );
        })}
      </div>

      <label
        htmlFor="feedback-message"
        className="mb-2 block text-sm font-semibold text-bone"
      >
        Your message
      </label>
      <textarea
        id="feedback-message"
        value={message}
        onChange={(e) => {
          setMessage(e.target.value);
          setSent(false);
        }}
        maxLength={MAX_MESSAGE_CHARS}
        placeholder={
          kind === "bug"
            ? "What happened, and what did you expect instead?"
            : "Tell us what's on your mind…"
        }
        className="min-h-[160px] w-full resize-y rounded-xl border border-white/10 bg-[#0E0C08] px-[15px] py-3.5 text-[15px] leading-normal text-bone outline-none placeholder:text-muted/50 focus:border-caption/50"
      />
      <div className="mt-2 flex justify-between font-mono-data text-[11.5px] text-muted/70">
        <span>
          {length < MIN_MESSAGE_CHARS
            ? `At least ${MIN_MESSAGE_CHARS} characters`
            : "We'll reply to your account email"}
        </span>
        <span>
          {message.length}/{MAX_MESSAGE_CHARS}
        </span>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={!canSend}
          className="rounded-[11px] bg-caption px-5 py-2.5 text-[14.5px] font-bold text-caption-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Sending…" : "Send feedback"}
        </button>
        {sent && (
          <p role="status" className="text-sm text-caption">
            Thanks — we read every message.
          </p>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
