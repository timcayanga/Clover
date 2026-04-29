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
    </main>
  );
}
