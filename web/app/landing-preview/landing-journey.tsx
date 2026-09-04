"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { LandingSignupModal } from "@/components/landing-signup-modal";
import styles from "./landing-preview.module.css";

const chapters = [
  { eyebrow: "A clearer day starts here", title: <>More life.<br /><em>Less money admin.</em></>, copy: "Clover turns the financial records you already have into a calm, useful picture of your money." },
  { eyebrow: "Morning · 8:14", title: <>Drop in<br /><em>the mess.</em></>, copy: "Statements, receipts, screenshots, and spreadsheets all arrive in the same place. No rebuilding your history by hand." },
  { eyebrow: "A few moments later", title: <>Watch the details<br /><em>find their place.</em></>, copy: "Accounts connect. Merchant names become readable. Categories improve as you confirm what Clover learned." },
  { eyebrow: "Midday · clarity arrives", title: <>Ask what changed.<br /><em>Get a useful answer.</em></>, copy: "Adviser understands the financial picture and the page you are on, so the conversation begins with context—not a blank box." },
  { eyebrow: "Afternoon · make it real", title: <>Turn a thought<br /><em>into a shared plan.</em></>, copy: "Shape a budget, start a goal, or settle a meal with friends. Every next step stays open, editable, and yours." },
  { eyebrow: "The rest of the day is yours", title: <>Money, handled.<br /><em>Life, uninterrupted.</em></>, copy: "Bring the files you already have. Clover will help you find the clearer next step—and then get out of the way." },
] as const;

function JourneyActions({ authEnabled }: { authEnabled: boolean }) {
  return (
    <div className={styles.actions}>
      {authEnabled ? <LandingSignupModal enabled>Organize my finances for free</LandingSignupModal> : <Link className="button button-primary button-pill" href="/sign-up" prefetch={false}>Organize my finances for free</Link>}
      <Link className="button button-secondary button-pill" href="/sign-in" prefetch={false}>Log in</Link>
    </div>
  );
}

export function LandingJourney({ authEnabled }: { authEnabled: boolean }) {
  const journeyRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const [chapter, setChapter] = useState(0);

  useEffect(() => {
    const journey = journeyRef.current;
    if (!journey) return;
    const update = () => {
      frameRef.current = null;
      const bounds = journey.getBoundingClientRect();
      const distance = Math.max(1, journey.offsetHeight - window.innerHeight);
      const progress = Math.min(1, Math.max(0, -bounds.top / distance));
      const nextChapter = Math.min(chapters.length - 1, Math.floor(progress * chapters.length));
      journey.style.setProperty("--scene-x", `${-progress * 7}%`);
      journey.style.setProperty("--scene-scale", `${1.04 + progress * 0.1}`);
      journey.style.setProperty("--sun-x", `${12 + progress * 72}%`);
      journey.style.setProperty("--sun-y", `${15 - Math.sin(progress * Math.PI) * 7}%`);
      journey.style.setProperty("--day-progress", progress.toFixed(4));
      journey.style.setProperty("--path-offset", `${progress * -240}px`);
      setChapter((current) => current === nextChapter ? current : nextChapter);
    };
    const requestUpdate = () => { if (frameRef.current === null) frameRef.current = window.requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);
    return () => {
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    };
  }, []);

  return (
    <div ref={journeyRef} className={styles.journey} data-chapter={chapter} style={{ "--scene-x": "0%", "--scene-scale": 1.04 } as CSSProperties}>
      <div className={styles.stage}>
        <nav className={styles.nav} aria-label="Primary">
          <Link href="/" className={styles.brand} aria-label="Clover home"><span className={styles.brandMark} aria-hidden="true"><i /><i /><i /><i /></span><span>clover</span></Link>
          <div className={styles.navLinks}><Link href="/features">What Clover does</Link><Link href="/help">Help</Link></div>
          <Link href="/sign-up" className={styles.navCta}>Start free</Link>
        </nav>

        <div className={styles.world} aria-hidden="true">
          <Image className={styles.worldImage} src="/assets/landing-story/clover-home.webp" alt="" fill priority sizes="100vw" />
          <div className={styles.lightWash} /><div className={styles.sun} />
          <svg className={styles.path} viewBox="0 0 1200 700" preserveAspectRatio="none"><path d="M-80 520 C160 440 180 180 430 235 C665 287 570 575 815 490 C1010 420 950 175 1280 126" /></svg>
        </div>

        <section className={styles.story} aria-live="polite">
          {chapters.map((item, index) => (
            <div className={styles.chapter} data-active={chapter === index} key={item.eyebrow} aria-hidden={chapter !== index}>
              <p>{item.eyebrow}</p><h1>{item.title}</h1><span>{item.copy}</span>
              {(index === 0 || index === chapters.length - 1) && <JourneyActions authEnabled={authEnabled} />}
            </div>
          ))}
        </section>

        <div className={styles.paperCloud} aria-hidden="true">
          <div className={styles.paper}><small>BANK STATEMENT</small><b>August</b><span /><span /><span /></div>
          <div className={styles.receipt}><small>MARKET</small><span>Groceries</span><b>₱2,480</b></div>
          <div className={styles.sheet}><i /><i /><i /><i /><i /><i /></div>
        </div>

        <div className={styles.dataStream} aria-hidden="true">
          {['Coffee shop', 'Rent', 'Groceries', 'Pay day'].map((label, index) => <div key={label} style={{ "--row": index } as CSSProperties}><i /><span>{label}</span><b>{index === 3 ? '+' : '−'} ₱{[220, 24000, 2480, 68000][index].toLocaleString()}</b></div>)}
        </div>

        <div className={styles.adviser} aria-hidden="true"><div className={styles.adviserMark}><span /><span /><span /><span /></div><p>Your dining spend is down 12%. Want to put the difference toward Japan?</p><div><span>Yes—make a plan</span><b>→</b></div></div>

        <div className={styles.plan} aria-hidden="true"><div className={styles.planIcon}>✈</div><small>JAPAN · SPRING</small><strong>68%</strong><span><i /></span><p>Comfortably on pace</p></div>

        <div className={styles.people} aria-hidden="true"><Image src="/assets/landing-story/clover-people.webp" alt="" width={900} height={1350} priority /></div>

        <div className={styles.progress} aria-label={`Story chapter ${chapter + 1} of ${chapters.length}`}><span><i style={{ height: `${((chapter + 1) / chapters.length) * 100}%` }} /></span><b>{String(chapter + 1).padStart(2, '0')}</b></div>
        <div className={styles.scrollCue} aria-hidden="true"><span>Scroll to follow the day</span><i /></div>
        <div className={styles.grain} aria-hidden="true" />
      </div>
    </div>
  );
}
