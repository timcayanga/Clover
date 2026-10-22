import type { ReactNode } from "react";
import Link from "next/link";
import { JourneyHeader } from "@/app/landing-preview/landing-journey";
import { PublicFooter } from "@/components/public-footer";
import styles from "./public-info.module.css";

export function PublicInfoShell({
  children,
  active,
}: {
  children: ReactNode;
  active?: "contact" | "privacy" | "terms" | "refund" | "disputes" | "business";
}) {
  return (
    <div className={styles.site}>
      <a className={styles.skip} href="#public-info-main">
        Skip to content
      </a>
      <div className={styles.header}>
        <JourneyHeader />
      </div>
      <main id="public-info-main" className={styles.wrap}>
        {active ? <nav className={styles.nav} aria-label="Contact and legal information">
          {[
            ["contact", "/contact-us", "Contact"],
            ["privacy", "/privacy-policy", "Privacy Policy"],
            ["terms", "/terms-of-service", "Terms and Conditions"],
            ["refund", "/refund-policy", "Returns and Refunds"],
            ["disputes", "/dispute-resolution", "Dispute Resolution"],
            ["business", "/business-registration", "Business Details"],
          ].map(([key, href, label]) => (
            <Link
              key={key}
              href={href}
              aria-current={active === key ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
        </nav> : null}
        {children}
      </main>
      <PublicFooter />
    </div>
  );
}
