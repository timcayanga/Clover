import Image from "next/image";
import Link from "next/link";
import { FEATURE_LINKS } from "@/lib/public-site";
import styles from "./public-footer.module.css";

/** Outside the sticky story so footer height never changes chapter timing. */
export function PublicFooter() {
  return <footer className={styles.footer} aria-label="Clover site footer">
    <div className={styles.brand}>
      <Link href="/" aria-label="Clover home"><Image src="/clover-mark.svg" alt="" width={36} height={36} loading="eager" /><Image src="/clover-name-teal.svg" alt="Clover" width={110} height={32} loading="eager" /></Link>
      <p>Feel clearer about your money.</p>
    </div>
    <nav aria-label="Explore Clover">
      <h2>Explore Clover</h2>
      <Link href="/">Home</Link>
      {FEATURE_LINKS.map(link => <Link key={link.href} href={link.href}>{link.label}</Link>)}
    </nav>
    <nav aria-label="Help and legal">
      <h2>Here to help</h2>
      <Link href="/help">Help</Link>
      <Link href="/contact">Contact</Link>
      <Link href="/privacy-policy">Privacy Policy</Link>
      <Link href="/terms-of-service">Terms of Service</Link>
    </nav>
  </footer>;
}
