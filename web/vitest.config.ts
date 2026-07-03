import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Birden fazla test dosyası aynı test Postgres'ini (port 5434) paylaşıyor;
    // her biri kendi beforeEach'inde paylaşılan tabloları TRUNCATE ediyor.
    // Dosyalar paralel çalışırsa bu TRUNCATE'ler birbirinin transaction'larıyla
    // yarışır (ör. ledger.test.ts ve purchases.test.ts flaky FK/assertion hataları
    // üretiyordu). Entegrasyon testleri olduğundan dosyaları seri çalıştırıyoruz.
    fileParallelism: false,
  },
});
