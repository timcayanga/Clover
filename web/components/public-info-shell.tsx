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
  active: "contact" | "privacy" | "terms";
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
        <nav className={styles.nav} aria-label="Contact and legal information">
          {[
            ["contact", "/contact-us", "Contact"],
            ["privacy", "/privacy-policy", "Privacy Policy"],
            ["terms", "/terms-of-service", "Terms of Service"],
          ].map(([key, href, label]) => (
            <Link
              key={key}
              href={href}
              aria-current={active === key ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>
        {children}
      </main>
      <PublicFooter />
    </div>
  );
}
