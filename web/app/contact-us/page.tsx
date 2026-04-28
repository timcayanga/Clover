import type { Metadata } from "next";
import Link from "next/link";
import { ContactUsForm } from "@/components/contact-us-form";

export const metadata: Metadata = {
  title: "Contact Us",
  description: "Send Clover a question or support request and reach the team directly from the Contact Us page.",
  keywords: ["contact Clover", "Clover support", "help@clover.ph", "support request", "finance app help"],
};

export default function ContactUsPage() {
  return (
    <main className="contact-page">
      <div className="contact-page__inner">
        <nav className="contact-page__nav" aria-label="Contact page navigation">
          <Link className="landing-brand" href="/" aria-label="Clover home">
            <img className="landing-brand__logo" src="/clover-logo-full.svg" alt="Clover" />
          </Link>
          <div className="contact-page__nav-links">
            <Link href="/help">Help</Link>
            <Link href="/privacy-policy">Privacy Policy</Link>
            <Link href="/terms-of-service">Terms of Service</Link>
          </div>
        </nav>

        <header className="contact-page__header">
          <span className="contact-page__eyebrow">Clover support</span>
          <h1>Contact us</h1>
          <p>
            Ask a question, report a concern, or tell us what is not working. Every message is required to include your name, email, and
            inquiry so we can route it cleanly.
          </p>
        </header>

        <section className="contact-page__layout">
          <div className="contact-page__aside glass">
            <p className="eyebrow">Where it goes</p>
            <h2>We keep support in one place</h2>
            <p>
              Your message lands in the Clover admin inbox for review. The team can respond from <a href="mailto:help@clover.ph">help@clover.ph</a>{" "}
              and track replies directly in Admin.
            </p>
            <ul>
              <li>Setup and onboarding questions</li>
              <li>Import, review, and account issues</li>
              <li>Billing, privacy, and data concerns</li>
            </ul>
          </div>

          <ContactUsForm helpEmail="help@clover.ph" />
        </section>
      </div>
    </main>
  );
}
