import type { Metadata } from "next";

import {
  LegalList,
  LegalPage,
  LegalSection,
} from "@/components/legal/legal-page";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: `The agreement covering your use of ${site.name}, including plans, billing, acceptable use, and API keys.`,
  alternates: { canonical: "/terms" },
};

const UPDATED = "October 27, 2026";

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated={UPDATED}>
      <p>
        These terms are an agreement between you and {site.name}. By creating an
        account, subscribing, or using the API, you accept them. If you are
        agreeing on behalf of a company, you confirm you are allowed to.
      </p>

      <LegalSection heading="The service">
        <p>
          {site.name} scans public Reddit communities, scores the pain points it
          finds, and turns them into reports you can act on. You can read those
          reports in the dashboard or fetch them through the JSON API.
        </p>
        <p>
          Reports are derived analysis of public conversations. They are
          provided for information and are not business, legal, or financial
          advice. You are responsible for the decisions you make with them.
        </p>
      </LegalSection>

      <LegalSection heading="Accounts">
        <LegalList
          items={[
            "You sign in with a one-time email link. Keep access to that inbox secure, since anyone with it can reach your workspace.",
            "You must provide a valid email address and keep your account details accurate.",
            "One person or organisation per account. Do not share a single account between unrelated parties.",
            "You are responsible for activity under your account and for the API keys you create.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="Plans, trials, and billing">
        <LegalList
          items={[
            "New workspaces start on a free trial. The trial lasts 14 days and includes a limited number of reports per calendar month.",
            "Paid plans are billed in advance through Stripe on a recurring basis until you cancel.",
            "Each plan has a monthly report quota. When you reach it, further report requests are refused until the quota resets or you upgrade.",
            "You can cancel at any time; access continues until the end of the period you have already paid for. Except where the law requires otherwise, payments are non-refundable.",
            "If a payment fails, we may suspend paid features and fall back to the trial plan until billing is resolved.",
            "Prices may change. We will give existing subscribers notice before a change applies to them.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="Acceptable use">
        <p>You agree not to:</p>
        <LegalList
          items={[
            "Use the service to break the law, infringe someone's rights, or harass anyone.",
            "Resell, redistribute, or publicly republish the reports or the underlying evidence as a competing dataset.",
            "Attempt to bypass quotas, rate limits, authentication, or tenant isolation.",
            "Scrape, overload, or reverse-engineer the service, or use it to build a competing product.",
            "Use the service in a way that violates Reddit's own terms or the rights of Reddit users.",
          ]}
        />
        <p>
          We may suspend or terminate an account that puts the service or other
          customers at risk.
        </p>
      </LegalSection>

      <LegalSection heading="API keys">
        <p>
          API keys are shown once, at creation, and only a hash is stored. Treat
          a key like a password: keep it out of client-side code and public
          repositories. If a key leaks, revoke it and create a new one. You are
          responsible for requests made with your keys.
        </p>
      </LegalSection>

      <LegalSection heading="Content and ownership">
        <p>
          The posts and comments we analyse belong to their authors on Reddit.
          We do not claim ownership of them. The reports, scoring, and software
          that make up {site.name} belong to us; your subscription grants you a
          licence to use them for your own business, not to resell them.
        </p>
        <p>
          Data you put into the service — your tracked subreddits, keyword sets,
          and workspace details — remains yours.
        </p>
      </LegalSection>

      <LegalSection heading="Availability">
        <p>
          We aim to keep the service running and the evidence fresh, but we do
          not guarantee uninterrupted availability or that any particular
          subreddit or post will be ingested. Reddit&apos;s API, our model
          provider, and our hosting can all fail independently. Unless we have
          agreed a separate written SLA, the service is provided &ldquo;as
          is&rdquo;.
        </p>
      </LegalSection>

      <LegalSection heading="Limitation of liability">
        <p>
          To the extent the law allows, we are not liable for indirect,
          incidental, or consequential damages, or for lost profits, revenue, or
          data. Our total liability for any claim is limited to the amount you
          paid us in the twelve months before the claim arose.
        </p>
        <p>
          Nothing in these terms excludes liability that cannot lawfully be
          excluded.
        </p>
      </LegalSection>

      <LegalSection heading="Termination">
        <p>
          You can stop using the service and cancel your subscription at any
          time. We may suspend or end your access if you breach these terms, if
          required by law, or if we discontinue the service — in which case we
          will give reasonable notice and refund any prepaid period you have not
          used.
        </p>
      </LegalSection>

      <LegalSection heading="Changes to these terms">
        <p>
          We may update these terms as the product changes. If a change is
          material, we will notify account holders by email before it takes
          effect. Continuing to use the service after that means you accept the
          updated terms.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          Questions about these terms? Email{" "}
          <a
            href={`mailto:${site.email}`}
            className="text-brand-light hover:underline"
          >
            {site.email}
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
