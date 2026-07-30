import type { Metadata } from "next";
import Link from "next/link";
import { LandingNav } from "@/components/landing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { resolvePublicAccountState } from "@/lib/public-account-state";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Read the terms that apply when you create an account or use Clover's personal finance tools.",
};

const sections = [
  ["agreement", "Agreement and eligibility"],
  ["account", "Your account"],
  ["service", "What Clover provides"],
  ["content", "Your records and content"],
  ["automation", "Imports, Adviser, and AI"],
  ["sharing", "Circles and shared expenses"],
  ["acceptable-use", "Acceptable use"],
  ["plans", "Free and Pro plans"],
  ["billing", "Billing and cancellation"],
  ["third-parties", "Third-party services"],
  ["availability", "Changes and availability"],
  ["termination", "Suspension and termination"],
  ["ownership", "Clover ownership"],
  ["disclaimers", "Important disclaimers"],
  ["liability", "Limits of liability"],
  ["law", "Governing law and disputes"],
  ["changes", "Changes to these terms"],
  ["contact", "Contact"],
] as const;

export default async function TermsOfServicePage() {
  const accountState = await resolvePublicAccountState();

  return (
    <main className="landing-page legal-page">
      <LandingNav accountState={accountState} />

      <div className="legal-page__shell">
        <header className="legal-page__header">
          <p className="legal-page__eyebrow">Legal</p>
          <h1>Terms of Service</h1>
          <p className="legal-page__updated">Effective and last updated: July 30, 2026</p>
          <p className="legal-page__intro">
            These Terms explain the rules for using Clover. By creating an account or using the
            service, you agree to them.
          </p>
        </header>

        <section className="legal-page__summary" aria-label="Terms at a glance">
          <article>
            <span aria-hidden="true">01</span>
            <h2>Your records remain yours</h2>
            <p>You give Clover only the permission needed to operate features you request.</p>
          </article>
          <article>
            <span aria-hidden="true">02</span>
            <h2>Review before relying</h2>
            <p>Imports, reports, and Adviser guidance can be incomplete or inaccurate.</p>
          </article>
          <article>
            <span aria-hidden="true">03</span>
            <h2>Clover does not hold money</h2>
            <p>Clover organizes information but is not a bank, broker, lender, or payment service.</p>
          </article>
        </section>

        <div className="legal-page__layout">
          <aside className="legal-page__toc" aria-label="Terms of Service contents">
            <p>On this page</p>
            <nav>
              {sections.map(([id, label]) => (
                <a key={id} href={`#${id}`}>{label}</a>
              ))}
            </nav>
            <Link href="/privacy-policy">Read the Privacy Policy</Link>
          </aside>

          <article className="legal-page__content">
            <section className="legal-page__section" id="agreement">
              <h2>1. Agreement and eligibility</h2>
              <p>
                These Terms of Service (&quot;Terms&quot;) are an agreement between you and
                Clover. They apply to Clover&apos;s website, web application, Help Center,
                contact forms, and related services.
              </p>
              <p>
                You must be at least 18 years old and legally capable of entering into this
                agreement, or use Clover with valid authorization from a parent, guardian, or
                authorized organization. If you use Clover for another person or entity, you
                confirm that you have authority to do so and to provide the relevant
                information.
              </p>
              <p>If you do not agree to these Terms, do not create an account or use Clover.</p>
            </section>

            <section className="legal-page__section" id="account">
              <h2>2. Your account</h2>
              <ul>
                <li>Provide accurate information and keep it reasonably current.</li>
                <li>Keep your password, sign-in method, and recovery options secure.</li>
                <li>Do not share credentials or allow another person to impersonate you.</li>
                <li>Tell us promptly at <a href="mailto:hello@clover.ph">hello@clover.ph</a> if you suspect unauthorized access.</li>
                <li>You are responsible for activity performed through your account unless applicable law provides otherwise.</li>
              </ul>
              <p>
                Clover may let one account create multiple Profiles for separate financial
                contexts. Profiles are organizational areas under the same account, not separate
                legal users or bank accounts.
              </p>
            </section>

            <section className="legal-page__section" id="service">
              <h2>3. What Clover provides</h2>
              <p>
                Clover is a personal finance information and guidance tool. Depending on your
                plan and available features, Clover may help you:
              </p>
              <ul>
                <li>Import bank statements, receipts, screenshots, spreadsheets, and other supported records.</li>
                <li>Organize accounts, transactions, categories, recurring activity, and balances.</li>
                <li>Track investments, budgets, goals, reports, and financial patterns.</li>
                <li>Ask Adviser questions based on the information in your account.</li>
                <li>Create Circles, share selected items, and manage split bills or group plans.</li>
              </ul>
              <p>
                Clover is not a bank, e-wallet, lender, broker, investment manager, credit
                bureau, remittance provider, or payment processor. Clover does not hold, move,
                lend, invest, or insure your money. References to financial institutions or
                brands describe supported records and do not imply endorsement or affiliation.
              </p>
            </section>

            <section className="legal-page__section" id="content">
              <h2>4. Your records and content</h2>
              <p>
                You retain your rights in files, financial records, messages, images, and other
                content you provide. You give Clover a limited, non-exclusive license to host,
                copy, transform, analyze, display, and transmit that content only as reasonably
                needed to provide, secure, support, and improve the service.
              </p>
              <p>You confirm that:</p>
              <ul>
                <li>You have the right to upload and process the content you provide.</li>
                <li>The content and your use of Clover comply with law and do not violate another person&apos;s rights.</li>
                <li>You will avoid uploading unnecessary sensitive information about other people.</li>
                <li>You will review imported records and keep your own original documents where they are important.</li>
              </ul>
              <p>
                Clover may preserve raw, parsed, and confirmed forms of import data separately
                to support review and traceability. Our handling of this information is explained
                in the <Link href="/privacy-policy">Privacy Policy</Link>.
              </p>
            </section>

            <section className="legal-page__section" id="automation">
              <h2>5. Imports, Adviser, and AI</h2>
              <p>
                Clover uses software rules, optical character recognition, heuristics, and AI
                services to interpret records and generate suggestions. Results may contain
                errors, omit information, duplicate entries, misunderstand a document, or become
                outdated.
              </p>
              <p>
                You are responsible for reviewing imported transactions, balances, categories,
                investment details, reports, and Adviser guidance before relying on them. Your
                confirmation does not guarantee that an entry is complete or accurate, and
                Clover does not independently verify your information with a bank or other
                institution.
              </p>
              <p>
                Adviser and other generated guidance are educational and informational. They are
                not personalized financial, investment, legal, accounting, credit, or tax advice
                and are not a substitute for a qualified professional. You remain responsible
                for every financial decision and action you take.
              </p>
            </section>

            <section className="legal-page__section" id="sharing">
              <h2>6. Circles and shared expenses</h2>
              <p>
                Circles are permissioned spaces for shared plans, selected financial summaries,
                expenses, goals, budgets, commitments, and activity. Joining a Circle does not
                make your personal financial records visible to other members unless you
                explicitly share a supported item.
              </p>
              <ul>
                <li>Only invite people you trust and confirm the recipient before sharing.</li>
                <li>Do not share another person&apos;s private information without permission.</li>
                <li>Circle roles control collaboration features but do not transfer ownership of personal records.</li>
                <li>A recorded split, contribution, or settlement is informational and does not itself transfer money or create a bank account.</li>
                <li>Members are responsible for resolving disagreements about amounts, ownership, reimbursement, or settlement.</li>
              </ul>
              <p>
                Clover may retain shared history needed to preserve an accurate Circle record,
                even after a member leaves, subject to the Privacy Policy and applicable law.
              </p>
            </section>

            <section className="legal-page__section" id="acceptable-use">
              <h2>7. Acceptable use</h2>
              <p>You may not:</p>
              <ul>
                <li>Use Clover for unlawful, fraudulent, deceptive, abusive, or harmful activity.</li>
                <li>Upload malware, stolen data, or content you do not have permission to process.</li>
                <li>Attempt to access another user&apos;s account, Profile, Circle, or private information without authorization.</li>
                <li>Probe, bypass, disable, or interfere with authentication, authorization, rate limits, or security controls.</li>
                <li>Scrape, overload, disrupt, reverse engineer, or copy the service except where law expressly permits it.</li>
                <li>Use automated systems to create accounts, extract data, or send requests in a way that burdens or harms the service.</li>
                <li>Misrepresent Clover output as verified professional advice or use it to make decisions about another person without appropriate review.</li>
                <li>Use Clover or its output to develop or train a competing model or service without written permission.</li>
              </ul>
            </section>

            <section className="legal-page__section" id="plans">
              <h2>8. Free and Pro plans</h2>
              <p>
                Clover may offer Free and Pro plans with different features, capacity, and
                limits. The current plan descriptions and prices appear on the{" "}
                <Link href="/pricing">Pricing page</Link> and at checkout. Features and limits
                may change as the service develops.
              </p>
              <p>
                A temporary trial, promotion, higher limit, or uncapped feature does not promise
                that the same access will remain available indefinitely. We will provide notice
                where required before a material paid-plan change takes effect.
              </p>
            </section>

            <section className="legal-page__section" id="billing">
              <h2>9. Billing and cancellation</h2>
              <p>
                Pro subscriptions are processed by PayPal. By subscribing, you authorize PayPal
                and Clover to charge the displayed amount and applicable taxes on the billing
                interval you choose until cancellation. Your PayPal agreement also applies to
                the payment.
              </p>
              <ul>
                <li>Monthly and annual subscriptions renew automatically unless cancelled.</li>
                <li>Prices, billing interval, and any annual savings are shown before approval.</li>
                <li>You are responsible for maintaining a valid payment method with PayPal.</li>
                <li>Cancelling through Clover sends a cancellation request to PayPal and returns the Clover account to Free access.</li>
                <li>Deleting your Clover account also attempts to cancel an active PayPal subscription.</li>
              </ul>
              <p>
                Except where required by law or expressly stated at purchase, charges already
                processed are non-refundable. If a payment fails, is reversed, or is disputed,
                Clover may limit Pro access while the billing status is resolved.
              </p>
            </section>

            <section className="legal-page__section" id="third-parties">
              <h2>10. Third-party services</h2>
              <p>
                Clover relies on third-party services for authentication, hosting, databases,
                AI processing, payments, analytics, and email. Their terms and privacy policies
                may apply to their part of the service. Clover is not responsible for a
                third-party service&apos;s independent acts, availability, or content, except
                where applicable law says otherwise.
              </p>
              <p>
                Market data, exchange rates, institution labels, and other external information
                may be delayed, incomplete, or unavailable. Do not treat Clover as the official
                record of a bank, broker, merchant, tax authority, or payment provider.
              </p>
            </section>

            <section className="legal-page__section" id="availability">
              <h2>11. Changes and availability</h2>
              <p>
                We work to keep Clover useful and available, but the service may be interrupted
                for maintenance, security work, provider outages, or other reasons. We may add,
                change, limit, suspend, or discontinue a feature. Beta or experimental features
                may be less reliable and may change without notice.
              </p>
              <p>
                Keep copies of important original records. Clover is not a substitute for your
                bank statements, official receipts, tax records, or a dedicated backup system.
              </p>
            </section>

            <section className="legal-page__section" id="termination">
              <h2>12. Suspension and termination</h2>
              <p>
                You may stop using Clover, wipe app data, or delete your account through the
                available settings. We may restrict or suspend access when reasonably necessary
                to investigate security risks, prevent harm, comply with law, address unpaid
                charges, or enforce these Terms.
              </p>
              <p>
                We may terminate an account for a material or repeated violation. Where
                appropriate, we will give notice and a reasonable opportunity to correct the
                issue. Sections that by their nature should continue after termination,
                including ownership, disclaimers, liability, and dispute terms, will survive.
              </p>
            </section>

            <section className="legal-page__section" id="ownership">
              <h2>13. Clover ownership</h2>
              <p>
                Clover&apos;s software, design, branding, documentation, interfaces, and
                original content are owned by Clover or its licensors and protected by
                applicable intellectual-property laws. These Terms give you a limited,
                personal, revocable, non-transferable right to use the service; they do not
                transfer ownership.
              </p>
              <p>
                If you send feedback or ideas, you allow Clover to use them without restriction
                or compensation, but you are not required to provide feedback.
              </p>
            </section>

            <section className="legal-page__section" id="disclaimers">
              <h2>14. Important disclaimers</h2>
              <p>
                To the fullest extent permitted by law, Clover is provided &quot;as is&quot; and
                &quot;as available.&quot; We do not guarantee uninterrupted availability,
                complete accuracy, a particular financial result, or that every file,
                institution, transaction, or feature will be supported.
              </p>
              <p>
                Nothing in these Terms excludes a warranty, consumer protection, or other right
                that cannot lawfully be excluded. Where such a right applies, these Terms are
                limited only to the extent the law allows.
              </p>
            </section>

            <section className="legal-page__section" id="liability">
              <h2>15. Limits of liability</h2>
              <p>
                To the fullest extent permitted by law, Clover will not be liable for indirect,
                incidental, special, consequential, exemplary, or punitive loss, or for lost
                profits, opportunities, data, goodwill, or anticipated savings arising from the
                service.
              </p>
              <p>
                To the fullest extent permitted by law, Clover&apos;s total liability for claims
                related to the service will not exceed the greater of the amount you paid Clover
                during the 12 months before the event giving rise to the claim or PHP 1,000.
                This limit does not apply where liability cannot legally be limited, including
                liability caused by fraud, willful misconduct, or another non-waivable basis.
              </p>
            </section>

            <section className="legal-page__section" id="law">
              <h2>16. Governing law and disputes</h2>
              <p>
                These Terms are governed by the laws of the Republic of the Philippines, without
                regard to conflict-of-law rules. Before starting formal proceedings, please
                contact us so we can try to resolve the concern directly.
              </p>
              <p>
                Where permitted by law, disputes will be submitted to the appropriate courts in
                the Philippines. Nothing here prevents you from using a regulator, consumer
                protection process, or court available to you under a non-waivable law.
              </p>
            </section>

            <section className="legal-page__section" id="changes">
              <h2>17. Changes to these Terms</h2>
              <p>
                We may update these Terms as Clover, our providers, or legal requirements change.
                We will post the revised Terms and update the effective date. If a change is
                material, we will provide additional notice where required. Continuing to use
                Clover after the revised Terms take effect means you accept them.
              </p>
            </section>

            <section className="legal-page__section" id="contact">
              <h2>18. Contact</h2>
              <p>
                Questions about these Terms can be sent to{" "}
                <a href="mailto:hello@clover.ph">hello@clover.ph</a> or through the{" "}
                <Link href="/contact-us">Contact page</Link>.
              </p>
            </section>
          </article>
        </div>
      </div>

      <MarketingFooter />
    </main>
  );
}
