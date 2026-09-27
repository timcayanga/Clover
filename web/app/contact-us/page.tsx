import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ContactUsForm } from "@/components/contact-us-form";
import { PublicInfoShell } from "@/components/public-info-shell";
import styles from "@/components/public-info.module.css";

export const metadata: Metadata = {
  title: "Contact Us",
  description:
    "Send Clover a question or support request and reach the team directly from the Contact Us page.",
  alternates: { canonical: "https://clover.ph/contact-us" },
};

export default function ContactUsPage() {
  return (
    <PublicInfoShell active="contact">
      <header className={styles.contactHero}>
        <div>
          <p className={styles.eyebrow}>Help &amp; Support</p>
          <h1>Contact us</h1>
          <p>
            Have a question, found something that isn’t working, or want to
            share an idea? Send the Clover team a message.
          </p>
          <p>
            We aim to reply within 1 to 3 days. For account questions, use the
            email address associated with your Clover account.
          </p>
        </div>
        <div className={styles.photo}>
          <Image
            src="/assets/feature-stories/manage-hero.webp"
            alt="A woman reviewing her financial records at a bright desk"
            fill
            sizes="(max-width:640px) 100vw, 45vw"
            priority
            draggable={false}
          />
        </div>
      </header>

      <div className={styles.contactLayout}>
        <section className={styles.formPanel} aria-labelledby="message-heading">
          <h2 id="message-heading">Send a message</h2>
          <p>
            Tell us which page you were on, what you expected, and what
            happened. Include an error reference if Clover showed one.
          </p>
          <ContactUsForm />
        </section>
        <aside
          className={styles.supportLinks}
          aria-label="Other ways to get help"
        >
          <section className={styles.supportCard}>
            <h2>Find an answer</h2>
            <p>
              Browse help with uploads, accounts, shared money, and planning.
            </p>
            <p>
              <Link href="/help">Visit the Help Center →</Link>
            </p>
            <Link href="/guides">Bank statement guides →</Link>
          </section>
          <section className={styles.supportCard}>
            <h2>Prefer email?</h2>
            <p>
              For support, feedback, or general questions, write to the Clover
              team.
            </p>
            <a href="mailto:hello@clover.ph">hello@clover.ph</a>
          </section>
          <section className={styles.supportCard}>
            <h2>Pro and billing</h2>
            <p>
              Include your account email and the billing provider shown on your
              receipt. Never include complete card details.
            </p>
            <Link href="/pricing">View plans and pricing →</Link>
          </section>
          <section className={styles.supportCard}>
            <h2>Privacy or account security</h2>
            <Link href="#delete-account">Delete your Clover account →</Link>
            <p>
              Tell us if you need help with your data or suspect unauthorized
              account access. Do not send passwords, one-time codes, or
              unredacted statements.
            </p>
            <Link href="/privacy-policy#choices">Your data choices →</Link>
          </section>
        </aside>
      </div>
      <section id="delete-account" className={styles.legalSection} style={{ scrollMarginTop: 96 }}>
        <h2>Delete your Clover account</h2>
        <p>You can delete your account in Settings → Data, or request deletion here without installing the app. Use the email address associated with your Clover account.</p>
        <p>We aim to reply within 1 to 3 days to verify ownership and explain next steps. Submitting this form does not immediately delete an account.</p>
        <ul>
          <li>Deletion removes your Clover account and financial records and requests deletion of your sign-in identity. Uploaded source files are temporary; cleanup and backup expiration may take additional time.</li>
          <li>Limited billing, security, support and audit records may remain for legal, fraud-prevention or dispute-resolution needs. Shared records may remain where another user has a legitimate need.</li>
          <li>Manage Apple or Google subscription cancellation in the store separately. Deleting Clover does not automatically cancel those subscriptions.</li>
        </ul>
        <p>Read our <Link href="/privacy-policy#retention">retention and deletion policy</Link>. Never send passwords, one-time codes or identity documents with this request.</p>
        <ContactUsForm deletion />
      </section>
    </PublicInfoShell>
  );
}
