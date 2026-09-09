import { CREDIT_COST_ROWS } from "@/lib/credits/copy";
import {
  BG_COLOR_PRESETS,
  POSITIONS,
  SIZES,
  TEXT_COLOR_PRESETS,
  captionPreviewStyles,
} from "@/lib/jobs/caption-ui";
import { ASPECTS, LANGUAGES, VOICES } from "@/lib/jobs/options";

/**
 * Landing sayfası üretici/editör ekranını hiç göstermiyordu; ziyaretçi script,
 * ses, altyazı ve sahnelerin değiştirilip değiştirilemediğini göremiyordu.
 *
 * Bu bölüm gerçek editörün panellerini birebir sabitlerden (options.ts,
 * caption-ui.ts, credits/copy.ts) yeniden çizer — screenshot yok, dolayısıyla
 * UI değişince bayatlamaz. Etkileşimsizdir: çalışıyormuş gibi görünen sahte bir
 * editör, kaldırdığımız uydurma testimonial ile aynı güven ihlali olurdu.
 *
 * BURADA İDDİA EDİLMEYECEKLER (üründe yok): stok/footage kaynağı seçimi,
 * font seçici, müzik/BGM, sahne başına klip değiştirme, zaman çizelgesi.
 */

const CAPTION_STYLE = {
  size: "md",
  position: "bottom",
  textColor: "#F4C63A",
  bgColor: "none",
} as const;

const SCENES = [
  {
    tag: "HOOK",
    caption: "Most mornings are wasted",
    voiceover: "Most people waste their first hour awake.",
  },
  {
    tag: "SCENE 1",
    caption: "Sunlight first",
    voiceover: "Get sunlight before you get your phone.",
  },
  {
    tag: "CTA",
    caption: "One habit a day",
    voiceover: "Follow for one habit a day.",
  },
];

const SAMPLE_VOICES = VOICES.slice(0, 3);

