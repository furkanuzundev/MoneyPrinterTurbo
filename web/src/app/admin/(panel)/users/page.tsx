import Link from "next/link";
import { db } from "@/db";
import { listUsers } from "@/lib/admin/queries";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const q = params.q ?? "";
  const page = Math.max(1, Number(params.page) || 1);
  const { rows, total } = await listUsers(db, { q, page, pageSize: PAGE_SIZE });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Kullanıcılar ({total})</h1>
        <form className="flex gap-2">
          <Input name="q" placeholder="E-posta ara…" defaultValue={q} className="w-64" />
          <Button type="submit" variant="secondary">Ara</Button>
        </form>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              <th className="px-3 py-2 font-medium">E-posta</th>
              <th className="px-3 py-2 font-medium">Ad</th>
              <th className="px-3 py-2 font-medium">Kayıt</th>
              <th className="px-3 py-2 text-right font-medium">Bakiye</th>
              <th className="px-3 py-2 text-right font-medium">Job</th>
              <th className="px-3 py-2 text-right font-medium">Ödeme</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="px-3 py-2">
                  <Link href={`/users/${u.id}`} className="underline-offset-2 hover:underline">
                    {u.email ?? u.id}
                  </Link>
                </td>
                <td className="px-3 py-2">{u.name ?? "—"}</td>
                <td className="px-3 py-2 tabular-nums">
                  {u.createdAt.toISOString().slice(0, 10)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{u.balance}</td>
                <td className="px-3 py-2 text-right tabular-nums">{u.jobCount}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  ${(u.paidCents / 100).toFixed(2)}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  Kullanıcı bulunamadı.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {pageCount > 1 ? (
        <div className="flex items-center gap-3 text-sm">
          {page > 1 ? (
            <Link href={`/users?q=${encodeURIComponent(q)}&page=${page - 1}`} className="underline">
              ← Önceki
            </Link>
          ) : null}
          <span className="text-muted-foreground">
            Sayfa {page} / {pageCount}
          </span>
          {page < pageCount ? (
            <Link href={`/users?q=${encodeURIComponent(q)}&page=${page + 1}`} className="underline">
              Sonraki →
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
