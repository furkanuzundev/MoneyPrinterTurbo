import { FeedbackForm } from "./feedback-form";

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;

  return (
    <div className="max-w-[640px]">
      <div className="mb-6">
        <h1 className="mb-1.5 font-display text-3xl font-extrabold tracking-[-0.02em] text-bone lg:text-[34px]">
          Feedback
        </h1>
        <p className="text-[15px] text-muted">
          Found a bug, missing something, or have an idea? Tell us — every
          message goes straight to the team, and we reply by email.
        </p>
      </div>
      <FeedbackForm page={from ?? ""} />
    </div>
  );
}
