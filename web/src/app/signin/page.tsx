import { signIn } from "@/auth";
import { CaptionChip } from "@/components/ui";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ink px-6 text-bone">
      <Card className="w-full max-w-sm text-center">
        <CardContent>
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
            <Button type="submit" className="w-full">
              Continue with Google
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
