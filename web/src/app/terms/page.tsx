import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Terms of Service — Reelate",
  description: "Terms of Service for Reelate.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" lastUpdated="July 3, 2026">
      <section>
        <h2>1. The service</h2>
        <p>
          Reelate turns a topic you type into a short video with an AI-written
          script, voiceover, stock footage and captions. You get a downloadable
          video file you can post anywhere.
        </p>
      </section>
      <section>
        <h2>2. Accounts</h2>
        <p>
          You sign in with your Google account. You are responsible for
          activity that happens under your account. You must be at least 13
          years old (or the minimum age in your country) to use Reelate.
        </p>
      </section>
      <section>
        <h2>3. Credits and payment</h2>
        <p>
          Video generation costs credits. Credits are purchased as one-time
          packages, never expire, and are non-transferable. Payments are
          processed by Stripe. If a generation fails on our side, the credit
          is automatically refunded to your balance. Purchased credits are
          otherwise non-refundable except where required by law.
        </p>
      </section>
      <section>
        <h2>4. Your content</h2>
        <p>
          You own the videos you generate. Stock footage and voices are
          licensed for use inside generated videos. You are responsible for
          the topics you submit and for how you use the resulting videos,
          including compliance with the rules of the platforms you post to.
        </p>
      </section>
      <section>
        <h2>5. Acceptable use</h2>
        <p>
          Don&apos;t use Reelate to create content that is illegal, deceptive,
          hateful, or that infringes the rights of others. We may suspend
          accounts that violate these terms.
        </p>
      </section>
      <section>
        <h2>6. Disclaimers</h2>
        <p>
          Reelate is provided &quot;as is&quot;. Generated scripts may contain
          inaccuracies — review videos before posting. To the maximum extent
          permitted by law, our liability is limited to the amount you paid us
          in the last 12 months.
        </p>
      </section>
      <section>
        <h2>7. Changes and contact</h2>
        <p>
          We may update these terms; material changes will be announced on
          this page. Questions? Email{" "}
          <a href="mailto:support@reelate.org" className="underline">
            support@reelate.org
          </a>
          .
        </p>
      </section>
    </LegalPage>
  );
}
