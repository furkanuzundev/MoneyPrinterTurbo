import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 text-center">
      <h1 className="text-4xl font-bold">Reelate</h1>
      <p className="max-w-md text-zinc-400">
        Turn any topic into a ready-to-post short video in minutes.
      </p>
      <Link
        href="/signin"
        className="rounded-lg bg-white px-6 py-2 font-medium text-black hover:bg-zinc-200"
      >
        Get started — 2 free credits
      </Link>
    </main>
  );
}
