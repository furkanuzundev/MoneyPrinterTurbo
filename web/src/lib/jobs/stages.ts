// Client-safe modül: server bağımlılığı yok (wizard/progress bileşenleri de kullanır).
// Motor tek bir monotonik progress yayar; aşama etiketleri eşiklerden türetilir.
// Sıra, task.py pipeline'ı ile hizalı: script→TTS→footage→altyazı→render.
export const RENDER_STAGES = [
  "Writing the script",
  "Generating voiceover",
  "Matching stock footage",
  "Burning in captions",
  "Rendering your short",
] as const;

export function stageIndexForProgress(progress: number): number {
  if (progress < 15) return 0;
  if (progress < 35) return 1;
  if (progress < 60) return 2;
  if (progress < 90) return 3;
  return 4;
}

export function stageForProgress(progress: number): string {
  return RENDER_STAGES[stageIndexForProgress(progress)];
}
