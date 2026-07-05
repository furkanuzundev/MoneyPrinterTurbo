import type { DayValue, JobsDay } from "@/lib/admin/queries";

const W = 520;
const H = 140;
const PAD_TOP = 18;
const PAD_BOTTOM = 20;
const PLOT_H = H - PAD_TOP - PAD_BOTTOM;

function barGeometry(count: number) {
  const gap = 2;
  const barW = Math.max(2, (W - gap * (count - 1)) / count);
  return { gap, barW };
}

// Baseline'a oturan, üst köşeleri 2px yuvarlatılmış bar path'i.
function barPath(x: number, y: number, w: number, h: number): string {
  if (h <= 0) return "";
  const r = Math.min(2, w / 2, h);
  const bottom = y + h;
  return [
    `M ${x} ${bottom}`,
    `L ${x} ${y + r}`,
    `Q ${x} ${y} ${x + r} ${y}`,
    `L ${x + w - r} ${y}`,
    `Q ${x + w} ${y} ${x + w} ${y + r}`,
    `L ${x + w} ${bottom}`,
    "Z",
  ].join(" ");
}

function ChartFrame({
  title,
  maxLabel,
  children,
}: {
  title: string;
  maxLabel: string;
  children: React.ReactNode;
}) {
  return (
    <figure className="viz-root rounded-lg border p-4" style={{ background: "var(--viz-surface)" }}>
      <figcaption
        className="mb-2 text-sm font-medium"
        style={{ color: "var(--viz-ink)" }}
      >
        {title}
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={title}
      >
        <text
          x={0}
          y={PAD_TOP - 6}
          fontSize={10}
          fill="var(--viz-ink-muted)"
        >
          {maxLabel}
        </text>
        <line
          x1={0}
          y1={PAD_TOP}
          x2={W}
          y2={PAD_TOP}
          stroke="var(--viz-grid)"
          strokeWidth={1}
        />
        {children}
        <line
          x1={0}
          y1={H - PAD_BOTTOM}
          x2={W}
          y2={H - PAD_BOTTOM}
          stroke="var(--viz-baseline)"
          strokeWidth={1}
        />
      </svg>
    </figure>
  );
}

function endLabels(days: string[]) {
  const fmt = (d: string) => d.slice(5); // MM-DD
  return (
    <>
      <text x={0} y={H - 6} fontSize={10} fill="var(--viz-ink-muted)">
        {fmt(days[0])}
      </text>
      <text x={W} y={H - 6} fontSize={10} textAnchor="end" fill="var(--viz-ink-muted)">
        {fmt(days[days.length - 1])}
      </text>
    </>
  );
}

export function DailyBarChart({
  title,
  data,
  color = "var(--viz-series-1)",
  format = (v: number) => String(v),
}: {
  title: string;
  data: DayValue[];
  color?: string;
  format?: (v: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const { gap, barW } = barGeometry(data.length);
  return (
    <ChartFrame title={title} maxLabel={format(max)}>
      {data.map((d, i) => {
        const h = (d.value / max) * PLOT_H;
        const x = i * (barW + gap);
        return (
          <path key={d.day} d={barPath(x, H - PAD_BOTTOM - h, barW, h)} fill={color}>
            <title>{`${d.day}: ${format(d.value)}`}</title>
          </path>
        );
      })}
      {endLabels(data.map((d) => d.day))}
    </ChartFrame>
  );
}

const JOB_SERIES = [
  { key: "done", label: "Tamamlanan", color: "var(--viz-status-good)" },
  { key: "failed", label: "Başarısız", color: "var(--viz-status-critical)" },
  { key: "inProgress", label: "Devam eden", color: "var(--viz-series-1)" },
] as const;

const SEGMENT_GAP = 2;

export function JobsChart({ title, data }: { title: string; data: JobsDay[] }) {
  const max = Math.max(1, ...data.map((d) => d.done + d.failed + d.inProgress));
  const { gap, barW } = barGeometry(data.length);
  return (
    <div>
      <ChartFrame title={title} maxLabel={String(max)}>
        {data.map((d, i) => {
          const x = i * (barW + gap);
          const total = d.done + d.failed + d.inProgress;
          const nonZeroCount = JOB_SERIES.filter((s) => d[s.key] > 0).length;
          // Segmentler arası 2px yüzey boşluğu bar'ın toplam yüksekliğine dahil
          // edilir (gap sayısı kadar PLOT_H'den düşülür), aksi halde en üstteki
          // segment gap'ler kadar PAD_TOP'un üzerine taşıp üst grid çizgisiyle
          // çakışırdı (örn. gün toplamı == max ve üç segment de sıfırdan büyükse).
          const reservedGapPx = Math.max(0, nonZeroCount - 1) * SEGMENT_GAP;
          const availablePlotH = Math.max(0, PLOT_H - reservedGapPx);
          let yBottom = H - PAD_BOTTOM;
          return JOB_SERIES.map((s) => {
            const v = d[s.key];
            const h = total > 0 ? (v / max) * availablePlotH : 0;
            if (v === 0) return null;
            const y = yBottom - h;
            yBottom = y - SEGMENT_GAP;
            return (
              <path key={`${d.day}-${s.key}`} d={barPath(x, y, barW, h)} fill={s.color}>
                <title>{`${d.day} — ${s.label}: ${v}`}</title>
              </path>
            );
          });
        })}
        {endLabels(data.map((d) => d.day))}
      </ChartFrame>
      <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
        {JOB_SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: s.color }}
            />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
