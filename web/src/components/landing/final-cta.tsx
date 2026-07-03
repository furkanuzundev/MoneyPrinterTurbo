import Link from "next/link";

export function FinalCta() {
  return (
    <section className="mx-6 mb-[84px] rounded-3xl bg-gradient-to-br from-caption to-[#E0A81E] p-10 text-center text-caption-ink md:mx-12 lg:mx-[72px] lg:p-16">
      <h2 className="mb-3.5 font-display text-3xl font-extrabold tracking-[-0.02em] sm:text-4xl lg:text-5xl">
        Your next short is one sentence away.
      </h2>
      <p className="mb-[30px] text-lg text-[#3a3212]">
        Start with 2 free videos. No card, no editing, no camera.
      </p>
      <Link
        href="/signin"
        className="inline-block rounded-[14px] bg-caption-ink px-8 py-4 text-base font-bold text-caption transition-opacity hover:opacity-90"
      >
        Start free &mdash; 2 videos on us
      </Link>
    </section>
  );
}
