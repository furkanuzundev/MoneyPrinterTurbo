export function FeatureBento() {
  return (
    <section id="features" className="px-6 pb-20 md:px-12 lg:px-[72px]">
      <div className="grid auto-rows-[minmax(180px,auto)] gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col justify-between rounded-[20px] border border-white/5 bg-gradient-to-br from-[#1D1A12] to-[#141209] p-6 sm:p-[34px] lg:row-span-2">
          <div>
            <div className="mb-3.5 font-mono-data text-xs uppercase tracking-[0.08em] text-caption-dim">
              Script engine
            </div>
            <div className="mb-3 font-display text-[26px] font-extrabold leading-[1.05] tracking-[-0.02em] text-bone sm:text-[30px]">
              Hooks that actually stop the scroll
            </div>
            <p className="max-w-[360px] text-[15px] text-muted">
              Trained on high-retention short-form structure. Every script
              opens with a hook and closes with a call to action.
            </p>
          </div>
          <div className="mt-[26px] rounded-xl border border-white/5 bg-[#0E0C08] p-[18px] font-mono-data text-[13px] leading-[1.7] text-bone/80">
            <span className="text-caption">HOOK</span> &quot;Most people waste
            their first hour awake.&quot;
            <br />
            <span className="text-muted/70">BODY</span> Three habits, thirty
            seconds each&hellip;
            <br />
            <span className="text-caption">CTA</span> &quot;Follow for one
            habit a day.&quot;
          </div>
        </div>
        <div className="rounded-[20px] border border-white/5 bg-panel p-[30px]">
          <div className="mb-2 font-display text-[22px] font-bold text-bone">
            40+ natural voices
          </div>
          <p className="mb-4 text-[15px] text-muted">
            Male, female, calm, energetic &mdash; in 20+ languages.
          </p>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-white/10 px-[11px] py-[5px] font-mono-data text-xs text-bone">
              Jenny &middot; US
            </span>
            <span className="rounded-full border border-white/10 px-[11px] py-[5px] font-mono-data text-xs text-bone">
              Adam &middot; UK
            </span>
            <span className="rounded-full bg-caption px-[11px] py-[5px] font-mono-data text-xs text-caption-ink">
              +38
            </span>
          </div>
        </div>
        <div className="rounded-[20px] border border-white/5 bg-panel p-[30px]">
          <div className="mb-2 font-display text-[22px] font-bold text-bone">
            Auto-matched footage
          </div>
          <p className="text-[15px] text-muted">
            Millions of licensed stock clips, picked to match each line of your
            script.
          </p>
        </div>
      </div>
    </section>
  );
}
