"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { PublicAccountActions } from "@/components/public-account-actions";

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
  const currentPathname = pathname ?? "";
  const [isScrolled, setIsScrolled] = useState(false);
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
    setMobileMenuOpen(false);
  }, [currentPathname]);

  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  const navClassName = `landing-nav landing-nav--sticky ${isScrolled ? "landing-nav--scrolled" : ""}`.trim();

  return (
    <header className={navClassName}>
      <div className="landing-nav__desktop" aria-label="Primary">
        <Link className="landing-brand landing-brand--desktop" href="/" aria-label="Clover home" prefetch={false}>
          <img className="landing-brand__mark" src="/clover-mark.svg" alt="" aria-hidden="true" />
          <img className="landing-brand__wordmark" src="/clover-name-teal.svg" alt="Clover" />
        </Link>

        <PublicAccountActions />
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

        <PublicAccountActions variant="mobile" />
      </div>

      {mobileMenuOpen ? (
        <div className="landing-nav__mobile-layer">
          <button
            type="button"
            className="landing-nav__mobile-backdrop"
            aria-label="Close menu"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="landing-nav__mobile-menu glass" id="landing-mobile-menu" role="dialog" aria-label="Primary menu">
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
