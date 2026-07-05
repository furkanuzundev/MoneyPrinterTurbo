import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy — Reelate",
  description: "Privacy Policy for Reelate.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" lastUpdated="July 3, 2026">
      <section>
        <h2>1. What we collect</h2>
        <p>
          When you sign in with Google we receive your name, email address and
          profile picture. We store the topics you submit, the videos you
          generate, and your credit balance and purchase history. We do not
          see or store your Google password.
        </p>
      </section>
      <section>
        <h2>2. Payments</h2>
        <p>
          Payments are handled by Stripe. Your card details go directly to
          Stripe and never touch our servers; we only store a reference to the
          transaction.
        </p>
      </section>
      <section>
        <h2>3. How we use your data</h2>
        <p>
          We use your data to run the service: generating your videos, keeping
          your library, and emailing you about your account. We don&apos;t
          sell your data, and we never post to your social accounts.
        </p>
      </section>
      <section>
        <h2>4. Cookies</h2>
        <p>
          We use a session cookie to keep you signed in. No third-party
          advertising or tracking cookies.
        </p>
      </section>
      <section>
        <h2>5. Retention and deletion</h2>
        <p>
          Your videos stay in your library until you delete them. You can
          request full deletion of your account and data at any time by
          emailing{" "}
          <a href="mailto:support@reelate.org" className="underline">
            support@reelate.org
          </a>
          .
        </p>
      </section>
      <section>
        <h2>6. Changes</h2>
        <p>
          We may update this policy; material changes will be announced on
          this page.
        </p>
      </section>
    </LegalPage>
  );
}
