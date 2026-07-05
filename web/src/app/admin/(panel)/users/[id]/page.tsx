import { notFound } from "next/navigation";
import { db } from "@/db";
import { getUserDetail } from "@/lib/admin/queries";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/admin/stat-card";
import { AdjustCreditsForm } from "./adjust-form";

export const dynamic = "force-dynamic";

function fmtDate(d: Date): string {
  return d.toISOString().replace("T", " ").slice(0, 16);
}

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getUserDetail(db, id);
  if (!detail) notFound();
  const { user, ledger, jobs, purchases } = detail;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold">{user.email ?? user.id}</h1>
        <p className="text-sm text-muted-foreground">
          {user.name ?? "—"} · kayıt {fmtDate(user.createdAt)}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Bakiye" value={String(user.balance)} />
        <StatCard label="Job" value={String(user.jobCount)} />
        <StatCard label="Toplam ödeme" value={`$${(user.paidCents / 100).toFixed(2)}`} />
      </div>
      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Kredi ayarla</h2>
        <AdjustCreditsForm userId={user.id} />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Kredi geçmişi</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th className="px-3 py-2 font-medium">Tarih</th>
                <th className="px-3 py-2 font-medium">Tür</th>
                <th className="px-3 py-2 text-right font-medium">Δ</th>
                <th className="px-3 py-2 font-medium">Not</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((l) => (
                <tr key={l.id} className="border-b last:border-0">
                  <td className="px-3 py-2 tabular-nums">{fmtDate(l.createdAt)}</td>
                  <td className="px-3 py-2">{l.kind}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {l.delta > 0 ? `+${l.delta}` : l.delta}
                  </td>
                  <td className="px-3 py-2">{l.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Job&apos;lar</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th className="px-3 py-2 font-medium">Tarih</th>
                <th className="px-3 py-2 font-medium">Konu</th>
                <th className="px-3 py-2 font-medium">Durum</th>
                <th className="px-3 py-2 text-right font-medium">Kredi</th>
                <th className="px-3 py-2 font-medium">Hata</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} className="border-b last:border-0">
                  <td className="px-3 py-2 tabular-nums">{fmtDate(j.createdAt)}</td>
                  <td className="max-w-64 truncate px-3 py-2">{j.subject}</td>
                  <td className="px-3 py-2">
                    <Badge variant={j.status === "failed" ? "destructive" : "secondary"}>
                      {j.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{j.credits}</td>
                  <td className="max-w-64 truncate px-3 py-2 text-muted-foreground">
                    {j.error ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Satın almalar</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th className="px-3 py-2 font-medium">Tarih</th>
                <th className="px-3 py-2 font-medium">Paket</th>
                <th className="px-3 py-2 text-right font-medium">Kredi</th>
                <th className="px-3 py-2 text-right font-medium">Tutar</th>
                <th className="px-3 py-2 font-medium">Durum</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="px-3 py-2 tabular-nums">{fmtDate(p.createdAt)}</td>
                  <td className="px-3 py-2">{p.packageKey}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{p.credits}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    ${(p.amountCents / 100).toFixed(2)}
                  </td>
                  <td className="px-3 py-2">{p.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
