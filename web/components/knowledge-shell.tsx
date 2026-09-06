import type { ReactNode } from "react";
import Link from "next/link";
import { JourneyHeader } from "@/app/landing-preview/landing-journey";
import { PublicFooter } from "@/components/public-footer";
import styles from "./knowledge.module.css";

export function KnowledgeShell({
  children,
  active = "help",
}: {
  children: ReactNode;
  active?: "help" | "guide";
}) {
  return (
    <div className={styles.site}>
      <a className={styles.skip} href="#knowledge-main">
        Skip to content
      </a>
      <div className={styles.header}>
        <JourneyHeader />
      </div>
      <main id="knowledge-main" className={styles.wrap}>
        <nav className={styles.nav} aria-label="Help and guides">
          <Link
            href="/help"
            aria-current={active === "help" ? "page" : undefined}
          >
            Help Center
          </Link>
          <Link
            href="/guides"
            aria-current={active === "guide" ? "page" : undefined}
          >
            Guides
          </Link>
        </nav>
        {children}
      </main>
      <PublicFooter />
    </div>
  );
}
export function KnowledgeContact() {
  return (
    <aside className={styles.contact}>
      <div>
        <h2>Still need help?</h2>
        <p>
          Tell us what happened. Keep passwords and private financial details
          out of your message.
        </p>
      </div>
      <Link className={styles.button} href="/contact">
        Contact support <span aria-hidden="true"> →</span>
      </Link>
    </aside>
  );
}
