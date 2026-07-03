import Link from "next/link";
import { CaptionChip } from "@/components/ui";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function BuySuccessPage() {
  return (
    <div className="mx-auto max-w-md">
      <Card className="flex flex-col items-center gap-4 border-0 px-6 py-12 text-center">
        <CaptionChip>Payment received</CaptionChip>
        <p className="text-muted">
          Your credits will appear on your dashboard within a few seconds, as soon
          as the payment is confirmed.
        </p>
        <Button asChild>
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </Card>
    </div>
  );
}
