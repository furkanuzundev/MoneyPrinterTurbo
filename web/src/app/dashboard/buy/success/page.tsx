import Link from "next/link";
import { buttonClasses } from "@/components/ui";

export default function BuySuccessPage() {
  return (
    <div className="max-w-md">
      <h1 className="mb-2 font-display text-2xl font-bold tracking-[-0.02em] text-bone">
        Thanks for your purchase!
      </h1>
      <p className="mb-6 text-muted">
        Your credits will appear on your dashboard within a few seconds, as soon
        as the payment is confirmed.
      </p>
      <Link href="/dashboard" className={buttonClasses("primary", "inline-block")}>
        Back to dashboard
      </Link>
    </div>
  );
}
