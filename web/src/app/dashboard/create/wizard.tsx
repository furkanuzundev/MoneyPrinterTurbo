"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { creditsForDuration } from "@/lib/credits/pricing";
import { VOICES } from "@/lib/jobs/options";
import { scriptFromScenes, type Scene, DEFAULT_CAPTION_STYLE, type CaptionStyle } from "@/lib/jobs/scenes";
import { formatDuration } from "@/lib/jobs/display";
import { JobLive } from "@/components/dashboard/job-live";
import { StepIndicator } from "./step-indicator";
import { BriefStep, type BriefValues } from "./brief-step";
import { ScriptStep } from "./script-step";

export function Wizard({ balance }: { balance: number }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [brief, setBrief] = useState<BriefValues>({
    subject: "",
    language: "en-US",
    voice: VOICES[0].id,
    aspect: "9:16",
    targetSeconds: 60,
  });
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [terms, setTerms] = useState<string[]>([]);
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>(DEFAULT_CAPTION_STYLE);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobDone, setJobDone] = useState(false);
  const [busy, setBusy] = useState<"script" | "job" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const script = scriptFromScenes(scenes);
  const credits = creditsForDuration(brief.targetSeconds);

  async function generateScript() {
    setBusy("script");
    setError(null);
    try {
      const res = await fetch("/api/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: brief.subject,
          language: brief.language,
          targetSeconds: brief.targetSeconds,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Script generation failed");
      setScenes(data.scenes as Scene[]);
      setTerms((data.terms as string[]) ?? []);
      setStep(2);
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
          subject: brief.subject,
          script,
          scenes,
          terms,
          aspect: brief.aspect,
          voice: brief.voice,
          targetSeconds: brief.targetSeconds,
          captionStyle,
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
      setJobId(data.jobId);
      setStep(3);
      router.refresh(); // topbar/sidebar bakiyesi düşen krediyi göstersin
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      {balance === 0 && step <= 2 && (
        <div className="mb-5 flex flex-col gap-3 rounded-[14px] border border-[rgba(217,139,122,0.3)] bg-[rgba(217,139,122,0.08)] px-[18px] py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-[#E7C3B8]">
            <strong className="text-[#F0D4C9]">
              You&apos;re out of credits.
            </strong>{" "}
            You can draft a script for free, but rendering needs at least 1
            credit.
          </div>
          <Link
            href="/dashboard/buy"
            className="whitespace-nowrap rounded-[10px] bg-caption px-4 py-[9px] text-center text-[13.5px] font-bold text-caption-ink transition-opacity hover:opacity-90"
          >
            Buy credits
          </Link>
        </div>
      )}

      <div className="flex items-start gap-3">
        {step > 1 && (
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            aria-label="Go back"
            className="mt-1 flex h-9 w-9 flex-none items-center justify-center rounded-full border border-white/10 text-muted transition-colors hover:border-white/25 hover:text-bone"
          >
            ←
          </button>
        )}
        <div>
          <h1 className="mb-1.5 font-display text-3xl font-extrabold tracking-[-0.02em] text-bone lg:text-[34px]">
            Create a video
          </h1>
          <p className="text-[15.5px] text-muted">
            One sentence in, a ready-to-post short out.
          </p>
        </div>
      </div>

      <StepIndicator
        current={jobDone ? 4 : step}
        costLabel={`costs ${credits} credit${credits > 1 ? "s" : ""}`}
      />

      {step === 1 && (
        <BriefStep
          values={brief}
          onChange={(patch) => setBrief((b) => ({ ...b, ...patch }))}
          onGenerate={generateScript}
          busy={busy === "script"}
          captionStyle={captionStyle}
          onCaptionChange={(patch) => setCaptionStyle((s) => ({ ...s, ...patch }))}
        />
      )}

      {step === 2 && (
        <ScriptStep
          subject={brief.subject}
          scenes={scenes}
          voice={brief.voice}
          aspect={brief.aspect}
          targetSeconds={brief.targetSeconds}
          balance={balance}
          busy={busy}
          onScenesChange={setScenes}
          onRegenerate={generateScript}
          onGenerate={createJob}
          onBack={() => setStep(1)}
        />
      )}

      {step >= 3 && jobId && (
        <JobLive
          jobId={jobId}
          title={brief.subject}
          aspect={brief.aspect}
          duration={`~${formatDuration(brief.targetSeconds)}`}
          initialStatus="queued"
          creditsLeft={Math.max(0, balance - credits)}
          onDone={() => setJobDone(true)}
        />
      )}

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
    </div>
  );
}
