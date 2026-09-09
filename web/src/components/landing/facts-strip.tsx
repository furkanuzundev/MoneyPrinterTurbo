import { ASPECTS, LANGUAGES, VOICES } from "@/lib/jobs/options";
import { CREDIT_COST_ROWS } from "@/lib/credits/copy";

// Uydurma bir testimonial'ın (isim + takipçi sayısı + placeholder avatar)
// yerini alır. Her sayı koddaki sabitten türetilir; elle güncellenmesi
// gerekmediği için yanlışlanamaz.
const FACTS = [
  { value: `${VOICES.length}`, label: "voices you can preview before rendering" },
  { value: `${LANGUAGES.length}`, label: "languages, script and voiceover" },
  { value: `${ASPECTS.length}`, label: "aspect ratios — 9:16, 1:1, 16:9" },
  {
    value: `${CREDIT_COST_ROWS.length}`,
    label: `lengths — ${CREDIT_COST_ROWS.map((r) => r.label).join(", ")}`,
  },
];

export function FactsStrip() {
  return (
    <section className="px-6 pb-[84px] md:px-12 lg:px-[72px]">
      <div className="rounded-[22px] border border-white/5 bg-panel p-8 sm:p-12">
        <h2 className="mb-2 font-display text-2xl font-extrabold tracking-[-0.02em] text-bone sm:text-[30px]">
          What you actually get
        </h2>
        <p className="mb-9 max-w-[520px] text-[15px] text-muted">
          No waitlist, no sales call. These are the options in the editor today.
        </p>
        <dl className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {FACTS.map((fact) => (
            <div key={fact.label}>
              <dt className="font-display text-[40px] font-extrabold leading-none text-caption">
                {fact.value}
              </dt>
              <dd className="mt-2.5 text-[14.5px] leading-snug text-muted">
                {fact.label}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
