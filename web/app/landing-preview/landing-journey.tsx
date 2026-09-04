"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { LandingSignupModal } from "@/components/landing-signup-modal";
import styles from "./landing-preview.module.css";

const chapters = [
  { title: <>Months of finances.<br /><em>Organized in minutes.</em></>, copy: "Drop in statements, receipts, screenshots, or spreadsheets. Clover turns what you already have into a financial picture you can use." },
  { title: <>Do not rebuild your financial history <em>by hand.</em></>, copy: "Clover reads dates, merchants, amounts, and accounts while you stay in control of what gets confirmed." },
  { title: <>Everything lands in one clear <em>financial picture.</em></>, copy: "Your accounts, transactions, balances, and categories become searchable, reviewable, and easy to correct." },
  { title: <>Ask what your money can make <em>possible.</em></>, copy: "Could you comfortably afford Japan next spring? Adviser answers using your own spending, commitments, and goals." },
  { title: <>Turn the answer into a plan that <em>fits.</em></>, copy: "Clover suggests a realistic monthly amount and lets you adjust the plan before making it yours." },
  { title: <>Your money, handled.<br /><em>Your life, uninterrupted.</em></>, copy: null },
] as const;

const scenes = ["01-organize", "02-upload", "03-picture", "04-adviser", "05-plan", "06-life"] as const;

type LandingMarket = "ph" | "global";

const marketContent = {
  ph: {
    documents: [["BPI STATEMENT", "12 months"], ["RECEIPT", "₱2,480"], ["GCASH EXPORT", "Old records"], ["MERALCO BILL", "Card activity"]],
    uploadRows: ["BPI statement", "SM receipt", "GCash export"],
    balance: "₱633,688.84", income: "₱68,000", expenses: "₱31,420", cashFlow: "₱36,580",
    transactions: [["Pay day • BPI", "+ ₱68,000"], ["SM Supermarket", "− ₱2,480"], ["Meralco", "− ₱4,920"], ["Grab", "− ₱220"]],
    insight: "Dining is down 12% this month. You could move the difference toward your Japan goal without changing your usual budget.",
    planAmount: "₱12,000",
  },
  global: {
    documents: [["CHASE STATEMENT", "12 months"], ["RECEIPT", "$84.20"], ["PAYPAL EXPORT", "Old records"], ["UTILITY BILL", "Card activity"]],
    uploadRows: ["Chase statement", "Whole Foods receipt", "PayPal export"],
    balance: "$24,860.42", income: "$6,800", expenses: "$3,142", cashFlow: "$3,658",
    transactions: [["Pay day • Chase", "+ $6,800"], ["Whole Foods", "− $84"], ["National Grid", "− $192"], ["Uber", "− $22"]],
    insight: "Dining is down 12% this month. You could move the difference toward your Japan goal without changing your usual budget.",
    planAmount: "$820",
  },
} as const;

const clamp = (value: number, minimum = 0, maximum = 1) => Math.min(maximum, Math.max(minimum, value));
const presenceAround = (position: number, center: number, radius: number) => clamp(1 - Math.abs(position - center) / radius);
const smoothstep = (start: number, end: number, value: number) => {
  const normalized = clamp((value - start) / (end - start));
  return normalized * normalized * (3 - 2 * normalized);
};

function JourneyActions({ authEnabled, final = false }: { authEnabled: boolean; final?: boolean }) {
  return <div className={styles.actions}>
    {!final && <Link className="button button-secondary button-pill" href="/sign-in" prefetch={false}>Log in</Link>}
    {authEnabled ? <LandingSignupModal enabled>Organize my finances for free <span aria-hidden="true">→</span></LandingSignupModal> : <Link className="button button-primary button-pill" href="/sign-up" prefetch={false}>Organize my finances for free <span aria-hidden="true">→</span></Link>}
  </div>;
}

