export const HERO_VIDEO_ID = "hero-demo-video";

/**
 * Hero videosunun sesi iki ayrı bileşenden kontrol ediliyor (video üstündeki
 * küçük buton ve hero'daki CTA), bu yüzden "muted" tek bir yerde tutulur.
 * Daha önce CTA sesi açıyor ama hiçbir yerde durum değişmiyordu; kullanıcı
 * ne olduğunu göremiyor ve tekrar kısamıyordu.
 */
type Listener = () => void;

const listeners = new Set<Listener>();
let muted = true;

export function heroVideo(): HTMLVideoElement | null {
  const el = document.getElementById(HERO_VIDEO_ID);
  return el instanceof HTMLVideoElement ? el : null;
}

export function subscribeHeroMuted(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getHeroMuted(): boolean {
  return muted;
}

/** SSR anlık görüntüsü: sunucuda video her zaman sessiz başlar. */
export function getHeroMutedServer(): boolean {
  return true;
}

function emit() {
  for (const listener of listeners) listener();
}

export function setHeroMuted(next: boolean) {
  const video = heroVideo();
  if (video) {
    video.muted = next;
    if (!next) void video.play().catch(() => {});
  }
  if (muted !== next) {
    muted = next;
    emit();
  }
}

/** CTA: başa sar, sesi aç ve videoyu görünür yap. */
export function playHeroWithSound() {
  const video = heroVideo();
  if (!video) return;
  video.scrollIntoView({ behavior: "smooth", block: "center" });
  video.currentTime = 0;
  setHeroMuted(false);
}
