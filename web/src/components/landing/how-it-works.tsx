const STEPS = [
  {
    number: "01",
    title: "Type a topic",
    body: 'One sentence — "3 morning habits that changed my life." Pick length, voice and format.',
  },
  {
    number: "02",
    title: "AI builds the short",
    body: "Script, natural voiceover, matched stock footage and burned-in captions — assembled automatically.",
  },
  {
    number: "03",
    title: "Download & post",
    body: "Preview, tweak the caption if you like, export in 9:16 and post. No editor to learn.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="px-6 py-20 md:px-12 lg:px-[72px]">
      <div className="mb-11 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-3 font-mono-data text-[12.5px] uppercase tracking-[0.1em] text-caption-dim">
            How it works
          </div>
          <h2 className="font-display text-3xl font-extrabold tracking-[-0.02em] text-bone lg:text-[42px]">
            Three fields. Five minutes. Done.
          </h2>
        </div>
        <p className="max-w-[300px] text-[15px] text-muted">
          You bring the idea. Reelate handles script, voice, footage and
          captions end-to-end.
        </p>
      </div>
      <div className="grid gap-5 sm:grid-cols-3">
        {STEPS.map((step) => (
          <div
            key={step.number}
            className="rounded-[18px] border border-white/5 bg-panel p-7"
          >
            <div className="mb-[18px] font-mono-data text-[13px] text-caption">
              {step.number}
            </div>
            <div className="mb-2.5 font-display text-[22px] font-bold text-bone">
              {step.title}
            </div>
            <p className="text-[15px] text-muted">{step.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
