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
import { Card, CaptionChip } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
      <Card className="space-y-6 border-0">
        <div>
          <Label className="mb-1 block text-sm text-muted">Video subject</Label>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. three morning habits that changed my life"
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label className="mb-1 block text-sm text-muted">Length</Label>
            <Select
              value={String(targetSeconds)}
              onValueChange={(value) => setTargetSeconds(Number(value))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DURATION_OPTIONS.map((s) => (
                  <SelectItem key={s} value={String(s)}>
                    {s >= 60 ? `${s / 60} min` : `${s} sec`} —{" "}
                    {creditsForDuration(s)} cr
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1 block text-sm text-muted">Language</Label>
            <Select
              value={language}
              onValueChange={(value) => {
                setLanguage(value);
                const first = VOICES.find((v) => v.language === value);
                if (first) setVoice(first.id);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((l) => (
                  <SelectItem key={l.code} value={l.code}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1 block text-sm text-muted">Voice</Label>
            <Select value={voice} onValueChange={(value) => setVoice(value)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {voices.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1 block text-sm text-muted">Format</Label>
            <Select value={aspect} onValueChange={(value) => setAspect(value)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASPECTS.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a === "9:16" ? "9:16 (TikTok/Reels)" : a === "16:9" ? "16:9 (YouTube)" : "1:1 (Square)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button
          onClick={generateScript}
          disabled={!subject.trim() || busy !== null}
          variant="secondary"
        >
          {busy === "script" ? "Writing script…" : script ? "Regenerate script" : "Generate script with AI"}
        </Button>

        {script && (
          <>
            <div>
              <Label className="mb-1 block text-sm text-muted">
                Stock footage search terms (comma separated)
              </Label>
              <Input
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
              />
            </div>

            <div className="-mx-6 -mb-6 flex flex-wrap items-center justify-between gap-4 rounded-b-2xl bg-elevated px-6 py-4">
              <div className="font-mono-data text-sm text-muted">
                ~{Math.floor(estimate / 60)}:
                {String(estimate % 60).padStart(2, "0")} ·{" "}
                <CaptionChip>{credits} credits</CaptionChip>
              </div>
              {canAfford ? (
                <Button onClick={createJob} disabled={busy !== null} className="px-6 py-2">
                  {busy === "job" ? "Starting…" : `Generate video (${credits} cr)`}
                </Button>
              ) : (
                <Button asChild className="px-6 py-2">
                  <a href="/dashboard/buy">
                    Need {credits - balance} more credits — Buy
                  </a>
                </Button>
              )}
            </div>
          </>
        )}
      </Card>

      {script && (
        <Card className="space-y-1 border-0">
          <Label className="mb-1 block text-sm text-muted">
            Script (edit freely — price updates live)
          </Label>
          <Textarea
            value={script}
            onChange={(e) => setScript(e.target.value)}
            rows={12}
            className="min-h-[240px] font-sans leading-relaxed"
          />
        </Card>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
