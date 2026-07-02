import { signIn } from "@/auth";

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm rounded-xl border border-zinc-800 p-8 text-center">
        <h1 className="mb-2 text-2xl font-semibold">Sign in to Reelate</h1>
        <p className="mb-6 text-sm text-zinc-400">
          Get 2 free credits when you join.
        </p>
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/dashboard" });
          }}
        >
          <button
            type="submit"
            className="w-full rounded-lg bg-white px-4 py-2 font-medium text-black hover:bg-zinc-200"
          >
            Continue with Google
          </button>
        </form>
      </div>
    </main>
  );
}
