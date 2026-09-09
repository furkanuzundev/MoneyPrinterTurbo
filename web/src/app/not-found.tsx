import Link from "next/link";
import {
  ErrorShell,
  primaryActionClass,
  secondaryActionClass,
} from "@/components/error/error-shell";

export default function NotFound() {
  return (
    <ErrorShell
      code="404 — page not found"
      title="That link doesn't lead anywhere"
      description="The page may have moved, or the address has a typo. Everything else is still here."
    >
      <Link href="/" className={primaryActionClass}>
        Back to home
      </Link>
      <Link href="/dashboard" className={secondaryActionClass}>
        Go to my videos
      </Link>
      <Link href="/#pricing" className={secondaryActionClass}>
        See pricing
      </Link>
    </ErrorShell>
  );
}
