"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export function LandingNav() {
  const [isScrolled, setIsScrolled] = useState(false);

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

  return (
    <header
      className={`landing-nav landing-nav--sticky ${isScrolled ? "landing-nav--scrolled" : ""}`.trim()}
      data-scrolled={isScrolled ? "true" : "false"}
    >
      <Link className="landing-brand" href="/" aria-label="Clover home" prefetch={false}>
        <img className="landing-brand__mark" src="/clover-mark.svg" alt="" aria-hidden="true" />
        <img className="landing-brand__wordmark" src="/clover-name-teal.svg" alt="Clover" />
      </Link>

      <nav className="landing-nav__links" aria-label="Primary">
        <Link className="landing-nav__link" href="/pricing" prefetch={false}>
          Pricing
        </Link>
        <Link className="landing-nav__link" href="/sign-in" prefetch={false}>
          Log in
        </Link>
        <Link className="button button-primary landing-nav__button" href="/sign-up" prefetch={false}>
          Sign up
        </Link>
      </nav>
    </header>
  );
}
