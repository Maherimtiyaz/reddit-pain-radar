import type { Metadata } from "next";

import {
  LegalList,
  LegalPage,
  LegalSection,
} from "@/components/legal/legal-page";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "What Reddit Pain Radar collects, why it collects it, who processes it, and how to have it deleted.",
  alternates: { canonical: "/privacy" },
};

const UPDATED = "October 27, 2026";

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated={UPDATED}>
      <p>
        This policy explains what {site.name} collects, why, and what you can do
        about it. It covers the landing page, the account area, the JSON API,
        and the reports we generate.
      </p>

      <LegalSection heading="What we collect">
        <p>We collect four kinds of information:</p>
        <LegalList
          items={[
            <>
              <strong className="text-ink">Account details.</strong> Your email
              address, which is how you sign in (we email a one-time link), and
              the workspace name and plan attached to your account.
            </>,
            <>
              <strong className="text-ink">Workspace data.</strong> The
              subreddits and keyword sets you track, the reports generated for
              you, and the API keys you create. We store only a SHA-256 hash of
              each API key — the key itself is shown to you once and never
              again.
            </>,
            <>
              <strong className="text-ink">Billing details.</strong> Payments
              are handled by Stripe. We receive and store a customer identifier,
              a subscription identifier, the plan, and the subscription status.
              We never see or store your card number.
            </>,
            <>
              <strong className="text-ink">Public Reddit content.</strong> We
              ingest publicly available posts and comments from the communities
              you track, including post text and the author&apos;s public
              username, so we can quote the evidence behind a pain signal.
            </>,
          ]}
        />
        <p>
          We also keep short-lived technical data: your IP address is used in
          memory to rate-limit sign-in and checkout requests, and a session
          cookie keeps you signed in. Neither is used to build an advertising
          profile.
        </p>
      </LegalSection>

      <LegalSection heading="Why we use it">
        <LegalList
          items={[
            "To provide the service: score pain signals, generate reports, and return them through the app or API.",
            "To operate your account: send one-time sign-in links, deliver your API key after purchase, and enforce plan limits.",
            "To bill you, through Stripe.",
            "To prevent abuse, such as bulk sign-in attempts and runaway report generation.",
            "To respond when you contact us.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="Who processes it on our behalf">
        <p>
          We share data with service providers only as needed to run the
          product:
        </p>
        <LegalList
          items={[
            <>
              <strong className="text-ink">Stripe</strong> — payment processing
              and subscription management.
            </>,
            <>
              <strong className="text-ink">Resend</strong> — delivery of
              transactional email (sign-in links, welcome messages).
            </>,
            <>
              <strong className="text-ink">Reddit</strong> — the source of the
              public posts we analyse, accessed through Reddit&apos;s API.
            </>,
            <>
              <strong className="text-ink">DeepSeek</strong> — the language
              model used to extract and score pain signals from post text.
            </>,
            <>
              <strong className="text-ink">Vercel and our database host</strong>{" "}
              — application hosting and encrypted storage.
            </>,
          ]}
        />
        <p>We do not sell personal information.</p>
      </LegalSection>

      <LegalSection heading="Cookies">
        <p>
          We set one strictly necessary cookie: the session cookie that keeps
          you signed in. We do not use advertising or cross-site tracking
          cookies.
        </p>
      </LegalSection>

      <LegalSection heading="How long we keep it">
        <LegalList
          items={[
            "Account and workspace data is kept while your account is active, and for a short period afterwards in case you return.",
            "Sign-in tokens are single-use and are deleted as soon as they are used.",
            "Ingested Reddit evidence is kept while it is still useful for reports.",
            "Billing records are kept as long as tax law requires.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="Your choices">
        <p>
          You can ask us to export or delete your account data, or to correct
          it, by emailing{" "}
          <a
            href={`mailto:${site.email}`}
            className="text-brand-light hover:underline"
          >
            {site.email}
          </a>
          . Deleting your account removes your workspace, its reports, and its
          API keys. We may keep records we are legally required to retain.
        </p>
        <p>
          If you are in the EEA or UK, you have the right to object to or
          restrict certain processing and to lodge a complaint with your local
          data protection authority. If you are in California, you have the
          right to know what we collect and to request its deletion. We honour
          these requests for all users, wherever you are.
        </p>
      </LegalSection>

      <LegalSection heading="Security">
        <p>
          API keys are stored only as hashes, tenant data is isolated per
          workspace at the database level, and traffic is served over TLS.
          Report content is scoped so one workspace cannot read another&apos;s
          data. No system is perfectly secure, but we work to keep this one
          tight.
        </p>
      </LegalSection>

      <LegalSection heading="Children">
        <p>
          The service is intended for people running a business and is not
          directed at anyone under 16. We do not knowingly collect data from
          children.
        </p>
      </LegalSection>

      <LegalSection heading="Changes">
        <p>
          If this policy changes in a way that affects you, we will update the
          date above and, for material changes, email account holders.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
