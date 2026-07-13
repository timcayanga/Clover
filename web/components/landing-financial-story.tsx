"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";

type ArtVariant = "hero" | "files" | "insights" | "people" | "pro" | "security";

function LandingArtScene({ src, alt, variant, priority = false }: { src: string; alt: string; variant: ArtVariant; priority?: boolean }) {
  return (
    <div className={`landing-art-scene landing-art-scene--${variant}`} role="img" aria-label={alt}>
      <div className="landing-art-scene__halo" aria-hidden="true" />
      <div className="landing-art-scene__shadow" aria-hidden="true" />
      <div className="landing-art-scene__plane landing-art-scene__plane--back" aria-hidden="true">
        <Image src={src} alt="" fill priority={priority} sizes="(max-width: 980px) 96vw, 68vw" />
      </div>
      <div className="landing-art-scene__plane landing-art-scene__plane--main">
        <Image src={src} alt="" fill priority={priority} sizes="(max-width: 980px) 96vw, 68vw" />
      </div>
      <div className="landing-art-scene__plane landing-art-scene__plane--near" aria-hidden="true">
        <Image src={src} alt="" fill priority={priority} sizes="(max-width: 980px) 96vw, 68vw" />
      </div>
      <span className="landing-art-scene__spark landing-art-scene__spark--one" aria-hidden="true" />
      <span className="landing-art-scene__spark landing-art-scene__spark--two" aria-hidden="true" />
    </div>
  );
}

function CloverCore() {
  return (
    <div className="gravity-core" aria-hidden="true">
      <Image className="gravity-core__logo" src="/clover-mark.svg" alt="" width={128} height={128} />
    </div>
  );
}

function StorySection({ id, eyebrow, title, copy, visual, reverse = false, dark = false }: {
  id: string;
  eyebrow: string;
  title: ReactNode;
  copy: ReactNode;
  visual: ReactNode;
  reverse?: boolean;
  dark?: boolean;
}) {
  return (
    <section className={`gravity-chapter ${dark ? "gravity-chapter--deep" : ""} ${reverse ? "gravity-chapter--reverse" : ""}`} id={id} data-gravity-chapter>
      <div className="gravity-chapter__inner">
        <div className="gravity-chapter__copy">
          <span className="gravity-chapter__eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
          <div>{copy}</div>
        </div>
        <div className="gravity-chapter__stage">{visual}</div>
      </div>
    </section>
  );
}

