"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { LandingSignupModal } from "@/components/landing-signup-modal";
import { FEATURE_LINKS } from "@/lib/public-site";
import styles from "./landing-preview.module.css";

const chapters = [
  { title: <>Months of finances.<br /><em>Organized in minutes.</em></>, copy: "Upload statements, receipts, screenshots, or spreadsheets. Understand your money and take one clearer step at a time." },
  { title: <>Skip the manual <em>rebuilding.</em></>, copy: "Clover securely reads dates, merchants, amounts, and accounts from your files. You control what gets confirmed." },
  { title: <>See your money clearly, <em>all in one place.</em></>, copy: "Search every transaction, compare account balances, and understand your spending." },
  { title: <>Ask what your money can make <em>possible.</em></>, copy: "Thinking about a trip next year? Adviser can check the idea against your actual spending, commitments, savings, and goals." },
  { title: <>Turn advice into a plan <em>you can follow.</em></>, copy: "Create an editable budget or savings goal from your conversation with Clover, with a monthly amount based on what you can comfortably afford." },
  { title: <>Ready to make clearer <em>money decisions?</em></>, copy: null },
] as const;

const scenes = ["01-organize", "02-upload", "03-picture", "04-adviser", "05-plan", "06-life"] as const;

type LandingMarket = "ph" | "global";

const marketContent = {
  ph: {
    documents: [["BPI STATEMENT", "12 months"], ["RECEIPT", "₱2,480"], ["GCASH EXPORT", "Old records"], ["MERALCO BILL", "Card activity"]],
    uploadRows: [
      ["BPI statement", "/assets/banks/philippines/bpi.png"],
      ["Grab receipt", "/assets/banks/philippines/grabpay.png"],
      ["GCash export", "/assets/banks/philippines/gcash.png"],
    ],
    balance: "₱633,688.84", income: "₱68,000", expenses: "₱31,420", cashFlow: "₱36,580",
    transactions: [["Pay day • BPI", "+ ₱68,000"], ["SM Supermarket", "− ₱2,480"], ["Meralco", "− ₱4,920"], ["Grab", "− ₱220"]],
    insight: "Dining is down 12% this month. You could move the difference toward your Japan goal without changing your usual budget.",
    planAmount: "₱12,000",
  },
  global: {
    documents: [["CHASE STATEMENT", "12 months"], ["RECEIPT", "$84.20"], ["PAYPAL EXPORT", "Old records"], ["UTILITY BILL", "Card activity"]],
    uploadRows: [
      ["Chase statement", "/assets/banks/uk/chase bank.png"],
      ["PayPal receipt", "/assets/banks/philippines/paypal.png"],
      ["Wise export", "/assets/banks/philippines/wise.png"],
    ],
    balance: "$24,860.42", income: "$6,800", expenses: "$3,142", cashFlow: "$3,658",
    transactions: [["Pay day • Chase", "+ $6,800"], ["Whole Foods", "− $84"], ["National Grid", "− $192"], ["Uber", "− $22"]],
    insight: "Dining is down 12% this month. You could move the difference toward your Japan goal without changing your usual budget.",
    planAmount: "$820",
  },
} as const;

const clamp = (value: number, minimum = 0, maximum = 1) => Math.min(maximum, Math.max(minimum, value));
const sceneAsset = (scene: (typeof scenes)[number], mobile = false) => {
  const folder = scene === "06-life" ? "landing-story-v2" : "landing-story-v3";
  return `/assets/${folder}/${scene}${mobile ? "-mobile" : ""}.webp`;
};

function JourneyActions({ authEnabled, final = false }: { authEnabled: boolean; final?: boolean }) {
  return <div className={styles.actions}>
    {!final && <Link className="button button-secondary button-pill" href="/sign-in" prefetch={false}>Log in</Link>}
    {authEnabled ? <LandingSignupModal enabled>Organize my finances for free <span aria-hidden="true">→</span></LandingSignupModal> : <Link className="button button-primary button-pill" href="/sign-up" prefetch={false}>Organize my finances for free <span aria-hidden="true">→</span></Link>}
  </div>;
}

