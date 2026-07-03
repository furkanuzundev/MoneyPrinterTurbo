import { signIn } from "@/auth";
import { Card, CaptionChip, buttonClasses } from "@/components/ui";

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ink px-6 text-bone">
      <Card className="w-full max-w-sm text-center">
        <h1 className="font-display text-2xl font-bold tracking-[-0.02em] text-bone">
          Sign in to Reelate
        </h1>
        <p className="mb-6 mt-2 text-sm text-muted">
          Get <CaptionChip>2 free credits</CaptionChip> when you join.
        </p>
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/dashboard" });
          }}
        >
          <button type="submit" className={buttonClasses("primary", "w-full")}>
            Continue with Google
          </button>
        </form>
      </Card>
    </main>
  );
}
