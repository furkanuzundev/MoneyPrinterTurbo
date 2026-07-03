"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  creditsForDuration,
  estimateDurationSeconds,
} from "@/lib/credits/pricing";
import {
  ASPECTS,
  DURATION_OPTIONS,
  LANGUAGES,
  VOICES,
} from "@/lib/jobs/options";

export function Wizard({ balance }: { balance: number }) {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [language, setLanguage] = useState<string>("en");
  const [voice, setVoice] = useState<string>(VOICES[0].id);
  const [aspect, setAspect] = useState<string>("9:16");
  const [targetSeconds, setTargetSeconds] = useState<number>(60);
  const [script, setScript] = useState("");
  const [terms, setTerms] = useState("");
  const [busy, setBusy] = useState<"script" | "job" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const estimate = useMemo(() => estimateDurationSeconds(script), [script]);
  const credits = script.trim()
    ? Math.max(1, creditsForDuration(estimate))
    : creditsForDuration(targetSeconds);
  const canAfford = balance >= credits;
  const voices = VOICES.filter((v) => v.language === language);

  async function generateScript() {
    setBusy("script");
    setError(null);
    try {
      const res = await fetch("/api/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, language, targetSeconds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Script generation failed");
      setScript(data.script);
      setTerms((data.terms as string[]).join(", "));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  async function createJob() {
    setBusy("job");
    setError(null);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          script,
          terms: terms.split(",").map((t) => t.trim()).filter(Boolean),
          aspect,
          voice,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "INSUFFICIENT_CREDITS") {
          router.push("/dashboard/buy");
          return;
        }
        throw new Error(data.error ?? "Could not start the job");
      }
      router.push(`/dashboard/jobs/${data.jobId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(null);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <label className="mb-1 block text-sm text-zinc-400">Video subject</label>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="e.g. three morning habits that changed my life"
          className="w-full rounded-lg border border-zinc-800 bg-transparent px-3 py-2"
        />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <label className="mb-1 block text-sm text-zinc-400">Length</label>
          <select
            value={targetSeconds}
            onChange={(e) => setTargetSeconds(Number(e.target.value))}
            className="w-full rounded-lg border border-zinc-800 bg-transparent px-3 py-2"
          >
            {DURATION_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s >= 60 ? `${s / 60} min` : `${s} sec`} —{" "}
                {creditsForDuration(s)} cr
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-400">Language</label>
          <select
            value={language}
            onChange={(e) => {
              setLanguage(e.target.value);
              const first = VOICES.find((v) => v.language === e.target.value);
              if (first) setVoice(first.id);
            }}
            className="w-full rounded-lg border border-zinc-800 bg-transparent px-3 py-2"
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-400">Voice</label>
          <select
            value={voice}
            onChange={(e) => setVoice(e.target.value)}
            className="w-full rounded-lg border border-zinc-800 bg-transparent px-3 py-2"
          >
            {voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-400">Format</label>
          <select
            value={aspect}
            onChange={(e) => setAspect(e.target.value)}
            className="w-full rounded-lg border border-zinc-800 bg-transparent px-3 py-2"
          >
            {ASPECTS.map((a) => (
              <option key={a} value={a}>
                {a === "9:16" ? "9:16 (TikTok/Reels)" : a === "16:9" ? "16:9 (YouTube)" : "1:1 (Square)"}
              </option>
            ))}
          </select>
        </div>
      </div>
      <button
        onClick={generateScript}
        disabled={!subject.trim() || busy !== null}
        className="rounded-lg border border-zinc-700 px-4 py-2 hover:border-zinc-500 disabled:opacity-50"
      >
        {busy === "script" ? "Writing script…" : script ? "Regenerate script" : "Generate script with AI"}
      </button>
      {script && (
        <>
          <div>
            <label className="mb-1 block text-sm text-zinc-400">
              Script (edit freely — price updates live)
            </label>
            <textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              rows={8}
              className="w-full rounded-lg border border-zinc-800 bg-transparent px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-zinc-400">
              Stock footage search terms (comma separated)
            </label>
            <input
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              className="w-full rounded-lg border border-zinc-800 bg-transparent px-3 py-2"
            />
          </div>
          <div className="rounded-xl border border-zinc-800 p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-zinc-400">
                Estimated length ~{Math.floor(estimate / 60)}:
                {String(estimate % 60).padStart(2, "0")} · Cost:{" "}
                <span className="font-semibold text-white">{credits} credits</span>{" "}
                · Balance: {balance}
              </div>
              {canAfford ? (
                <button
                  onClick={createJob}
                  disabled={busy !== null}
                  className="rounded-lg bg-white px-6 py-2 font-medium text-black hover:bg-zinc-200 disabled:opacity-50"
                >
                  {busy === "job" ? "Starting…" : `Generate video (${credits} cr)`}
                </button>
              ) : (
                <a
                  href="/dashboard/buy"
                  className="rounded-lg bg-white px-6 py-2 font-medium text-black hover:bg-zinc-200"
                >
                  Need {credits - balance} more credits — Buy
                </a>
              )}
            </div>
          </div>
        </>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
