import Image from "next/image";
import Link from "next/link";
import { FEATURE_LINKS, SOCIAL_LINKS } from "@/lib/public-site";
import styles from "./public-footer.module.css";

/** Outside the sticky story so footer height never changes chapter timing. */
export function PublicFooter() {
  return <footer className={styles.footer} aria-label="Clover site footer">
    <div className={styles.brand}>
      <Link href="/" aria-label="Clover home"><Image src="/clover-mark.svg" alt="" width={36} height={36} loading="eager" /><Image src="/clover-name-teal.svg" alt="Clover" width={110} height={32} loading="eager" /></Link>
      <p>Money looks better from here</p>
    </div>
    <nav className={styles.features} aria-label="Features">
      <h2>Features</h2>
      {FEATURE_LINKS.filter(link => !["/features/security", "/features/pro"].includes(link.href)).map(link => <Link key={link.href} href={link.href}>{link.label}</Link>)}
    </nav>
    <nav className={styles.support} aria-label="Help & Support">
      <h2>Help &amp; Support</h2>
      <Link href="/help">Help</Link>
      <Link href="/guides">Guides</Link>
      <Link href="/contact">Contact</Link>
      <Link href="/pricing">Pricing</Link>
    </nav>
    <nav className={styles.resources} aria-label="Other Resources">
      <h2>Other Resources</h2>
      <Link href="/features/security">Privacy and Security</Link>
      <Link href="/features/pro">Pro</Link>
      <Link href="/privacy-policy">Privacy Policy</Link>
      <Link href="/terms-of-service">Terms of Service</Link>
    </nav>
    <nav className={styles.socials} aria-label="Follow Clover">
      {SOCIAL_LINKS.map(link => <a key={link.href} href={link.href} aria-label={link.label} title={link.label}>
        {link.label === "Facebook" ? <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.095 10.125 24v-8.437H7.078v-3.49h3.047v-2.66c0-3.026 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.972h-1.513c-1.49 0-1.956.931-1.956 1.887v2.262h3.328l-.532 3.49h-2.796V24C19.612 23.095 24 18.1 24 12.073Z" /></svg> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" focusable="false"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" /></svg>}
      </a>)}
    </nav>
  </footer>;
}
