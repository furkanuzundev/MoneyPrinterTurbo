import Link from "next/link";
import { db } from "@/db";
import {
  getFeedbackStats,
  listFeedback,
  type FeedbackBreakdownRow,
} from "@/lib/admin/queries";
import type { FeedbackTag } from "@/lib/feedback/rating";
import { StatCard } from "@/components/admin/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

const TAG_LABELS: Record<FeedbackTag, string> = {
  visuals: "Görüntüler",
  voice: "Seslendirme",
  captions: "Altyazı",
  script: "Script",
  length: "Süre",
  other: "Diğer",
};

const SOURCE_LABELS = { done_screen: "Render sonu", library: "Kütüphane" } as const;

function pct(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—";
}

function stars(rating: number): string {
  return "★".repeat(rating) + "☆".repeat(5 - rating);
}

function HBar({ label, count, max }: { label: string; count: number; max: number }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-28 shrink-0 text-muted-foreground">{label}</span>
      <div className="h-2.5 flex-1 overflow-hidden rounded bg-muted">
        <div
          className="h-full rounded bg-primary"
          style={{ width: max > 0 ? `${(count / max) * 100}%` : 0 }}
        />
      </div>
      <span className="w-8 text-right tabular-nums">{count}</span>
    </div>
  );
}

function BreakdownTable({ title, rows, suffix = "" }: { title: string; rows: FeedbackBreakdownRow[]; suffix?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="pb-2 font-medium">Değer</th>
              <th className="pb-2 text-right font-medium">Puan</th>
              <th className="pb-2 text-right font-medium">Ort.</th>
              <th className="pb-2 text-right font-medium">Beğeni</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t">
                <td className="py-1.5">{r.key}{suffix}</td>
                <td className="py-1.5 text-right tabular-nums">{r.count}</td>
                <td className="py-1.5 text-right tabular-nums">{r.average.toFixed(2)}</td>
                <td className="py-1.5 text-right tabular-nums">{pct(r.positive, r.count)}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-4 text-center text-muted-foreground">—</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

export default async function AdminFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ low?: string }>;
}) {
  const lowOnly = (await searchParams).low === "1";
  const [stats, rows] = await Promise.all([
    getFeedbackStats(db, 30),
    listFeedback(db, { lowOnly, limit: 100 }),
  ]);
  const { totals } = stats;
  const maxDist = Math.max(0, ...stats.distribution.map((d) => d.count));
  const maxTag = Math.max(0, ...stats.tags.map((t) => t.count));

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-xl font-semibold">Video puanları (30g)</h1>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Puan sayısı" value={String(totals.ratings)} />
        <StatCard
          label="Beğenme oranı"
          value={pct(totals.positive, totals.ratings)}
          hint={`4–5★: ${totals.positive} · 1–2★: ${totals.negative}`}
        />
        <StatCard
          label="Ortalama"
          value={totals.ratings ? totals.average.toFixed(2) : "—"}
          hint="Uçlara yığılır; tek başına yanıltıcı"
        />
        <StatCard
          label="Yanıt oranı"
          value={pct(totals.ratedDoneJobs, totals.doneJobs)}
          hint={`${totals.ratedDoneJobs} / ${totals.doneJobs} tamamlanan video`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Yıldız dağılımı</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {[...stats.distribution].reverse().map((d) => (
              <HBar key={d.rating} label={stars(d.rating)} count={d.count} max={maxDist} />
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Düşük puan sebepleri (1–3★)</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {stats.tags.map((t) => (
              <HBar key={t.tag} label={TAG_LABELS[t.tag] ?? t.tag} count={t.count} max={maxTag} />
            ))}
            {stats.tags.length === 0 ? (
              <p className="text-sm text-muted-foreground">Henüz sebep seçilmedi.</p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <BreakdownTable title="Dile göre (ses)" rows={stats.byLocale} />
        <BreakdownTable title="Süreye göre" rows={stats.byLength} suffix="s" />
        <BreakdownTable title="Formata göre" rows={stats.byAspect} />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">Son puanlar</h2>
          <div className="flex gap-3 text-sm">
            <Link
              href="/feedback"
              className={!lowOnly ? "font-semibold underline" : "text-muted-foreground hover:underline"}
            >
              Tümü
            </Link>
            <Link
              href="/feedback?low=1"
              className={lowOnly ? "font-semibold underline" : "text-muted-foreground hover:underline"}
            >
              Sadece 1–3★
            </Link>
          </div>
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th className="px-3 py-2 font-medium">Tarih</th>
                <th className="px-3 py-2 font-medium">Puan</th>
                <th className="px-3 py-2 font-medium">Kullanıcı</th>
                <th className="px-3 py-2 font-medium">Konu</th>
                <th className="px-3 py-2 font-medium">Sebepler</th>
                <th className="px-3 py-2 font-medium">Yorum</th>
                <th className="px-3 py-2 font-medium">Kaynak</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b align-top last:border-0 hover:bg-muted/30">
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                    {r.updatedAt.toISOString().replace("T", " ").slice(0, 16)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-amber-500">{stars(r.rating)}</td>
                  <td className="px-3 py-2">{r.userEmail ?? "—"}</td>
                  <td className="max-w-56 px-3 py-2">
                    <span className="line-clamp-2">{r.subject}</span>
                    {r.jobId === null ? (
                      <Badge variant="secondary" className="mt-1">video silindi</Badge>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {r.tags.map((t) => (
                        <Badge key={t} variant="outline">{TAG_LABELS[t] ?? t}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className="max-w-80 whitespace-pre-wrap break-words px-3 py-2 text-muted-foreground">
                    {r.comment ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">{SOURCE_LABELS[r.source] ?? r.source}</td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                    Henüz puan yok.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
