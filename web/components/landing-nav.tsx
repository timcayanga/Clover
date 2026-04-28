"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export function LandingNav() {
  const pathname = usePathname();
  const [featuresOpen, setFeaturesOpen] = useState(pathname.startsWith("/features"));

  useEffect(() => {
    setFeaturesOpen(pathname.startsWith("/features"));
  }, [pathname]);

  return (
    <header className="landing-nav landing-nav--sticky">
      <Link className="landing-brand" href="/" aria-label="Clover home" prefetch={false}>
        <img className="landing-brand__mark" src="/clover-mark.svg" alt="" aria-hidden="true" />
        <img className="landing-brand__wordmark" src="/clover-name-teal.svg" alt="Clover" />
      </Link>

      <nav className="landing-nav__links" aria-label="Primary">
        <div className="landing-nav__menu">
          <button
            type="button"
            className={`landing-nav__link landing-nav__menu-trigger ${pathname.startsWith("/features") ? "is-active" : ""}`.trim()}
            aria-expanded={featuresOpen}
            aria-controls="landing-features-menu"
            onClick={() => setFeaturesOpen((current) => !current)}
          >
            Features
            <span className="landing-nav__chevron" aria-hidden="true">
              ▾
            </span>
          </button>
          {featuresOpen ? (
            <div className="landing-nav__submenu" id="landing-features-menu" role="menu" aria-label="Features submenu">
              <Link href="/features" prefetch={false} role="menuitem">
                Overview
              </Link>
              <Link href="/features#upload" prefetch={false} role="menuitem">
                Upload
              </Link>
              <Link href="/features#understand" prefetch={false} role="menuitem">
                Understand
              </Link>
              <Link href="/features#review" prefetch={false} role="menuitem">
                Review
              </Link>
              <Link href="/features#plan" prefetch={false} role="menuitem">
                Plan
              </Link>
            </div>
          ) : null}
        </div>
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
