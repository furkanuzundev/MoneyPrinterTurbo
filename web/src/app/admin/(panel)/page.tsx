import { db } from "@/db";
import { getDashboardStats } from "@/lib/admin/queries";
import { StatCard } from "@/components/admin/stat-card";
import { DailyBarChart, JobsChart } from "@/components/admin/bar-chart";

export const dynamic = "force-dynamic";

function usd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default async function AdminDashboardPage() {
  const stats = await getDashboardStats(db, 30);
  const successBase = stats.totals.doneJobs30d + stats.totals.failedJobs30d;
  const successRate =
    successBase > 0
      ? `${Math.round((stats.totals.doneJobs30d / successBase) * 100)}%`
      : "—";

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Toplam kullanıcı" value={String(stats.totals.users)} />
        <StatCard label="Job (30g)" value={String(stats.totals.jobs30d)} />
        <StatCard
          label="Başarı oranı (30g)"
          value={successRate}
          hint={`${stats.totals.doneJobs30d} done / ${stats.totals.failedJobs30d} failed`}
        />
        <StatCard label="Gelir (30g)" value={usd(stats.totals.revenueCents30d)} />
        <StatCard label="Harcanan kredi (30g)" value={String(stats.totals.creditsSpent30d)} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <DailyBarChart title="Yeni kayıtlar" data={stats.signupsByDay} />
        <JobsChart title="Job'lar (duruma göre)" data={stats.jobsByDay} />
        <DailyBarChart title="Gelir" data={stats.revenueByDay} format={usd} />
        <DailyBarChart title="Harcanan kredi" data={stats.creditsSpentByDay} />
      </div>
    </div>
  );
}
