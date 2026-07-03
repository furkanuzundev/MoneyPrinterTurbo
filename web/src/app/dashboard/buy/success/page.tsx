import Link from "next/link";

export default function BuySuccessPage() {
  return (
    <div className="max-w-md">
      <h1 className="mb-2 text-2xl font-semibold">Thanks for your purchase!</h1>
      <p className="mb-6 text-zinc-400">
        Your credits will appear on your dashboard within a few seconds, as soon
        as the payment is confirmed.
      </p>
      <Link href="/dashboard" className="underline">
        Back to dashboard
      </Link>
    </div>
  );
}
