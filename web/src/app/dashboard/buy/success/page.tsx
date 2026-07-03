import Link from "next/link";
import { Card, CaptionChip, buttonClasses } from "@/components/ui";

export default function BuySuccessPage() {
  return (
    <div className="mx-auto max-w-md">
      <Card className="flex flex-col items-center gap-4 border-0 py-12 text-center">
        <CaptionChip>Payment received</CaptionChip>
        <p className="text-muted">
          Your credits will appear on your dashboard within a few seconds, as soon
          as the payment is confirmed.
        </p>
        <Link href="/dashboard" className={buttonClasses("primary", "inline-block")}>
          Back to dashboard
        </Link>
      </Card>
    </div>
  );
}
