import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signIn, signOut } from "@/auth";
import { HeroPhone } from "@/components/landing/hero-phone";
import { GoogleButton } from "@/components/signin/google-button";
import { safeCallbackPath } from "@/lib/auth/callback";
import { signInErrorMessage } from "@/lib/auth/signin";
import { CREDIT_COST_ROWS, WELCOME_NOTE } from "@/lib/credits/copy";
import "../landing.css";

export default async function SignInPage({
  searchParams,
}: {
  // Next 15: searchParams bir Promise.
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  // "Start free" ile gelen yeni kullanıcı ile geri dönen kullanıcı aynı
  // mesajı görüyordu ("Welcome back" + "Sign in") — tester bunu karışık
  // buldu. Tek Google formu kalıyor, sadece çerçeve metni değişiyor.
  const isSignup = params.mode === "signup";
  const redirectTo = safeCallbackPath(params.callbackUrl);

  // Sayfa her ziyaretçiyi anonim sayıyordu. Girişli bir kullanıcı landing'deki
  // "Start free" ile buraya gelip Google hesap seçicide BAŞKA bir hesap
  // seçtiğinde Auth.js OAuthAccountNotLinked fırlatıyor ve kullanıcı sessizce
  // /signin?error=… sayfasına düşüyordu (prod'da görülen hata tam olarak bu).
  // Oturumu olan ziyaretçi formu hiç görmemeli.
  const session = await auth();
  const errorMessage = signInErrorMessage(params.error);
  // Hatayla dönen kişi tanım gereği girişli olduğundan, koşulsuz yönlendirme
  // mesajı yutardı; hata varken sayfada kalıp çıkışı teklif ediyoruz.
  if (session?.user && !errorMessage) redirect(redirectTo);
  const signedIn = !!session?.user;

  return (
    <main className="flex min-h-screen bg-[#0D0C0A] text-bone">
      {/* Form paneli */}
      <div className="flex min-w-0 flex-1 flex-col p-10 lg:px-14">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-caption font-display text-[19px] font-extrabold text-caption-ink">
            R
          </span>
          <span className="font-display text-xl font-extrabold tracking-[-0.02em]">
            Reelate
          </span>
        </Link>

        <div className="flex flex-1 flex-col items-center justify-center py-10">
          <div className="w-full max-w-[380px]">
            <div className="mb-4 font-mono-data text-xs uppercase tracking-[0.1em] text-caption-dim">
              {isSignup ? "Start free" : "Welcome back"}
            </div>
            <h1 className="mb-3.5 font-display text-4xl font-extrabold leading-[1.05] tracking-[-0.03em] text-bone">
              {isSignup ? "Create your Reelate account" : "Sign in to Reelate"}
            </h1>
            <p className="mb-[34px] text-base leading-normal text-muted">
              {isSignup
                ? WELCOME_NOTE
                : "Type a topic, post a video. Pick up right where you left off."}
            </p>

            {errorMessage && (
              <div
                role="alert"
                className="mb-6 rounded-xl border border-[#f4c63a]/30 bg-[#f4c63a]/10 px-4 py-3.5 text-[13px] leading-normal text-bone"
              >
                {errorMessage}
              </div>
            )}

            {signedIn ? (
              // Aynı Google formunu tekrar göstermek aynı hatayı üretirdi:
              // çıkış yapmadan başka bir hesaba geçilemez.
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/signin" });
                }}
              >
                <button
                  type="submit"
                  className="flex w-full items-center justify-center rounded-[13px] bg-white p-[15px] text-[15.5px] font-bold text-[#1a1a1a] shadow-[0_8px_24px_rgba(0,0,0,0.25)] transition-opacity hover:opacity-90"
                >
                  Sign out and use another account
                </button>
              </form>
            ) : (
              <form
                action={async () => {
                  "use server";
                  await signIn("google", { redirectTo });
                }}
              >
                <GoogleButton signup={isSignup} />
              </form>
            )}

            <div className="my-[26px] flex items-center gap-3">
              <div className="h-px flex-1 bg-white/10" />
              <span className="font-mono-data text-[11px] uppercase tracking-[0.06em] text-muted/70">
                Secure sign-in
              </span>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            <div className="flex items-start gap-2.5 rounded-xl border border-white/5 bg-[#141310] px-4 py-3.5">
              <span className="text-[15px] leading-snug text-caption" aria-hidden>
                ◆
              </span>
              <p className="text-[13px] leading-normal text-muted/90">
                We use Google Sign-In only &mdash; no password to manage. We
                never post without you.
              </p>
            </div>

            <p className="mt-6 text-[12.5px] leading-relaxed text-muted/70">
              By continuing you agree to Reelate&apos;s{" "}
              <Link
                href="/terms"
                className="text-muted underline underline-offset-2 transition-colors hover:text-bone"
              >
                Terms
              </Link>{" "}
              and{" "}
              <Link
                href="/privacy"
                className="text-muted underline underline-offset-2 transition-colors hover:text-bone"
              >
                Privacy Policy
              </Link>
              .
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between text-[13.5px] text-muted/70">
          <Link href="/" className="transition-colors hover:text-bone">
            &larr; Back to reelate.org
          </Link>
          <span className="font-mono-data text-[11.5px]">
            &copy; 2026 Reelate
          </span>
        </div>
      </div>

      {/* Showcase paneli */}
      <div className="relative hidden min-w-0 flex-1 flex-col justify-center overflow-hidden border-l border-white/5 bg-gradient-to-br from-[#1A1710] to-ink p-14 lg:flex">
        <div className="heroGlow absolute -right-[5%] -top-[10%] h-[520px] w-[520px] bg-[radial-gradient(circle_at_50%_50%,rgba(244,198,58,0.16),transparent_62%)] blur-[20px]" />
        <div className="relative flex flex-col items-center gap-9">
          <HeroPhone />
          <div className="max-w-[400px] text-center">
            <p className="font-display text-[22px] font-bold leading-[1.35] tracking-[-0.01em] text-bone">
              {WELCOME_NOTE}
            </p>
            <ul className="mt-[18px] flex flex-wrap items-center justify-center gap-2">
              {CREDIT_COST_ROWS.map((row) => (
                <li
                  key={row.seconds}
                  className="flex items-baseline gap-2 rounded-[10px] border border-white/10 px-3 py-1.5"
                >
                  <span className="font-mono-data text-xs font-bold text-bone">
                    {row.label}
                  </span>
                  <span className="font-mono-data text-[11px] text-muted/80">
                    {row.creditsLabel}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </main>
  );
}
