import { CreditCostTable } from "@/components/credits/credit-cost-table";
import {
  CREDITS_FREE_NOTE,
  CREDITS_REFUND_NOTE,
  CREDITS_RETRY_NOTE,
  WELCOME_NOTE,
} from "@/lib/credits/copy";

// Eski fiyat metni krediyi videoyla 1:1 eşitliyordu; bir videonun ne zaman
// birden fazla krediye mal olduğu ve yeniden denemelerin kredi yakıp yakmadığı
// hiçbir yerde yazmıyordu. Cevaplar koddaki gerçek davranışa dayanır:
//   - ücret yalnızca süreye bağlı (lib/credits/pricing.ts)
//   - her hata yolunda iade var (lib/jobs/create.ts, lib/jobs/status.ts)
//   - script üretimi ve altyazı re-render'ı ücretsiz (api/jobs/[id]/rerender)
//   - başarısız işi "tekrar deneme" endpoint'i YOK; yeni iş açılır
const FAQ = [
  {
    q: "When does a video cost more than one credit?",
    a: "Length is the only thing that changes the price — 1 credit per 30 seconds. Resolution, aspect ratio, language and voice never cost extra.",
  },
  {
    q: "Do retries and regenerations use credits?",
    a: `${CREDITS_REFUND_NOTE} ${CREDITS_RETRY_NOTE} ${CREDITS_FREE_NOTE}`,
  },
  {
    q: "Do credits expire?",
    a: `No. They stay on your account until you use them. ${WELCOME_NOTE}`,
  },
];

export function CreditsFaq() {
  return (
    <section className="px-6 pb-[84px] md:px-12 lg:px-[72px]">
      <div className="rounded-[22px] border border-white/5 bg-panel p-8 sm:p-12">
        <h2 className="mb-2 font-display text-2xl font-extrabold tracking-[-0.02em] text-bone sm:text-[30px]">
          How credits work
        </h2>
        <CreditCostTable className="mb-9 mt-5 justify-start" />
        <dl className="grid gap-7 sm:grid-cols-3">
          {FAQ.map((item) => (
            <div key={item.q}>
              <dt className="mb-2 text-[15px] font-bold text-bone">{item.q}</dt>
              <dd className="text-[14.5px] leading-relaxed text-muted">
                {item.a}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
