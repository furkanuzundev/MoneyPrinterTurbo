import { CREDIT_COST_ROWS } from "@/lib/credits/copy";

/**
 * Kredi maliyetini olduğu gibi gösterir. Satırlar DURATION_TIERS'ten türetilir,
 * bu yüzden fiyatlandırma değişirse metin de değişir.
 * Server-component-safe: hook yok.
 */
export function CreditCostTable({ className = "" }: { className?: string }) {
  return (
    <ul
      className={`flex flex-wrap items-stretch justify-center gap-2 ${className}`}
    >
      {CREDIT_COST_ROWS.map((row) => (
        <li
          key={row.seconds}
          className="flex items-baseline gap-2 rounded-[11px] border border-white/[0.07] bg-panel px-3.5 py-2"
        >
          <span className="font-mono-data text-[13px] font-bold text-bone">
            {row.label}
          </span>
          <span className="text-muted/60" aria-hidden>
            ·
          </span>
          <span className="text-[13px] text-muted">{row.creditsLabel}</span>
        </li>
      ))}
    </ul>
  );
}
