"use client";

import { useEffect, useState } from "react";
import {
  COMMENT_MAX,
  FEEDBACK_TAGS,
  type FeedbackSource,
  type FeedbackTag,
  isPositive,
} from "@/lib/feedback/rating";
import { followUpFor, STAR_LABELS, toggleTag } from "@/lib/feedback/rating-ui";

type Phase = "loading" | "idle" | "editing" | "sent";

// Videoya puan: yıldız tıklaması anında kaydedilir (en ucuz sinyal kaybolmasın),
// sebep etiketleri ve yorum isteğe bağlı ikinci adım. Modal değil, sayfa içi.
export function VideoRating({
  jobId,
  source,
  nudge = false,
}: {
  jobId: string;
  source: FeedbackSource;
  /** Video bitti / indirildi: henüz puan yoksa dikkat çek. */
  nudge?: boolean;
}) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [tags, setTags] = useState<FeedbackTag[]>([]);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/jobs/${jobId}/feedback`)
      .then((res) => (res.ok ? res.json() : { feedback: null }))
      .then(({ feedback }) => {
        if (cancelled) return;
        if (feedback) {
          setRating(feedback.rating);
          setTags(feedback.tags);
          setComment(feedback.comment ?? "");
          setPhase("sent");
        } else {
          setPhase("idle");
        }
      })
      .catch(() => !cancelled && setPhase("idle"));
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  async function save(next: { rating: number; tags: FeedbackTag[]; comment: string }) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/feedback`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...next, source }),
      });
      if (!res.ok) throw new Error(`feedback failed (${res.status})`);
      return true;
    } catch {
      setError("Couldn't save your rating. Try again.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function pickStar(value: number) {
    const nextTags = isPositive(value) ? [] : tags;
    setRating(value);
    setTags(nextTags);
    setPhase("editing");
    await save({ rating: value, tags: nextTags, comment });
  }

  async function send() {
    if (await save({ rating, tags, comment })) setPhase("sent");
  }

  if (phase === "loading") {
    return <div className="h-[74px] rounded-2xl border border-white/5 bg-white/[0.02]" />;
  }

  const shown = hover || rating;
  const followUp = rating ? followUpFor(rating) : null;
  const highlight = nudge && rating === 0;

  return (
    <div
      className={`rounded-2xl border p-4 transition-colors ${
        highlight
          ? "reNudge border-caption/50 bg-caption/[0.06]"
          : "border-white/10 bg-white/[0.02]"
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-sm font-semibold text-bone">
          {phase === "sent" ? "Your rating" : "How did this video turn out?"}
        </span>
        <div
          role="radiogroup"
          aria-label="Rate this video"
          className="flex items-center gap-0.5"
          onMouseLeave={() => setHover(0)}
        >
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={rating === value}
              aria-label={`${value} star${value > 1 ? "s" : ""}: ${STAR_LABELS[value]}`}
              disabled={saving}
              onMouseEnter={() => setHover(value)}
              onFocus={() => setHover(value)}
              onBlur={() => setHover(0)}
              onClick={() => pickStar(value)}
              className={`p-1 text-[26px] leading-none transition-transform hover:scale-110 disabled:cursor-wait ${
                value <= shown ? "text-caption" : "text-white/20"
              }`}
            >
              ★
            </button>
          ))}
        </div>
        {shown > 0 && (
          <span className="font-mono-data text-[11px] uppercase tracking-[0.06em] text-muted">
            {STAR_LABELS[shown]}
          </span>
        )}
      </div>

      {phase === "editing" && followUp && (
        <div className="mt-3.5 border-t border-white/5 pt-3.5">
          <p className="mb-2.5 text-[13px] font-semibold text-bone/90">
            {followUp.question}{" "}
            <span className="font-normal text-muted">(optional)</span>
          </p>
          {followUp.showTags && (
            <div className="mb-3 flex flex-wrap gap-2">
              {FEEDBACK_TAGS.map((tag) => {
                const active = tags.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setTags((t) => toggleTag(t, tag.id))}
                    className={`rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                      active
                        ? "border-caption bg-caption/15 text-caption"
                        : "border-white/10 text-bone/75 hover:border-white/25"
                    }`}
                  >
                    {tag.label}
                  </button>
                );
              })}
            </div>
          )}
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={COMMENT_MAX}
            rows={2}
            placeholder="Tell us more…"
            aria-label="Comment"
            className="w-full resize-none rounded-[11px] border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-bone placeholder:text-muted/60 focus:border-caption/60 focus:outline-none"
          />
          <div className="mt-2.5 flex items-center gap-3">
            <button
              type="button"
              onClick={send}
              disabled={saving}
              className="rounded-[10px] bg-caption px-4 py-2 text-[13px] font-bold text-caption-ink transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Send feedback"}
            </button>
            <button
              type="button"
              onClick={() => setPhase("sent")}
              className="text-[13px] font-semibold text-muted transition-colors hover:text-bone"
            >
              Skip
            </button>
          </div>
        </div>
      )}

      {phase === "sent" && (
        <p className="mt-2 text-[13px] text-muted">
          Thanks, this helps us make better videos.{" "}
          <button
            type="button"
            onClick={() => setPhase("editing")}
            className="font-semibold text-caption-dim transition-colors hover:text-caption"
          >
            {comment || tags.length ? "Edit feedback" : "Add a comment"}
          </button>
        </p>
      )}

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
