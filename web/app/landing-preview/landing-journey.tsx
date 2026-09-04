"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { LandingSignupModal } from "@/components/landing-signup-modal";
import styles from "./landing-preview.module.css";

const chapters = [
  { title: <>Months of finances.<br /><em>Organized in minutes.</em></>, copy: "Upload statements, receipts, screenshots, or spreadsheets. Understand your money and take one clearer step at a time." },
  { title: <>Never rebuild your financial history <em>again.</em></>, copy: "Bring the files already on your phone or computer. Clover reads the details so you do not have to enter every transaction manually." },
  { title: <>Your files become one clear <em>financial picture.</em></>, copy: "Transactions, accounts, balances, and categories come together in a searchable view you can review and correct." },
  { title: <>Finally understand where your money actually <em>goes.</em></>, copy: "Ask Adviser what changed, what caused it, and what deserves your attention next—using your own financial context." },
  { title: <>Turn every insight into one clear <em>next step.</em></>, copy: "Build a budget, adjust a goal, review a recurring payment, or settle a shared expense right from the recommendation." },
  { title: <>Your money, handled.<br /><em>Your life, uninterrupted.</em></>, copy: null },
] as const;

const scenes = ["01-organize", "02-upload", "03-picture", "04-adviser", "05-plan", "06-life"] as const;

function JourneyActions({ authEnabled, final = false }: { authEnabled: boolean; final?: boolean }) {
  return <div className={styles.actions}>
    {authEnabled ? <LandingSignupModal enabled>Organize my finances for free</LandingSignupModal> : <Link className="button button-primary button-pill" href="/sign-up" prefetch={false}>Organize my finances for free</Link>}
    {!final && <Link className="button button-secondary button-pill" href="/sign-in" prefetch={false}>Log in</Link>}
  </div>;
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
      journey.style.setProperty("--journey-progress", progress.toFixed(4));
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

  const goToChapter = (index: number) => {
    const journey = journeyRef.current;
    if (!journey) return;
    const distance = journey.offsetHeight - window.innerHeight;
    const top = window.scrollY + journey.getBoundingClientRect().top + distance * ((index + 0.08) / chapters.length);
    window.scrollTo({ top, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };

  return <div ref={journeyRef} className={styles.journey} data-chapter={chapter} style={{ "--journey-progress": 0 } as CSSProperties}>
    <div className={styles.stage}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="Clover home">
          <Image src="/clover-mark.svg" alt="" width={44} height={44} priority />
          <Image src="/clover-name-teal.svg" alt="Clover" width={132} height={32} priority />
        </Link>
        <nav aria-label="Public site"><Link href="/features">Features</Link><Link href="/help">Help</Link><Link href="/contact-us">Contact</Link></nav>
        <div className={styles.headerActions}><Link href="/sign-in">Log in</Link><Link href="/sign-up">Sign up</Link></div>
      </header>

      <div className={styles.world} aria-hidden="true">
        <div className={styles.sceneStack}>
          {scenes.map((scene, index) => (
            <picture className={styles.scene} data-active={chapter === index} key={scene}>
              <source media="(max-width: 900px)" srcSet={`/assets/landing-story-v2/${scene}-mobile.webp`} />
              <img src={`/assets/landing-story-v2/${scene}.webp`} alt="" fetchPriority={index === 0 ? "high" : "auto"} />
            </picture>
          ))}
        </div>
        <div className={styles.worldWash} />
        <svg viewBox="0 0 1200 700" preserveAspectRatio="none"><path d="M-70 470 C160 390 210 150 450 230 C690 310 605 560 845 470 C1040 398 1000 150 1280 118" /></svg>
      </div>

      <section className={styles.story} aria-live="polite">
        {chapters.map((item, index) => <div className={styles.chapter} data-active={chapter === index} key={index} aria-hidden={chapter !== index}>
          <h1>{item.title}</h1>
          {item.copy ? <p>{item.copy}</p> : null}
          {(index === 0 || index === chapters.length - 1) && <JourneyActions authEnabled={authEnabled} final={index === chapters.length - 1} />}
        </div>)}
      </section>

      <div className={styles.documents} data-story-visual="documents" aria-hidden="true">
        <div><small>STATEMENT</small><b>12 months</b><i /><i /><i /></div>
        <div><small>RECEIPT</small><b>₱2,480</b><i /><i /></div>
        <div><small>SPREADSHEET</small><b>Old records</b><span>▦</span></div>
        <div><small>SCREENSHOT</small><b>Card activity</b><span>▤</span></div>
      </div>

      <div className={styles.phone} data-story-visual="phone" aria-hidden="true">
        <div className={styles.phoneBar}><Image src="/clover-mark.svg" alt="" width={28} height={28} /><span>Upload files</span><i /></div>
        <strong>Bring in your finances</strong><p>Choose the records already on your device.</p>
        <div className={styles.uploadRows}><span>▤ Statement <b>Ready</b></span><span>▧ Receipt <b>Ready</b></span><span>▦ Spreadsheet <b>Ready</b></span></div>
        <button type="button">Upload 3 files</button>
      </div>

      <div className={styles.laptop} data-story-visual="laptop" aria-hidden="true"><div className={styles.laptopScreen}>
        <div className={styles.appBar}><Image src="/clover-mark.svg" alt="" width={26} height={26} /><span>Home</span><i /><i /></div>
        <div className={styles.balance}><small>MY BALANCE</small><strong>₱633,688.84</strong><span>Across your accounts</span></div>
        <div className={styles.summary}><div><small>INCOME</small><b>₱68,000</b></div><div><small>EXPENSES</small><b>₱31,420</b></div><div><small>NET CASH FLOW</small><b>₱36,580</b></div></div>
        <div className={styles.transactionRows}>{['Pay day', 'Groceries', 'Rent', 'Coffee shop'].map((label, index) => <span key={label}><i />{label}<b>{index === 0 ? '+' : '−'} ₱{[68000,2480,24000,220][index].toLocaleString()}</b></span>)}</div>
      </div><span className={styles.laptopBase} /></div>

      <div className={styles.adviser} data-story-visual="adviser" aria-hidden="true"><div><Image src="/clover-mark.svg" alt="" width={34} height={34} /><span><small>ASK CLOVER</small><b>Your financial picture</b></span></div><p>Dining is down 12% this month. You could move the difference toward your Japan goal without changing your usual budget.</p><div className={styles.suggestion}><span>✈</span><b>Japan in spring</b><strong>₱12,000 monthly</strong></div><button type="button">Create this plan →</button></div>

      <div className={styles.planCard} data-story-visual="plan" aria-hidden="true">
        <div><Image src="/clover-mark.svg" alt="" width={30} height={30} /><span><small>CLOVER RECOMMENDATION</small><b>Japan trip</b></span></div>
        <strong>₱12,000 <small>per month</small></strong>
        <div><i /><i /><i /><i /></div>
        <p>Ready by March</p>
      </div>

      <nav className={styles.markers} aria-label="Landing page chapters" data-progress={`${chapter + 1}/${chapters.length}`}>
        {chapters.map((_, index) => <button key={index} type="button" className={chapter === index ? styles.activeMarker : ""} onClick={() => goToChapter(index)} aria-label={`Go to chapter ${index + 1}`} aria-current={chapter === index ? "step" : undefined}><span /></button>)}
        <b>{chapter + 1} / {chapters.length}</b>
      </nav>
      <div className={styles.scrollHint} aria-hidden="true"><span>Keep scrolling</span><i /></div>
      <div className={styles.grain} aria-hidden="true" />
    </div>
  </div>;
}
