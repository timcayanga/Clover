import type { Metadata } from "next";
import Link from "next/link";
import { LandingNav } from "@/components/landing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { resolvePublicAccountState } from "@/lib/public-account-state";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Learn how Clover collects, uses, protects, and shares personal and financial information.",
};

const sections = [
  ["scope", "Who this policy covers"],
  ["information", "Information we collect"],
  ["sources", "Where information comes from"],
  ["uses", "How we use information"],
  ["automation", "Imports, Adviser, and AI"],
  ["sharing", "When information is shared"],
  ["circles", "Circles and shared features"],
  ["transfers", "International processing"],
  ["retention", "Retention and deletion"],
  ["security", "How we protect information"],
  ["choices", "Your choices and rights"],
  ["cookies", "Cookies and analytics"],
  ["children", "Children's privacy"],
  ["changes", "Changes to this policy"],
  ["contact", "Contact and complaints"],
] as const;

export default async function PrivacyPolicyPage() {
  const accountState = await resolvePublicAccountState();

  return (
    <main className="landing-page legal-page">
      <LandingNav accountState={accountState} />

      <div className="legal-page__shell">
        <header className="legal-page__header">
          <p className="legal-page__eyebrow">Legal</p>
          <h1>Privacy Policy</h1>
          <p className="legal-page__updated">Effective and last updated: July 30, 2026</p>
          <p className="legal-page__intro">
            Clover helps you organize financial records, understand your money, and manage
            shared expenses. This policy explains what information we handle, why we need it,
            and the choices you have.
          </p>
        </header>

        <section className="legal-page__summary" aria-label="Privacy at a glance">
          <article>
            <span aria-hidden="true">01</span>
            <h2>You stay in control</h2>
            <p>You choose what to upload, review, correct, share, or delete.</p>
          </article>
          <article>
            <span aria-hidden="true">02</span>
            <h2>Sharing is intentional</h2>
            <p>Your personal financial records are not shared with a Circle unless you choose to share them.</p>
          </article>
          <article>
            <span aria-hidden="true">03</span>
            <h2>We do not sell your data</h2>
            <p>Clover does not sell personal information or use it for behavioral advertising.</p>
          </article>
        </section>

        <div className="legal-page__layout">
          <aside className="legal-page__toc" aria-label="Privacy Policy contents">
            <p>On this page</p>
            <nav>
              {sections.map(([id, label]) => (
                <a key={id} href={`#${id}`}>{label}</a>
              ))}
            </nav>
            <Link href="/terms-of-service">Read the Terms of Service</Link>
          </aside>

          <article className="legal-page__content">
            <section className="legal-page__section" id="scope">
              <h2>1. Who this policy covers</h2>
              <p>
                This Privacy Policy applies to Clover&apos;s website, web application, Help
                Center, contact forms, and related services. In this policy, &quot;Clover,&quot;
                &quot;we,&quot; &quot;us,&quot; and &quot;our&quot; refer to the operator of the
                Clover personal finance service.
              </p>
              <p>
                Clover determines how personal information is processed for the purposes
                described here. You can contact us about privacy at{" "}
                <a href="mailto:hello@clover.ph">hello@clover.ph</a>.
              </p>
            </section>

            <section className="legal-page__section" id="information">
              <h2>2. Information we collect</h2>
              <h3>Account and profile information</h3>
              <p>
                This includes your name, email address, profile photo, authentication
                identifiers, account settings, onboarding answers, and the Profiles you create
                to organize different parts of your finances.
              </p>
              <h3>Financial records you provide</h3>
              <p>
                This includes bank statements, receipts, screenshots, spreadsheets, manual
                entries, account balances, transaction histories, investments, recurring
                activity, budgets, goals, and split-bill details.
              </p>
              <h3>Information Clover creates from your records</h3>
              <p>
                Clover may extract and organize transactions, merchants, categories, accounts,
                balances, holdings, line items, and dates. It may also create reports, trends,
                recurring-item suggestions, goal progress, import confidence scores, review
                items, and Adviser responses.
              </p>
              <h3>Shared and collaboration information</h3>
              <p>
                If you use Circles or Split Bills, we process Circle names, invitations,
                member roles, shared expenses, settlement status, shared budgets or goals,
                commitments, activity history, and the specific records or investment summaries
                you choose to share.
              </p>
              <h3>Billing information</h3>
              <p>
                For Pro subscriptions, we process your selected plan, billing interval,
                subscription status, payment-provider references, and transaction status.
                Payments are completed through PayPal. Clover does not receive or store your
                complete card or bank-payment credentials.
              </p>
              <h3>Usage, device, and support information</h3>
              <p>
                We may collect pages viewed, features used, button interactions, browser and
                device details, approximate location derived from network information, IP
                address, session and security events, diagnostics, and error information. If
                you contact us, we also process your message and any attachment you include.
              </p>
            </section>

            <section className="legal-page__section" id="sources">
              <h2>3. Where information comes from</h2>
              <ul>
                <li>Directly from you when you create an account, upload records, enter information, or contact us.</li>
                <li>From the files and financial records you ask Clover to process.</li>
                <li>From other Circle members when they invite you or add information to a shared area.</li>
                <li>From service providers that support authentication, payments, hosting, analytics, email, and security.</li>
                <li>Automatically when you use Clover, such as usage, session, and diagnostic events.</li>
              </ul>
            </section>

            <section className="legal-page__section" id="uses">
              <h2>4. How we use information</h2>
              <p>We use personal information to:</p>
              <ul>
                <li>Create, authenticate, and maintain your account and Profiles.</li>
                <li>Import, extract, organize, categorize, and display the records you provide.</li>
                <li>Generate reports, patterns, goals, recurring suggestions, and Adviser guidance.</li>
                <li>Operate Circles, invitations, shared expenses, and other features you choose to use.</li>
                <li>Process Pro subscriptions and maintain billing entitlements.</li>
                <li>Answer support requests and send important account, security, billing, or service messages.</li>
                <li>Prevent abuse, investigate incidents, enforce our Terms, and protect Clover and its users.</li>
                <li>Understand feature performance, troubleshoot errors, and improve the service.</li>
                <li>Meet legal, accounting, regulatory, and dispute-resolution obligations.</li>
              </ul>
              <p>
                Depending on the activity, we process information to provide the service you
                requested, with your consent, to comply with law, or for legitimate purposes
                such as security, support, fraud prevention, and product improvement. We apply
                the principles of transparency, legitimate purpose, and proportionality.
              </p>
            </section>

            <section className="legal-page__section" id="automation">
              <h2>5. Imports, Adviser, and AI</h2>
              <p>
                Clover uses deterministic rules first where possible. When a file is unfamiliar,
                incomplete, image-based, or difficult to read, Clover may use optical character
                recognition or an AI service to extract and structure the information. Adviser
                also uses AI to respond to questions based on the financial context available in
                your account.
              </p>
              <p>
                This means relevant text, images, extracted financial details, prompts, and
                account context may be sent to AI service providers solely to produce the
                requested result and operate the feature. AI output can be incomplete or wrong.
                Clover shows review and correction tools so you can confirm important details
                before relying on them.
              </p>
              <p>
                Clover does not move money, approve credit, execute trades, or make decisions
                with legal or similarly significant effects on your behalf.
              </p>
            </section>

            <section className="legal-page__section" id="sharing">
              <h2>6. When information is shared</h2>
              <p>We do not sell your personal information. We may disclose it in these limited circumstances:</p>
              <ul>
                <li>
                  <strong>Service providers.</strong> Providers help us deliver authentication
                  (Clerk), hosting and application infrastructure (Vercel), database services
                  (Supabase), AI processing (OpenAI), payments (PayPal), product analytics
                  (PostHog), and support email (Zoho). They receive only the information needed
                  for their role and process it under their own applicable terms and privacy
                  commitments.
                </li>
                <li>
                  <strong>At your direction.</strong> We share information with Circle members,
                  split-bill participants, or another recipient when you use a sharing feature.
                </li>
                <li>
                  <strong>Legal and safety reasons.</strong> We may disclose information when
                  reasonably necessary to comply with law, a valid legal request, enforce our
                  Terms, investigate fraud or abuse, or protect rights, safety, and security.
                </li>
                <li>
                  <strong>Business changes.</strong> Information may be transferred as part of a
                  merger, financing, acquisition, reorganization, or sale of assets, subject to
                  appropriate confidentiality and notice where required.
                </li>
              </ul>
            </section>

            <section className="legal-page__section" id="circles">
              <h2>7. Circles and shared features</h2>
              <p>
                Joining a Circle does not automatically give its members access to your personal
                Profiles, accounts, transactions, files, reports, or full investment portfolio.
                Personal records remain private unless you deliberately share a supported item.
              </p>
              <p>
                Members can see information created for the Circle and information another
                member explicitly shares there. Depending on your role, they may also see your
                display name, invitation status, contributions, settlement activity, and actions
                recorded in Circle history. Organizers can manage the Circle but cannot edit
                another member&apos;s private financial records.
              </p>
              <p>
                Before sharing, check that a record does not contain information about someone
                who has not agreed to the disclosure. Removing yourself or unsharing an item may
                not remove information another member already lawfully received or shared
                history needed to preserve the Circle&apos;s records.
              </p>
            </section>

            <section className="legal-page__section" id="transfers">
              <h2>8. International processing</h2>
              <p>
                Clover and its service providers may process information in the Philippines and
                other countries where they operate. Privacy and data-protection rules may differ
                across locations. Where required, we use contractual, organizational, and
                technical measures intended to protect information transferred across borders.
              </p>
            </section>

            <section className="legal-page__section" id="retention">
              <h2>9. Retention and deletion</h2>
              <p>
                We keep information only for as long as reasonably necessary to provide Clover,
                maintain traceability, secure the service, meet legal and accounting duties, and
                resolve disputes. Retention depends on the type of information and why it is
                needed.
              </p>
              <ul>
                <li>
                  Uploaded source files stored for server-side processing are temporary and
                  marked for deletion after 72 hours. Cleanup jobs, failed processing, or backup
                  expiration may take additional time. Some supported imports can be parsed
                  locally without uploading the raw file.
                </li>
                <li>
                  Extracted and confirmed financial data remains in your account until you edit,
                  delete, wipe, or close the account, or until retention is no longer necessary.
                </li>
                <li>
                  Billing, security, support, and audit records may be retained for legal,
                  fraud-prevention, accounting, and dispute-resolution needs.
                </li>
                <li>
                  Backups, security logs, and records already shared with other users may take
                  additional time to expire or may remain where law or another user&apos;s
                  legitimate record requires it.
                </li>
              </ul>
              <p>
                Wiping data removes Clover app data while keeping your sign-in account. Deleting
                your account removes the local Clover account, cancels an active PayPal
                subscription, and requests deletion of the associated Clerk identity. Certain
                limited records may remain where required by law or for security and dispute
                handling.
              </p>
            </section>

            <section className="legal-page__section" id="security">
              <h2>10. How we protect information</h2>
              <p>
                Clover uses administrative, technical, and organizational safeguards designed
                for financial information. These include managed authentication through Clerk,
                encrypted network connections, server-side authorization checks, restricted
                database access, role and ownership checks, activity logging, and review tools
                that keep original and normalized import data traceable.
              </p>
              <p>
                No service can guarantee absolute security. Keep your sign-in methods secure,
                use a strong unique password where applicable, and contact us immediately if you
                believe someone accessed your account without permission.
              </p>
            </section>

            <section className="legal-page__section" id="choices">
              <h2>11. Your choices and rights</h2>
              <p>
                Subject to applicable law, including the Philippine Data Privacy Act of 2012,
                you may have the right to be informed, access your information, object to
                processing, correct inaccurate information, request erasure or blocking, obtain
                portable data, file a complaint, and seek damages where appropriate.
              </p>
              <p>
                Clover also provides in-product controls to review and correct imported data,
                manage sharing, wipe app data, and delete your account. To exercise a right that
                is not available in the app, email{" "}
                <a href="mailto:hello@clover.ph">hello@clover.ph</a>. We may need to verify your
                identity and may retain or decline a request where permitted or required by law.
              </p>
            </section>

            <section className="legal-page__section" id="cookies">
              <h2>12. Cookies and analytics</h2>
              <p>
                Clover uses cookies and similar browser storage for sign-in sessions, security,
                theme and interface preferences, and reliable product operation. When analytics
                is configured, PostHog helps us understand page views, feature use, errors, and
                product performance. Clover does not use this information for third-party
                behavioral advertising.
              </p>
              <p>
                You can control cookies through your browser, but blocking essential storage may
                prevent sign-in or cause parts of Clover to stop working correctly.
              </p>
            </section>

            <section className="legal-page__section" id="children">
              <h2>13. Children&apos;s privacy</h2>
              <p>
                Clover is not directed to children under 18 and is intended for people who can
                legally manage an account or who use it with valid parent or guardian
                authorization. If you believe a child provided personal information without
                appropriate authorization, contact us so we can review and take appropriate
                action.
              </p>
            </section>

            <section className="legal-page__section" id="changes">
              <h2>14. Changes to this policy</h2>
              <p>
                We may update this policy as Clover changes or legal requirements develop. We
                will post the revised policy here and change the effective date. If a change
                materially affects how we use personal information, we will provide additional
                notice where required.
              </p>
            </section>

            <section className="legal-page__section" id="contact">
              <h2>15. Contact and complaints</h2>
              <p>
                For privacy questions or requests, email{" "}
                <a href="mailto:hello@clover.ph">hello@clover.ph</a>. Please describe your
                request and the email connected to your Clover account.
              </p>
              <p>
                You may also learn about your rights or file a complaint with the{" "}
                <a href="https://privacy.gov.ph/" target="_blank" rel="noreferrer">
                  National Privacy Commission of the Philippines
                </a>.
              </p>
            </section>
          </article>
        </div>
      </div>

      <MarketingFooter />
    </main>
  );
}