export function InsideTheEditor() {
  const { pos, color, sizePx } = captionPreviewStyles(CAPTION_STYLE);

  return (
    <section
      id="editor"
      className="scroll-mt-[72px] px-6 pb-20 md:px-12 lg:px-[72px]"
    >
      <div className="mb-3 font-mono-data text-[12.5px] uppercase tracking-[0.1em] text-caption-dim">
        Inside the editor
      </div>
      <h2 className="mb-2.5 font-display text-3xl font-extrabold tracking-[-0.02em] text-bone lg:text-[42px]">
        You can change all of it
      </h2>
      <p className="mb-9 max-w-[540px] text-base text-muted">
        The script, the voice, the caption style and every scene &mdash; all
        editable before you spend a credit, and the captions again afterwards.
      </p>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        {/* Sol: brief paneli */}
        <div className="rounded-[20px] border border-white/5 bg-[#141310] p-6 sm:p-7">
          <Field label="What's the video about?">
            <div className="rounded-xl border border-white/10 bg-[#0E0C08] px-[15px] py-3.5 text-[15px] text-bone/85">
              three morning habits that changed my life
            </div>
          </Field>

          <Divider />

          <Field label="Length">
            <div className="flex gap-2 rounded-xl border border-white/10 bg-[#0E0C08] p-[5px]">
              {CREDIT_COST_ROWS.map((row, i) => (
                <div
                  key={row.seconds}
                  className={`flex-1 rounded-[9px] px-1.5 py-2.5 text-center text-sm font-semibold ${
                    i === 1
                      ? "bg-caption text-caption-ink"
                      : "text-muted"
                  }`}
                >
                  <span className="block">{row.label}</span>
                  <span
                    className={`mt-0.5 block font-mono-data text-[10.5px] font-normal ${
                      i === 1 ? "text-caption-ink/70" : "text-muted/70"
                    }`}
                  >
                    {row.credits} cr
                  </span>
                </div>
              ))}
            </div>
          </Field>

          <Field label={`Voice — ${VOICES.length} to choose from`}>
            <div className="grid gap-2 sm:grid-cols-3">
              {SAMPLE_VOICES.map((voice, i) => (
                <div
                  key={voice.id}
                  className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-[13.5px] ${
                    i === 0
                      ? "border-caption/50 bg-caption/5 text-bone"
                      : "border-white/10 text-muted"
                  }`}
                >
                  <span className="truncate">{voice.label.split(" (")[0]}</span>
                  <span
                    className="flex h-6 w-6 flex-none items-center justify-center rounded-full border border-white/15 text-[9px] text-caption"
                    aria-hidden
                  >
                    ▶
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-2 font-mono-data text-[11.5px] text-muted/70">
              Preview any voice before rendering &middot; {LANGUAGES.length}{" "}
              languages
            </p>
          </Field>

          <Field label="Format">
            <div className="flex gap-2">
              {ASPECTS.map((aspect, i) => (
                <div
                  key={aspect}
                  className={`flex-1 rounded-xl border px-3 py-2.5 text-center text-[13.5px] font-semibold ${
                    i === 0
                      ? "border-caption/50 bg-caption/5 text-bone"
                      : "border-white/10 text-muted"
                  }`}
                >
                  {aspect}
                </div>
              ))}
            </div>
          </Field>

          <Divider />

          <Field label="Caption style">
            <div className="flex flex-wrap items-center gap-4">
              <ChipRow
                items={SIZES.map((s) => s.label)}
                activeIndex={1}
                title="Size"
              />
              <ChipRow
                items={POSITIONS.map((p) => p.label)}
                activeIndex={2}
                title="Position"
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-4">
              <SwatchRow
                title="Text"
                colors={TEXT_COLOR_PRESETS.map((c) => c.hex)}
                activeIndex={2}
              />
              <SwatchRow
                title="Background"
                colors={BG_COLOR_PRESETS.map((c) => c.hex)}
                activeIndex={0}
              />
            </div>
          </Field>
        </div>

        {/* Sağ: canlı altyazı önizlemesi — wizard ile aynı fonksiyon */}
        <div className="flex flex-col gap-5">
          <div className="rounded-[20px] border border-white/5 bg-[#141310] p-5">
            <div className="mb-3.5 font-mono-data text-[11px] uppercase tracking-[0.08em] text-muted">
              Live preview
            </div>
            <div className="relative mx-auto aspect-[9/16] w-full max-w-[190px] overflow-hidden rounded-[14px] bg-gradient-to-b from-[#26221A] to-[#0E0C08]">
              <div
                className="absolute inset-x-3 rounded-md px-2 py-1 text-center font-bold leading-tight"
                style={{
                  ...pos,
                  ...color,
                  fontSize: `${sizePx * 0.45}px`,
                }}
              >
                {SCENES[0].caption}
              </div>
            </div>
          </div>

          <div className="rounded-[20px] border border-white/5 bg-[#141310] p-5">
            <div className="mb-3.5 font-mono-data text-[11px] uppercase tracking-[0.08em] text-muted">
              Scenes — edit each one
            </div>
            <div className="flex flex-col gap-3">
              {SCENES.map((scene) => (
                <div
                  key={scene.tag}
                  className="rounded-xl border border-white/8 bg-[#0E0C08] p-3"
                >
                  <span className="font-mono-data text-[10px] font-bold tracking-[0.07em] text-caption">
                    {scene.tag}
                  </span>
                  <div className="mt-1.5 text-[13px] font-semibold text-bone">
                    {scene.caption}
                  </div>
                  <div className="mt-1 text-[12.5px] leading-snug text-muted">
                    {scene.voiceover}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3.5 font-mono-data text-[11px] leading-relaxed text-muted/70">
              Rewriting the script is free. So is changing captions on a
              finished video and re-rendering it.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-[22px] first:mt-0">
      <div className="mb-[11px] text-sm font-semibold text-bone">{label}</div>
      {children}
    </div>
  );
}

function Divider() {
  return <div className="my-6 h-px bg-white/5" />;
}

function ChipRow({
  items,
  activeIndex,
  title,
}: {
  items: string[];
  activeIndex: number;
  title: string;
}) {
  return (
    <div>
      <div className="mb-1.5 font-mono-data text-[10.5px] uppercase tracking-[0.07em] text-muted/70">
        {title}
      </div>
      <div className="flex gap-1.5">
        {items.map((item, i) => (
          <span
            key={item}
            className={`rounded-[9px] border px-3 py-1.5 text-[12.5px] font-semibold ${
              i === activeIndex
                ? "border-caption bg-caption text-caption-ink"
                : "border-white/10 text-muted"
            }`}
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function SwatchRow({
  title,
  colors,
  activeIndex,
}: {
  title: string;
  colors: (string | "none")[];
  activeIndex: number;
}) {
  return (
    <div>
      <div className="mb-1.5 font-mono-data text-[10.5px] uppercase tracking-[0.07em] text-muted/70">
        {title}
      </div>
      <div className="flex gap-1.5">
        {colors.map((hex, i) => (
          <span
            key={hex}
            aria-hidden
            className={`h-6 w-6 rounded-full border-2 ${
              i === activeIndex ? "border-caption" : "border-white/15"
            }`}
            style={
              hex === "none"
                ? {
                    background:
                      "repeating-linear-gradient(135deg, rgba(255,255,255,0.06) 0 4px, rgba(255,255,255,0.14) 4px 8px)",
                  }
                : { background: hex }
            }
          />
        ))}
      </div>
    </div>
  );
}
