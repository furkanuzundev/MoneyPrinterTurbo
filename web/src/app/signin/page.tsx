import Link from "next/link";
import { signIn } from "@/auth";
import { HeroPhone } from "@/components/landing/hero-phone";
import { GoogleButton } from "@/components/signin/google-button";
import "../landing.css";

export default function SignInPage() {
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
              Welcome back
            </div>
            <h1 className="mb-3.5 font-display text-4xl font-extrabold leading-[1.05] tracking-[-0.03em] text-bone">
              Sign in to Reelate
            </h1>
            <p className="mb-[34px] text-base leading-normal text-muted">
              Type a topic, post a video. Pick up right where you left off.
            </p>

            <form
              id="google-signin-form"
              action={async () => {
                "use server";
                await signIn("google", { redirectTo: "/dashboard" });
              }}
            >
              <GoogleButton />
            </form>

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
                Your Google account signs you in &mdash; no password to
                remember. We never post without you.
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
          <span>
            New to Reelate?{" "}
            <button
              type="submit"
              form="google-signin-form"
              className="font-semibold text-caption transition-opacity hover:opacity-80"
            >
              Start free &rarr;
            </button>
          </span>
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
            <blockquote className="font-display text-[22px] font-bold leading-[1.35] tracking-[-0.01em] text-bone">
              &quot;I went from posting once a week to{" "}
              <span className="text-caption">every single day.</span>&quot;
            </blockquote>
            <div className="mt-[18px] flex items-center justify-center gap-[11px]">
              <div
                className="h-9 w-9 rounded-full"
                style={{
                  background:
                    "repeating-linear-gradient(135deg, rgba(255,255,255,0.06) 0 8px, rgba(255,255,255,0.1) 8px 16px)",
                }}
              />
              <div className="text-left">
                <div className="text-[13.5px] font-bold text-bone">
                  Maya Chen
                </div>
                <div className="font-mono-data text-[11px] text-muted/80">
                  Creator &middot; 84K followers
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
