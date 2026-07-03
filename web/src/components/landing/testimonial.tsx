export function Testimonial() {
  return (
    <section className="px-6 pb-[84px] md:px-12 lg:px-[72px]">
      <div className="rounded-[22px] border border-white/5 bg-panel p-8 sm:p-14">
        <blockquote className="max-w-[820px] font-display text-2xl font-bold leading-[1.3] tracking-[-0.01em] text-bone sm:text-[30px]">
          &quot;I went from posting once a week to{" "}
          <span className="text-caption">every single day</span>. Reelate does
          in five minutes what used to take me an afternoon.&quot;
        </blockquote>
        <div className="mt-[30px] flex items-center gap-3.5">
          <div
            className="h-11 w-11 rounded-full"
            style={{
              background:
                "repeating-linear-gradient(135deg, rgba(255,255,255,0.06) 0 8px, rgba(255,255,255,0.1) 8px 16px)",
            }}
          />
          <div>
            <div className="text-[15px] font-bold text-bone">Maya Chen</div>
            <div className="font-mono-data text-xs text-muted/80">
              Creator &middot; 84K followers
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
