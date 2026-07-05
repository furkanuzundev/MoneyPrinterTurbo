"use client";

export function ColorAxis({
  label,
  presets,
  value,
  onChange,
}: {
  label: string;
  presets: { label: string; hex: string | "none" }[];
  value: string;
  onChange: (v: string) => void;
}) {
  const selectedPreset = presets.find(
    (p) => p.hex.toLowerCase() === value.toLowerCase(),
  );
  // Palet seçimi: değer bir preset değilse ve "none" değilse.
  const isPalette = !selectedPreset && value !== "none";
  // Native color input "none" veremez; palet için geçerli bir hex lazım.
  const paletteValue = /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#FFFFFF";

  return (
    <div>
      <label className="mb-2 block text-[13px] font-semibold text-bone">
        {label}
      </label>
      <div className="flex flex-wrap items-center gap-[9px]">
        {presets.map((p) => {
          const on = p.hex.toLowerCase() === value.toLowerCase();
          const none = p.hex === "none";
          return (
            <button
              key={p.hex}
              type="button"
              aria-label={p.label}
              title={p.label}
              onClick={() => onChange(p.hex)}
              className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors ${
                on ? "border-caption" : "border-white/20 hover:border-white/40"
              }`}
            >
              <span
                className="h-5 w-5 rounded-full border border-white/25"
                style={
                  none
                    ? {
                        background:
                          "linear-gradient(135deg, transparent 43%, #E5484D 43%, #E5484D 57%, transparent 57%)",
                      }
                    : { background: p.hex }
                }
              />
            </button>
          );
        })}

        {/* Palet düğmesi: serbest hex */}
        <label
          className={`relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-2 transition-colors ${
            isPalette ? "border-caption" : "border-white/20 hover:border-white/40"
          }`}
          title="Custom color"
        >
          <span
            className="h-5 w-5 rounded-full border border-white/25"
            style={{
              background: isPalette
                ? value
                : "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)",
            }}
          />
          <input
            type="color"
            value={paletteValue}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label={`${label} custom`}
          />
        </label>
      </div>
    </div>
  );
}