export function LandingFinancialStory() {
  const storyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = storyRef.current;
    if (!root) return;
    const chapters = Array.from(root.querySelectorAll<HTMLElement>("[data-gravity-chapter]"));
    let frame = 0;
    const update = () => {
      frame = 0;
      const viewport = window.innerHeight || 1;
      chapters.forEach((chapter) => {
        const rect = chapter.getBoundingClientRect();
        const progress = Math.max(0, Math.min(1, (viewport - rect.top) / (viewport + rect.height)));
        const distance = Math.abs(rect.top + rect.height / 2 - viewport / 2);
        chapter.style.setProperty("--gravity-progress", progress.toFixed(3));
        chapter.classList.toggle("is-gravity-active", distance < Math.max(viewport * 0.68, rect.height * 0.48));
      });
    };
    const requestUpdate = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    const updatePointer = (event: PointerEvent) => {
      root.style.setProperty("--gravity-pointer-x", (((event.clientX / window.innerWidth) - 0.5) * 2).toFixed(3));
      root.style.setProperty("--gravity-pointer-y", (((event.clientY / window.innerHeight) - 0.5) * 2).toFixed(3));
    };
    const resetPointer = () => {
      root.style.setProperty("--gravity-pointer-x", "0");
      root.style.setProperty("--gravity-pointer-y", "0");
    };
    update();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);
    window.addEventListener("pointermove", updatePointer, { passive: true });
    document.documentElement.addEventListener("mouseleave", resetPointer);
    return () => {
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
      window.removeEventListener("pointermove", updatePointer);
      document.documentElement.removeEventListener("mouseleave", resetPointer);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="gravity-story gravity-story--original-art" ref={storyRef}>
      <section className="gravity-hero" data-gravity-chapter>
        <div className="gravity-hero__inner">
          <div className="gravity-hero__copy">
            <h1>Months of finances.<br /><em>Organized in minutes.</em></h1>
            <p>Upload the financial files you already have. Clover organizes them so you can follow your money movement and keep track of your net worth.</p>
            <div className="gravity-hero__actions">
              <Link className="button button-primary button-pill" href="/sign-up" prefetch={false}>Organize my finances for free</Link>
              <Link className="button button-secondary button-pill" href="/sign-in" prefetch={false}>Log in</Link>
            </div>
            <div className="gravity-hero__proof"><span>No card required</span><span>Review before saving</span><span>Your data stays yours</span></div>
          </div>
          <div className="gravity-hero__stage">
            <LandingArtScene src="/assets/landing page/hero card.png" alt="Financial files becoming organized Clover transactions and accounts" variant="hero" priority />
          </div>
        </div>
      </section>

      <StorySection id="statement-import" eyebrow="Bring every record together" reverse title={<>Upload what you have. <em>Skip the typing.</em></>} copy={<><p>Add statements, receipts, screenshots, or spreadsheets. Enter anything else manually.</p><p>Clover turns those records into organized transactions and months of usable history.</p></>} visual={<LandingArtScene src="/assets/landing page/statements.png" alt="Statements, receipts, and transaction records ready to upload" variant="files" />} />
      <StorySection id="insights" eyebrow="Follow every movement" title={<>See where your money <em>comes and goes.</em></>} copy={<><p>Organized transactions become a clear view of income, spending, transfers, and savings.</p><p>See patterns across months and understand what changed without rebuilding reports by hand.</p></>} visual={<LandingArtScene src="/assets/landing page/see what your money is telling you.png" alt="A person exploring financial reports, goals, and spending insights" variant="insights" />} />
      <StorySection id="split-bills" eyebrow="Share without awkward math" reverse title={<>One expense. Everyone’s share, <em>made clear.</em></>} copy={<><p>Choose a transaction, add the people involved, and Clover works out each share.</p><p>Everyone can see who paid, who owes, and what has already been settled.</p></>} visual={<LandingArtScene src="/assets/landing page/share expenses.png" alt="Friends dividing a shared expense together" variant="people" />} />
      <StorySection id="pro" eyebrow="Your complete financial picture" dark title={<>Keep your <em>net worth</em> in view.</>} copy={<><p>Pro brings cash, debts, investments, and account balances into one continuously updated picture.</p><p>See what you own, what you owe, and how your net worth changes over time.</p></>} visual={<LandingArtScene src="/assets/landing page/pro.png" alt="Advanced reports, higher limits, and investment tools in Clover Pro" variant="pro" />} />
      <StorySection id="trust" eyebrow="Stay in control" reverse title={<>Your financial data stays <em>yours.</em></>} copy={<><p>Your files, accounts, and financial history are protected and separated from everyone else’s.</p><p>You decide what enters Clover, review what was extracted, and control access to your account.</p></>} visual={<LandingArtScene src="/assets/landing page/security.png" alt="Security shield protecting files, data, and account access" variant="security" />} />

      <section className="gravity-finale" data-gravity-chapter>
        <CloverCore />
        <h2>Make money management feel simpler.</h2>
        <p>Bring your records together and start seeing the story behind your money.</p>
        <div className="gravity-finale__actions">
          <Link className="button button-primary button-pill" href="/sign-up" prefetch={false}>Organize my finances for free</Link>
          <Link className="button button-secondary button-pill" href="/sign-in" prefetch={false}>Log in</Link>
        </div>
      </section>
    </div>
  );
}