export function LandingJourney({ authEnabled, initialMarket, countryResolved }: { authEnabled: boolean; initialMarket: LandingMarket; countryResolved: boolean }) {
  const journeyRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const [chapter, setChapter] = useState(0);
  const [storyPosition, setStoryPosition] = useState(0);
  const [market, setMarket] = useState<LandingMarket>(initialMarket);

  useEffect(() => {
    if (countryResolved || initialMarket === "ph") return;
    const localeLooksPhilippine = navigator.languages.some((locale) => /(?:^|-)PH$/i.test(locale) || /^fil(?:-|$)/i.test(locale));
    const timezoneLooksPhilippine = Intl.DateTimeFormat().resolvedOptions().timeZone === "Asia/Manila";
    if (localeLooksPhilippine || timezoneLooksPhilippine) setMarket("ph");
  }, [countryResolved, initialMarket]);

  useEffect(() => {
    const journey = journeyRef.current;
    if (!journey) return;
    const update = () => {
      frameRef.current = null;
      const bounds = journey.getBoundingClientRect();
      const distance = Math.max(1, journey.offsetHeight - window.innerHeight);
      const progress = Math.min(1, Math.max(0, -bounds.top / distance));
      const nextPosition = progress * (chapters.length - 1);
      const nextChapter = Math.min(chapters.length - 1, Math.round(nextPosition));
      journey.style.setProperty("--journey-progress", progress.toFixed(4));
      journey.style.setProperty("--path-offset", `${progress * -240}px`);
      setChapter((current) => current === nextChapter ? current : nextChapter);
      setStoryPosition((current) => Math.abs(current - nextPosition) < 0.002 ? current : nextPosition);
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
    const top = window.scrollY + journey.getBoundingClientRect().top + distance * (index / (chapters.length - 1));
    window.scrollTo({ top, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };

  const local = marketContent[market];
  const sceneMotion = (index: number): CSSProperties => {
    const activeScene = Math.min(chapters.length - 1, Math.floor(storyPosition));
    const phase = storyPosition - activeScene;
    const reveal = smoothstep(0.06, 0.94, phase);
    const isOutgoing = index === activeScene;
    const isIncoming = index === activeScene + 1;
    const distance = storyPosition - index;
    return {
      opacity: isOutgoing || isIncoming ? 1 : 0,
      clipPath: isIncoming ? `inset(0 ${100 - reveal * 100}% 0 0)` : "inset(0)",
      transform: `translate3d(${distance * -2.4}%, ${distance * -0.5}%, 0) scale(${1 + Math.min(1, Math.abs(distance)) * 0.075})`,
    };
  };
  const chapterMotion = (index: number): CSSProperties => {
    const activeChapter = Math.min(chapters.length - 1, Math.floor(storyPosition));
    const phase = storyPosition - activeChapter;
    const displayedChapter = phase < 0.5 ? activeChapter : Math.min(chapters.length - 1, activeChapter + 1);
    return {
      opacity: index === displayedChapter ? 1 : 0,
      transform: "translate3d(0, 0, 0)",
    };
  };
  const visualMotion = (center: number, radius: number, direction = 1): CSSProperties => {
    const presence = presenceAround(storyPosition, center, radius);
    const travel = (storyPosition - center) * 34 * direction;
    return { opacity: presence, transform: `translate3d(${travel}px, ${Math.abs(storyPosition - center) * 8}px, 0) scale(${0.88 + presence * 0.12})` };
  };

  return <div ref={journeyRef} className={styles.journey} data-chapter={chapter} data-market={market} style={{ "--journey-progress": 0 } as CSSProperties}>
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
            <div className={styles.scene} data-active={chapter === index} key={scene} style={sceneMotion(index)}>
              <span className={styles.sceneBackdrop} style={{ "--scene-backdrop": `url("/assets/landing-story-v2/${scene}.webp")` } as CSSProperties} />
              <picture className={styles.sceneSubject}>
                <source media="(max-width: 900px)" srcSet={`/assets/landing-story-v2/${scene}-mobile.webp`} />
                <img src={`/assets/landing-story-v2/${scene}.webp`} alt="" fetchPriority={index === 0 ? "high" : "auto"} />
              </picture>
            </div>
          ))}
        </div>
        <div className={styles.worldWash} />
        <svg viewBox="0 0 1200 700" preserveAspectRatio="none"><path d="M-70 470 C160 390 210 150 450 230 C690 310 605 560 845 470 C1040 398 1000 150 1280 118" /></svg>
      </div>

      <section className={styles.story} aria-live="polite">
        {chapters.map((item, index) => <div className={styles.chapter} data-active={chapter === index} key={index} aria-hidden={chapter !== index} style={chapterMotion(index)}>
          <h1>{item.title}</h1>
          {item.copy ? <p>{item.copy}</p> : null}
          {(index === 0 || index === chapters.length - 1) && <JourneyActions authEnabled={authEnabled} final={index === chapters.length - 1} />}
        </div>)}
      </section>

      <div className={styles.supportStage} aria-hidden="true">
      <div className={styles.ingestionPortal} data-story-visual="ingestion" style={visualMotion(0.28, 0.82)}>
        <span className={styles.ingestionPulse}><Image src="/clover-mark.svg" alt="" width={46} height={46} /></span>
        <span><small>CLOVER UPLOAD</small><b>Drop in what you already have</b></span>
        <i /><i /><i />
      </div>

      <div className={styles.documents} data-story-visual="documents" style={visualMotion(0.32, 0.92)}>
        <div><small>{local.documents[0][0]}</small><b>{local.documents[0][1]}</b><i /><i /><i /></div>
        <div><small>{local.documents[1][0]}</small><b>{local.documents[1][1]}</b><i /><i /></div>
        <div><small>{local.documents[2][0]}</small><b>{local.documents[2][1]}</b><span>▦</span></div>
        <div><small>{local.documents[3][0]}</small><b>{local.documents[3][1]}</b><span>▤</span></div>
      </div>

      <div className={styles.financialOutputs} data-story-visual="outputs" style={visualMotion(0.46, 0.82, -1)}>
        <span><small>ACCOUNT CREATED</small><b>{market === "ph" ? "BPI 3012" : "Chase 8042"}</b><i>{market === "ph" ? "PHP" : "USD"}</i></span>
        <span><small>TRANSACTIONS READY</small><b>248 organized</b><i>Review</i></span>
      </div>

      <div className={styles.phone} data-story-visual="phone" style={visualMotion(1.05, 0.82, -1)}>
        <div className={styles.phoneBar}><Image src="/clover-mark.svg" alt="" width={28} height={28} /><span>Upload files</span><i /></div>
        <strong>Add financial files</strong><p>Take a photo or choose statements, receipts, spreadsheets, and screenshots.</p>
        <div className={styles.uploadDrop}><b>Drop files anywhere</b><span>Take photo</span><span>Choose files</span></div>
        <div className={styles.uploadRows}>{local.uploadRows.map((label, index) => <span key={label}>{["▤", "▧", "▦"][index]} {label} <b>Ready</b></span>)}</div>
        <button type="button">Upload 3 files</button>
      </div>

      <div className={styles.laptop} data-story-visual="laptop" style={visualMotion(1.7, 1.2)}><div className={styles.laptopScreen}>
        <div className={styles.appBar}><Image src="/clover-mark.svg" alt="" width={26} height={26} /><span>Home</span><i /><i /></div>
        <div className={styles.balance}><small>MY BALANCE</small><strong>{local.balance}</strong><span>Across your accounts</span></div>
        <div className={styles.summary}><div><small>INCOME</small><b>{local.income}</b></div><div><small>EXPENSES</small><b>{local.expenses}</b></div><div><small>NET CASH FLOW</small><b>{local.cashFlow}</b></div></div>
        <div className={styles.transactionRows}>{local.transactions.map(([label, amount]) => <span key={label}><i />{label}<b>{amount}</b></span>)}</div>
      </div><span className={styles.laptopBase} /></div>

      <div className={styles.adviser} data-story-visual="adviser" style={visualMotion(3.05, 0.82, -1)}><div><Image src="/clover-mark.svg" alt="" width={34} height={34} /><span><small>ASK CLOVER</small><b>Your financial picture</b></span></div><p>{local.insight}</p><div className={styles.suggestion}><span>✈</span><b>Japan in spring</b><strong>{local.planAmount} monthly</strong></div><button type="button">Create this plan →</button></div>

      <div className={styles.planCard} data-story-visual="plan" style={visualMotion(4.02, 0.96)}>
        <div><Image src="/clover-mark.svg" alt="" width={30} height={30} /><span><small>CLOVER RECOMMENDATION</small><b>Japan trip</b></span></div>
        <strong>{local.planAmount} <small>per month</small></strong>
        <div><i /><i /><i /><i /></div>
        <p>Ready by March</p>
      </div>
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
