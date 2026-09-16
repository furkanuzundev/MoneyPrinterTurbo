const SIGNUP_WINDOW_MS = 10 * 60 * 1000;

/** GA sign_up: hesap son 10 dk içinde açıldıysa ilk dashboard yüklemesi kayıttır. */
export function isRecentSignup(createdAt: Date | undefined, now: Date): boolean {
  if (!createdAt) return false;
  return now.getTime() - createdAt.getTime() <= SIGNUP_WINDOW_MS;
}
