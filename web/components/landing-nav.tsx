"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

function MenuIcon() {
  return (
    <span className="landing-nav__mobile-bars" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

export function LandingNav() {
  const pathname = usePathname();
  const [isScrolled, setIsScrolled] = useState(false);
  const [featuresOpen, setFeaturesOpen] = useState(pathname.startsWith("/features"));
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const updateScrollState = () => {
      setIsScrolled(window.scrollY > 0);
    };

    updateScrollState();
    window.addEventListener("scroll", updateScrollState, { passive: true });

    return () => {
      window.removeEventListener("scroll", updateScrollState);
    };
  }, []);

  useEffect(() => {
    setFeaturesOpen(pathname.startsWith("/features"));
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  const isFeaturesRoute = pathname.startsWith("/features");
  const navClassName = `landing-nav landing-nav--sticky ${isScrolled ? "landing-nav--scrolled" : ""}`.trim();

  return (
    <header className={navClassName}>
      <div className="landing-nav__desktop" aria-label="Primary">
        <Link className="landing-brand landing-brand--desktop" href="/" aria-label="Clover home" prefetch={false}>
          <img className="landing-brand__mark" src="/clover-mark.svg" alt="" aria-hidden="true" />
          <img className="landing-brand__wordmark" src="/clover-name-teal.svg" alt="Clover" />
        </Link>

        <div className="landing-nav__desktop-center">
          <div className="landing-nav__menu">
            <button
              type="button"
              className={`landing-nav__link landing-nav__menu-trigger ${isFeaturesRoute ? "is-active" : ""}`.trim()}
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
        </div>

        <div className="landing-nav__desktop-actions">
          <Link className="landing-nav__link" href="/sign-in" prefetch={false} aria-current={pathname === "/sign-in" ? "page" : undefined}>
            Log in
          </Link>
          <Link className="button button-primary landing-nav__button" href="/sign-up" prefetch={false}>
            Sign up
          </Link>
        </div>
      </div>

      <div className="landing-nav__mobile" aria-label="Primary">
        <button
          className="landing-nav__mobile-toggle"
          type="button"
          aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileMenuOpen}
          aria-controls="landing-mobile-menu"
          onClick={() => setMobileMenuOpen((current) => !current)}
        >
          <MenuIcon />
        </button>

        <Link className="landing-brand landing-brand--mobile" href="/" aria-label="Clover home" prefetch={false}>
          <img className="landing-brand__mark" src="/clover-mark.svg" alt="" aria-hidden="true" />
          <img className="landing-brand__wordmark" src="/clover-name-teal.svg" alt="Clover" />
        </Link>

        <Link className="button button-primary landing-nav__mobile-signup" href="/sign-up" prefetch={false}>
          Sign up
        </Link>
      </div>

      {mobileMenuOpen ? (
        <div className="landing-nav__mobile-backdrop" onClick={() => setMobileMenuOpen(false)} aria-hidden="true">
          <div className="landing-nav__mobile-menu glass" id="landing-mobile-menu" role="dialog" aria-label="Primary menu" onClick={(event) => event.stopPropagation()}>
            <div className="landing-nav__mobile-menu-group">
              <p className="landing-nav__mobile-menu-label">Pages</p>
              <Link href="/" prefetch={false} onClick={() => setMobileMenuOpen(false)}>
                Home
              </Link>
              <Link href="/features" prefetch={false} onClick={() => setMobileMenuOpen(false)}>
                Features
              </Link>
              <Link href="/pricing" prefetch={false} onClick={() => setMobileMenuOpen(false)}>
                Pricing
              </Link>
              <Link href="/help" prefetch={false} onClick={() => setMobileMenuOpen(false)}>
                Help
              </Link>
            </div>

            <div className="landing-nav__mobile-menu-group">
              <p className="landing-nav__mobile-menu-label">Features</p>
              <Link href="/features#upload" prefetch={false} onClick={() => setMobileMenuOpen(false)}>
                Upload
              </Link>
              <Link href="/features#understand" prefetch={false} onClick={() => setMobileMenuOpen(false)}>
                Understand
              </Link>
              <Link href="/features#review" prefetch={false} onClick={() => setMobileMenuOpen(false)}>
                Review
              </Link>
              <Link href="/features#plan" prefetch={false} onClick={() => setMobileMenuOpen(false)}>
                Plan
              </Link>
            </div>

            <div className="landing-nav__mobile-menu-group">
              <p className="landing-nav__mobile-menu-label">Account</p>
              <Link href="/sign-in" prefetch={false} onClick={() => setMobileMenuOpen(false)}>
                Log in
              </Link>
              <Link href="/sign-up" prefetch={false} onClick={() => setMobileMenuOpen(false)}>
                Sign up
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
