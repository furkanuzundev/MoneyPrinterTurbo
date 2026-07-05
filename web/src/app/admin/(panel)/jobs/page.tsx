import Link from "next/link";
import { db } from "@/db";
import { listJobs } from "@/lib/admin/queries";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const STATUSES = ["queued", "rendering", "done", "failed"] as const;

function badgeVariant(status: string): "default" | "secondary" | "destructive" {
  if (status === "failed") return "destructive";
  if (status === "done") return "default";
  return "secondary";
}

export default async function AdminJobsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const active = STATUSES.includes(status as (typeof STATUSES)[number])
    ? status
    : undefined;
  const jobs = await listJobs(db, { status: active, limit: 100 });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Jobs</h1>
      <div className="flex flex-wrap gap-2 text-sm">
        <Link
          href="/jobs"
          className={!active ? "font-semibold underline" : "text-muted-foreground hover:underline"}
        >
          Tümü
        </Link>
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={`/jobs?status=${s}`}
            className={active === s ? "font-semibold underline" : "text-muted-foreground hover:underline"}
          >
            {s}
          </Link>
        ))}
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              <th className="px-3 py-2 font-medium">Oluşturma</th>
              <th className="px-3 py-2 font-medium">Kullanıcı</th>
              <th className="px-3 py-2 font-medium">Konu</th>
              <th className="px-3 py-2 font-medium">Durum</th>
              <th className="px-3 py-2 text-right font-medium">Süre hedefi</th>
              <th className="px-3 py-2 font-medium">Son güncelleme</th>
              <th className="px-3 py-2 font-medium">Hata</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="px-3 py-2 tabular-nums">
                  {j.createdAt.toISOString().replace("T", " ").slice(0, 16)}
                </td>
                <td className="px-3 py-2">{j.userEmail ?? "—"}</td>
                <td className="max-w-56 truncate px-3 py-2">{j.subject}</td>
                <td className="px-3 py-2">
                  <Badge variant={badgeVariant(j.status)}>{j.status}</Badge>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{j.targetSeconds}s</td>
                <td className="px-3 py-2 tabular-nums">
                  {j.updatedAt.toISOString().replace("T", " ").slice(0, 16)}
                </td>
                <td className="max-w-72 truncate px-3 py-2 text-muted-foreground" title={j.error ?? undefined}>
                  {j.error ?? "—"}
                </td>
              </tr>
            ))}
            {jobs.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                  Job bulunamadı.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
