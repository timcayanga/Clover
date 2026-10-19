import Image from "next/image";
import Link from "next/link";
import { FEATURE_LINKS, SOCIAL_LINKS } from "@/lib/public-site";
import { StoreAvailability } from "./app-store-links";
import styles from "./public-footer.module.css";

/** Outside the sticky story so footer height never changes chapter timing. */
export function PublicFooter({ includeTikTok = false, storeVariant = "text" }: { includeTikTok?: boolean; storeVariant?: "text" | "badges" | "white" } = {}) {
  return <footer className={styles.footer} aria-label="Clover site footer">
    <div className={styles.brand}>
      <Link href="/" aria-label="Clover home"><Image src="/clover-mark.svg" alt="" width={36} height={36} loading="eager" /><Image src="/clover-name-teal.svg" alt="Clover" width={110} height={32} loading="eager" /></Link>
      <p>Money looks better from here</p>
      <StoreAvailability variant={storeVariant} />
    </div>
    <nav className={styles.features} aria-label="Features">
      <h2>Features</h2>
      {FEATURE_LINKS.filter(link => !["/features/security", "/features/pro"].includes(link.href)).map(link => <Link key={link.href} href={link.href}>{link.label}</Link>)}
    </nav>
    <nav className={styles.support} aria-label="Help & Support">
      <h2>Help &amp; Support</h2>
      <Link href="/help">Help</Link>
      <Link href="/guides">Guides</Link>
      <Link href="/contact-us">Contact</Link>
      <Link href="/pricing">Pricing</Link>
    </nav>
    <nav className={styles.resources} aria-label="Other Resources">
      <h2>Other Resources</h2>
      <Link href="/features/pro">Pro</Link>
      <Link href="/features/security">Security</Link>
      <Link href="/privacy-policy">Privacy Policy</Link>
      <Link href="/terms-of-service">Terms of Service</Link>
    </nav>
    <nav className={styles.socials} aria-label="Follow Clover">
      {SOCIAL_LINKS.map(link => <a key={link.href} href={link.href} aria-label={link.label} title={link.label}>
        {link.label === "Facebook" ? <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.095 10.125 24v-8.437H7.078v-3.49h3.047v-2.66c0-3.026 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.972h-1.513c-1.49 0-1.956.931-1.956 1.887v2.262h3.328l-.532 3.49h-2.796V24C19.612 23.095 24 18.1 24 12.073Z" /></svg> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" focusable="false"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" /></svg>}
      </a>)}
      {includeTikTok && <a href="https://www.tiktok.com/@cloverpersonalfinance" aria-label="TikTok" title="TikTok"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.5 2c.4 2.7 1.9 4.3 4.5 4.5V10a10 10 0 0 1-4.5-1.4v7.2a6.2 6.2 0 1 1-5.3-6.1v3.6a2.7 2.7 0 1 0 1.8 2.5V2z"/></svg></a>}
      <a href="https://www.youtube.com/@cloverpersonalfinance" aria-label="YouTube: @cloverpersonalfinance" title="YouTube: @cloverpersonalfinance"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1c.5-1.9.5-5.8.5-5.8s0-3.9-.5-5.8ZM9.6 15.6V8.4l6.2 3.6-6.2 3.6Z" /></svg></a>
    </nav>
  </footer>;
}
