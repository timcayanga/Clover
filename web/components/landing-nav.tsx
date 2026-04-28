"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function LandingNav() {
  const pathname = usePathname();

  return (
    <header className="landing-nav landing-nav--sticky">
      <Link className="landing-brand" href="/" aria-label="Clover home" prefetch={false}>
        <img className="landing-brand__mark" src="/clover-mark.svg" alt="" aria-hidden="true" />
        <img className="landing-brand__wordmark" src="/clover-name-teal.svg" alt="Clover" />
      </Link>

      <nav className="landing-nav__links" aria-label="Primary">
        <Link className="landing-nav__link" href="/features" prefetch={false} aria-current={pathname === "/features" ? "page" : undefined}>
          Features
        </Link>
        <Link className="landing-nav__link" href="/pricing" prefetch={false} aria-current={pathname === "/pricing" ? "page" : undefined}>
          Pricing
        </Link>
        <Link className="landing-nav__link" href="/help" prefetch={false} aria-current={pathname === "/help" ? "page" : undefined}>
          Help
        </Link>
        <Link className="landing-nav__link" href="/sign-in" prefetch={false} aria-current={pathname === "/sign-in" ? "page" : undefined}>
          Log in
        </Link>
        <Link className="button button-primary landing-nav__button" href="/sign-up" prefetch={false}>
          Sign up
        </Link>
      </nav>
    </header>
  );
}
