import type { Metadata } from "next";
import Link from "next/link";
import { ContactUsForm } from "@/components/contact-us-form";
import { LandingNav } from "@/components/landing-nav";
import { resolvePublicAccountState } from "@/lib/public-account-state";

export const metadata: Metadata = {
  title: "Contact Us",
  description: "Send Clover a question or support request and reach the team directly from the Contact Us page.",
  keywords: ["contact Clover", "Clover support", "help@clover.ph", "support request", "finance app help"],
};

export default async function ContactUsPage() {
  const accountState = await resolvePublicAccountState();

  return (
    <main className="contact-page">
      <LandingNav accountState={accountState} />

      <div className="contact-page__inner">
        <header className="contact-page__header">
          <h1>Contact us</h1>
          <p>
            The Clover team will get back to you within 1 to 3 days. Please fill out every required field so we can review your message
            quickly.
          </p>
        </header>

        <section className="contact-page__layout">
          <ContactUsForm />
        </section>
      </div>

      <footer className="landing-footer" aria-label="Legal links">
        <nav className="landing-footer__nav" aria-label="Legal">
          <Link href="/contact-us" prefetch={false}>
            Contact Us
          </Link>
          <Link href="/privacy-policy" prefetch={false}>
            Privacy Policy
          </Link>
          <Link href="/terms-of-service" prefetch={false}>
            Terms of Service
          </Link>
        </nav>
      </footer>
    </main>
  );
}