export function LandingJourney({ authEnabled, initialMarket, countryResolved }: { authEnabled: boolean; initialMarket: LandingMarket; countryResolved: boolean }) {
  const journeyRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const frameRef = useRef<number | null>(null);
  const [chapter, setChapter] = useState(0);
  const [storyPosition, setStoryPosition] = useState(0);
  const [market, setMarket] = useState<LandingMarket>(initialMarket);
  const [featuresOpen, setFeaturesOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (countryResolved || initialMarket === "ph") return;
    const localeLooksPhilippine = navigator.languages.some((locale) => /(?:^|-)PH$/i.test(locale) || /^fil(?:-|$)/i.test(locale));
    const timezoneLooksPhilippine = Intl.DateTimeFormat().resolvedOptions().timeZone === "Asia/Manila";
    if (localeLooksPhilippine || timezoneLooksPhilippine) setMarket("ph");
  }, [countryResolved, initialMarket]);

  useEffect(() => {
    const closeMenus = (event: MouseEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) {
        setFeaturesOpen(false);
        setMobileMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFeaturesOpen(false);
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", closeMenus);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeMenus);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

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
  const chapterFloor = Math.min(chapters.length - 1, Math.floor(storyPosition));
  const chapterPhase = storyPosition - chapterFloor;
  const displayedChapter = chapterPhase < 0.5 ? chapterFloor : Math.min(chapters.length - 1, chapterFloor + 1);
  const sceneMotion = (index: number): CSSProperties => {
    const distance = storyPosition - index;
    const proximity = clamp(1 - Math.abs(distance));
    return {
      opacity: proximity,
      transform: `translate3d(${clamp(distance, -1, 1) * -1.8}%, ${clamp(distance, -1, 1) * -0.7}%, 0) scale(${1.035 - proximity * 0.035})`,
    };
  };
  const chapterMotion = (index: number): CSSProperties => {
    return {
      opacity: index === displayedChapter ? 1 : 0,
      transform: "translate3d(0, 0, 0)",
    };
  };
  const productMotion = (index: number, direction = 1): CSSProperties => {
    const distance = storyPosition - index;
    const proximity = clamp(1 - Math.abs(distance) * 1.35);
    return {
      opacity: proximity,
      visibility: proximity > 0 ? "visible" : "hidden",
      transform: `translate3d(${clamp(distance, -1, 1) * 34 * direction}px, ${clamp(distance, -1, 1) * 18}px, 0) scale(${0.94 + proximity * 0.06})`,
    };
  };

  return <div ref={journeyRef} className={styles.journey} data-chapter={chapter} data-market={market} style={{ "--journey-progress": 0 } as CSSProperties}>
    <div className={styles.stage}>
      <header ref={headerRef} className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="Clover home">
          <Image src="/clover-mark.svg" alt="" width={44} height={44} priority />
          <Image src="/clover-name-teal.svg" alt="Clover" width={132} height={32} priority />
        </Link>
        <nav aria-label="Public site">
          <div className={styles.featureMenu}>
            <button
              type="button"
              className={styles.navTrigger}
              aria-expanded={featuresOpen}
              aria-controls="preview-features-menu"
              onClick={() => setFeaturesOpen((open) => !open)}
            >
              Features <span aria-hidden="true">▾</span>
            </button>
            {featuresOpen ? <div className={styles.featuresDropdown} id="preview-features-menu">
              {FEATURE_LINKS.map((item) => <Link key={item.href} href={item.href} onClick={() => setFeaturesOpen(false)}>{item.label}</Link>)}
            </div> : null}
          </div>
          <Link href="/help">Help</Link>
          <Link href="/contact-us">Contact</Link>
          <Link href="/privacy-policy">Privacy Policy</Link>
          <Link href="/terms-of-service">Terms of Service</Link>
        </nav>
        <div className={styles.mobileMenu}>
          <button
            type="button"
            className={styles.mobileMenuTrigger}
            aria-expanded={mobileMenuOpen}
            aria-controls="preview-mobile-menu"
            onClick={() => setMobileMenuOpen((open) => !open)}
          >
            Menu <span aria-hidden="true">▾</span>
          </button>
          {mobileMenuOpen ? <div className={styles.mobileDropdown} id="preview-mobile-menu">
            <p>Features</p>
            {FEATURE_LINKS.map((item) => <Link key={item.href} href={item.href} onClick={() => setMobileMenuOpen(false)}>{item.label}</Link>)}
            <span />
            <Link href="/help" onClick={() => setMobileMenuOpen(false)}>Help</Link>
            <Link href="/contact-us" onClick={() => setMobileMenuOpen(false)}>Contact</Link>
            <Link href="/privacy-policy" onClick={() => setMobileMenuOpen(false)}>Privacy Policy</Link>
            <Link href="/terms-of-service" onClick={() => setMobileMenuOpen(false)}>Terms of Service</Link>
          </div> : null}
        </div>
        <div className={styles.headerActions}><Link href="/sign-in">Log in</Link><Link href="/sign-up">Sign up</Link></div>
      </header>

      <div className={styles.world} aria-hidden="true">
        <div className={styles.sceneStack}>
          {scenes.map((scene, index) => (
            <div className={styles.scene} data-active={chapter === index} key={scene} style={sceneMotion(index)}>
              <span className={styles.sceneBackdrop} style={{ "--scene-backdrop": `url("${sceneAsset(scene)}")` } as CSSProperties} />
              <picture className={styles.sceneSubject}>
                <source media="(max-width: 900px)" srcSet={sceneAsset(scene, true)} />
                <img src={sceneAsset(scene)} alt="" fetchPriority={index === 0 ? "high" : "auto"} />
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

      <div className={styles.supportStage} data-active={displayedChapter < chapters.length - 1} aria-hidden="true">
      <div className={styles.heroEvidence} data-story-visual="evidence" style={productMotion(0)}>
        <div className={styles.evidenceDocuments}>
          {local.documents.slice(0, 3).map(([label, detail], index) => <div className={styles.evidenceDocument} key={label}>
            <Image src={local.uploadRows[index][1]} alt="" width={34} height={34} />
            <small>{label}</small><strong>{detail}</strong><i /><i /><i />
          </div>)}
        </div>
        <div className={styles.evidenceFlow}><span /><span /><span /></div>
        <div className={styles.evidenceDestination}>
          <Image src="/clover-mark.svg" alt="" width={34} height={34} />
          <span><small>CLOVER IMPORT</small><strong>Accounts and transactions ready</strong></span>
          <b>{market === "ph" ? "248 organized" : "186 organized"}</b>
        </div>
      </div>

      <div className={styles.phone} data-story-visual="phone" style={productMotion(1, -1)}>
        <div className={styles.phoneBar}><Image src="/clover-mark.svg" alt="" width={28} height={28} /><span>Upload files</span><i /></div>
        <strong>Add financial files</strong><p>Take a photo or choose statements, receipts, spreadsheets, and screenshots.</p>
        <div className={styles.uploadDrop}><b>Drop files anywhere</b><span>Take photo</span><span>Choose files</span></div>
        <div className={styles.uploadRows}>{local.uploadRows.map(([label, logo]) => <span key={label}><Image src={logo} alt="" width={16} height={16} /> {label} <b>Ready</b></span>)}</div>
        <button type="button">Upload 3 files</button>
      </div>

      <div className={styles.laptop} data-story-visual="laptop" style={productMotion(2)}><div className={styles.laptopScreen}>
        <div className={styles.appBar}><Image src="/clover-mark.svg" alt="" width={26} height={26} /><span>Home</span><i /><i /></div>
        <div className={styles.balance}><small>MY BALANCE</small><strong>{local.balance}</strong><span>Across your accounts</span></div>
        <div className={styles.summary}><div><small>INCOME</small><b>{local.income}</b></div><div><small>EXPENSES</small><b>{local.expenses}</b></div><div><small>NET CASH FLOW</small><b>{local.cashFlow}</b></div></div>
        <div className={styles.transactionRows}>{local.transactions.map(([label, amount]) => <span key={label}><i />{label}<b>{amount}</b></span>)}</div>
      </div><span className={styles.laptopBase} /></div>

      <div className={styles.adviser} data-story-visual="adviser" style={productMotion(3, -1)}><div><Image src="/clover-mark.svg" alt="" width={34} height={34} /><span><small>ASK CLOVER</small><b>Your financial picture</b></span></div><p>{local.insight}</p><div className={styles.suggestion}><span>✈</span><b>Japan in spring</b><strong>{local.planAmount} monthly</strong></div><button type="button">Create this plan →</button></div>

      <div className={styles.planCard} data-story-visual="plan" style={productMotion(4)}>
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
