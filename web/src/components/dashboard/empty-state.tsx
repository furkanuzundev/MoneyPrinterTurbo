import Link from "next/link";

export function EmptyState({
  title,
  message,
  cta,
  note,
}: {
  title: string;
  message: string;
  cta: string;
  note?: string;
}) {
  return (
    <div className="rounded-[20px] border border-dashed border-white/10 bg-[#120F0A] px-10 py-[60px] text-center">
      <div
        className="mx-auto mb-[22px] flex h-[88px] w-16 items-center justify-center rounded-xl border-2 border-caption/35 text-xl text-caption"
        style={{
          background:
            "repeating-linear-gradient(135deg, rgba(255,255,255,0.03) 0 10px, rgba(255,255,255,0.06) 10px 20px)",
        }}
      >
        ▶
      </div>
      <h3 className="mb-2 font-display text-2xl font-extrabold text-bone">
        {title}
      </h3>
      <p className="mx-auto mb-6 max-w-[360px] text-[15px] text-muted">
        {message}
      </p>
      <Link
        href="/dashboard/create"
        className="inline-block rounded-xl bg-caption px-6 py-[13px] text-[15px] font-bold text-caption-ink transition-opacity hover:opacity-90"
      >
        {cta}
      </Link>
      {note && (
        <div className="mt-3.5 font-mono-data text-xs text-muted/70">
          {note}
        </div>
      )}
    </div>
  );
}
