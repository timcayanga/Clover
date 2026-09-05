"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { PublicAccountActions } from "@/components/public-account-actions";
import { HEADER_NAV_CATEGORIES, PRODUCT_LINKS, type PublicNavCategory, type PublicNavLink } from "@/lib/public-site";
import type { PublicAccountState } from "@/lib/public-account-state";

type LandingNavProps = {
  accountState?: PublicAccountState | null;
};

function MenuIcon() {
  return (
    <span className="landing-nav__mobile-bars" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

function Chevron() {
  return <span className="landing-nav__chevron" aria-hidden="true">▾</span>;
}

function normalizePath(pathname: string) {
  if (!pathname) {
    return "/";
  }

  return pathname.replace(/\/+$/, "") || "/";
}

function isLinkActive(pathname: string, item: PublicNavLink) {
  const normalizedPathname = normalizePath(pathname);
  const normalizedHref = normalizePath(item.href);

  if (normalizedHref === "/") {
    return normalizedPathname === "/";
  }

  return normalizedPathname === normalizedHref || normalizedPathname.startsWith(`${normalizedHref}/`);
}

function isCategoryActive(pathname: string, category: PublicNavCategory) {
  return category.items.some((item) => isLinkActive(pathname, item));
}

export function LandingNav({ accountState }: LandingNavProps) {
  const pathname = usePathname();
  const currentPathname = pathname ?? "";
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeDesktopMenu, setActiveDesktopMenu] = useState<string | null>(null);
  const navRef = useRef<HTMLElement | null>(null);

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
    setActiveDesktopMenu(null);
  }, [currentPathname]);

  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!navRef.current) {
        return;
      }

      if (!navRef.current.contains(event.target as Node)) {
        setActiveDesktopMenu(null);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveDesktopMenu(null);
        setMobileMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const navClassName = `landing-nav landing-nav--sticky ${isScrolled ? "landing-nav--scrolled" : ""}`.trim();
  const desktopCategories = useMemo(() => HEADER_NAV_CATEGORIES, []);
  const directLinks = useMemo(() => PRODUCT_LINKS, []);

  return (
    <header ref={navRef} className={navClassName}>
      <div className="landing-nav__desktop" aria-label="Primary">
        <Link className="landing-brand landing-brand--desktop" href="/" aria-label="Clover home" prefetch={false}>
          <img className="landing-brand__mark" src="/clover-mark.svg" alt="" aria-hidden="true" loading="eager" fetchPriority="high" />
          <img className="landing-brand__wordmark" src="/clover-name-teal.svg" alt="Clover" loading="eager" fetchPriority="high" />
        </Link>

        <nav className="landing-nav__menus" aria-label="Public site sections">
          {desktopCategories.map((category) => {
            const expanded = activeDesktopMenu === category.label;
            const categoryActive = isCategoryActive(currentPathname, category);

            return (
              <div key={category.label} className="landing-nav__menu">
                <button
                  className={`landing-nav__menu-trigger ${categoryActive ? "landing-nav__menu-trigger--active" : ""} ${expanded ? "is-active" : ""}`.trim()}
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setActiveDesktopMenu((current) => (current === category.label ? null : category.label))}
                >
                  <span>{category.label}</span>
                  <Chevron />
                </button>

                {expanded ? (
                  <div className="landing-nav__submenu" role="menu" aria-label={category.label}>
                    {category.items.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        prefetch={false}
                        className={item.featured ? "landing-nav__submenu-link landing-nav__submenu-link--featured" : "landing-nav__submenu-link"}
                        aria-current={isLinkActive(currentPathname, item) ? "page" : undefined}
                        onClick={() => setActiveDesktopMenu(null)}
                      >
                        <strong>{item.label}</strong>
                        {item.products ? <small style={{display:"block",fontWeight:400,fontSize:11,lineHeight:1.5}}>{item.products}</small> : null}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}

          {directLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              className="landing-nav__link"
              aria-current={isLinkActive(currentPathname, item) ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <PublicAccountActions accountState={accountState} />
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
          <img className="landing-brand__mark" src="/clover-mark.svg" alt="" aria-hidden="true" loading="eager" fetchPriority="high" />
          <img className="landing-brand__wordmark" src="/clover-name-teal.svg" alt="Clover" loading="eager" fetchPriority="high" />
        </Link>

        <PublicAccountActions variant="mobile" accountState={accountState} />
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
            <Link className="landing-nav__mobile-home-link" href="/" prefetch={false} onClick={() => setMobileMenuOpen(false)}>
              Home
            </Link>

            {HEADER_NAV_CATEGORIES.map((category) => (
              <div key={category.label} className="landing-nav__mobile-menu-group">
                <p className="landing-nav__mobile-menu-label">{category.label}</p>
                {category.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={false}
                    className={item.featured ? "landing-nav__mobile-menu-link landing-nav__mobile-menu-link--featured" : "landing-nav__mobile-menu-link"}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <strong>{item.label}</strong>
                    {item.products ? <small style={{display:"block",fontWeight:400,fontSize:11,lineHeight:1.5}}>{item.products}</small> : null}
                  </Link>
                ))}
              </div>
            ))}

            <div className="landing-nav__mobile-menu-group">
              {PRODUCT_LINKS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
                  className="landing-nav__mobile-menu-link"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <strong>{item.label}</strong>
                </Link>
              ))}
            </div>

            {!accountState?.signedIn ? (
              <div className="landing-nav__mobile-menu-group">
                <p className="landing-nav__mobile-menu-label">Account</p>
                <Link href="/sign-in" prefetch={false} onClick={() => setMobileMenuOpen(false)}>
                  Log in
                </Link>
                <Link href="/sign-up" prefetch={false} onClick={() => setMobileMenuOpen(false)}>
                  Sign up
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </header>
  );
}
