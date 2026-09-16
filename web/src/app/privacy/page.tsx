import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy — Reelate",
  description: "Privacy Policy for Reelate.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" lastUpdated="September 16, 2026">
      <section>
        <h2>1. What we collect</h2>
        <p>
          When you sign in with Google we receive your name, email address and
          profile picture. We store the topics you submit, the videos you
          generate, the ratings and comments you leave on your videos, and
          your credit balance and purchase history. We do not
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
          your library, and emailing you about your account. Video ratings
          and comments help us improve how videos are made. We don&apos;t
          sell your data, and we never post to your social accounts.
        </p>
      </section>
      <section>
        <h2>4. Cookies</h2>
        <p>
          We use a session cookie to keep you signed in, and a cookie that
          remembers your cookie choice. No advertising cookies.
        </p>
        <p className="mt-3">
          <strong className="text-bone">Analytics.</strong> If you click
          &ldquo;Accept&rdquo; on our cookie banner, we use Google Analytics
          to understand how Reelate is used: pages visited, the device and
          browser you use, your approximate location (country/city, derived
          from your IP address, which Google does not store), how you found
          us, and key actions such as creating, downloading or rating a video
          and buying credits. This sets Google Analytics cookies
          (<code>_ga</code>, <code>_ga_*</code>) for up to two years. When you
          are signed in we attach an internal account ID, never your name or
          email. Google processes this data on our behalf; we don&apos;t use it
          for advertising and don&apos;t enable Google&apos;s ad
          personalization. Analytics data is kept for 14 months. Google LLC
          may process it in the United States, under the EU Standard
          Contractual Clauses and the EU–US Data Privacy Framework.
        </p>
        <p className="mt-3">
          If you click &ldquo;Reject&rdquo; (or ignore the banner), no
          analytics cookies are set and no account ID is attached. Google
          still receives limited cookieless pings (for example the page
          visited, browser and device type, and approximate country) without
          any cookie or identifier, which it uses for aggregate modelling.
          Your IP address is used to deliver these requests but is not stored
          by Google Analytics. You can change your
          choice at any time via &ldquo;Cookie settings&rdquo; at the bottom
          of this page or the site footer; rejecting removes existing
          analytics cookies.
        </p>
      </section>
      <section>
        <h2>5. Retention and deletion</h2>
        <p>
          Your videos stay in your library until you delete them. Ratings you
          left are kept after a video is deleted, and removed together with
          your account. You can
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
