const STEPS = ["Brief", "Script", "Render", "Done"];

export function StepIndicator({
  current,
  costLabel,
}: {
  current: number; // 1-4
  costLabel: string;
}) {
  return (
    <div className="my-7 flex flex-wrap items-center gap-2">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const done = current > n;
        const active = current === n;
        return (
          <div key={label} className="flex items-center gap-2">
            <div className="flex items-center gap-2.5">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full font-mono-data text-[13px] font-bold ${
                  done || active
                    ? "bg-caption text-caption-ink"
                    : "border border-white/15 text-muted/70"
                }`}
              >
                {done ? "✓" : n}
              </div>
              <span
                className={`text-[13.5px] font-semibold ${
                  done || active ? "text-bone" : "text-muted/70"
                }`}
              >
                {label}
              </span>
            </div>
            <div className="hidden h-px w-[34px] bg-white/10 sm:block" />
          </div>
        );
      })}
      <span className="ml-0.5 font-mono-data text-xs text-muted/70">
        {costLabel}
      </span>
    </div>
  );
}
