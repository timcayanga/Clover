"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { LandingSignupModal } from "@/components/landing-signup-modal";
import { FEATURE_LINKS } from "@/lib/public-site";
import styles from "./landing-preview.module.css";

const chapters = [
  { title: <>Months of finances.<br /><em>Organized in minutes.</em></>, copy: "Upload statements, receipts, screenshots, or spreadsheets. Understand your money and take one clearer step at a time." },
  { title: <>Stop tracking.<br /><em>Start organizing.</em></>, copy: "Most finance apps ask you to enter transactions one by one. Clover starts with the records you already have, so you can spend less time rebuilding your finances and more time understanding them." },
  { title: <>Skip the manual <em>rebuilding.</em></>, copy: "Bring in bank statements, receipts, wallet screenshots, spreadsheets, and other financial records. Clover extracts the useful details, organizes transactions by account and category, and shows you only what needs review." },
  { title: <>Your financial data stays <em>under your control.</em></>, copy: "Your financial records are private, reviewable, and traceable. You can edit, export, or delete your data through your account." },
  { title: <>See what changed and where your <em>money actually goes.</em></>, copy: "Once your records are organized, Clover turns them into a clear financial picture. Track balances, spending, cash flow, recurring obligations, and trends across your accounts without piecing everything together yourself." },
  { title: <>Ask what your money can make <em>possible.</em></>, copy: "Clover Adviser helps turn your financial history into practical answers. Ask what you can safely spend, what changed this month, whether a goal is still on track, or what deserves your attention next." },
  { title: <>Manage money together <em>without sharing everything.</em></>, copy: "Split expenses, track who owes what, and organize shared money with a partner, household, family, or friends. Keep personal finances private while sharing only what makes sense." },
  { title: <>Do more when your finances <em>get more complex.</em></>, copy: "Start free and upgrade when Clover becomes a bigger part of how you manage your money. Pro gives you more room, more intelligence, and more ways to understand your financial life." },
  { title: <>Feel clearer about your money, and more confident <em>about what comes next.</em></>, copy: null },
] as const;

const scenes = ["01-organize", "02-upload", "07-trust", "03-picture", "04-adviser", "05-plan", "08-pro", "06-life"] as const;
// Preserve each scene's responsive composition when its place in the story changes.
const chapterLayouts = [0, 0, 1, 5, 2, 3, 4, 6, 7] as const;
const productChapters = [0, 2, 4, 5, 6] as const;

export type LandingMarket = "ph" | "global";

const marketContent = {
  ph: {
    documents: [["BPI STATEMENT", "12 months"], ["RECEIPT", "₱2,480"], ["GCASH EXPORT", "Old records"], ["MERALCO BILL", "Card activity"]],
    documentLines: [
      [["Payroll", "+ ₱68,000"], ["SM Supermarket", "− ₱2,480"], ["Meralco", "− ₱4,920"]],
      [["Groceries", "₱2,480"], ["VAT", "₱265"], ["Total", "₱2,745"]],
      [["Grab", "− ₱220"], ["Transfer received", "+ ₱3,000"], ["Mobile load", "− ₱599"]],
    ],
    uploadRows: [
      ["BPI statement", "/assets/banks/philippines/bpi.png"],
      ["Grab receipt", "/assets/banks/philippines/grabpay.png"],
      ["GCash export", "/assets/banks/philippines/gcash.png"],
    ],
    balance: "₱633,688.84", income: "₱68,000", expenses: "₱31,420", cashFlow: "₱36,580",
    transactions: [["Pay day • BPI", "+ ₱68,000"], ["SM Supermarket", "− ₱2,480"], ["Meralco", "− ₱4,920"], ["Grab", "− ₱220"]],
    accountCards: [
      ["BPI Savings • PHP", "₱428,350.84", "/assets/banks/philippines/bpi.png"],
      ["Cash • PHP", "₱18,500.00", "/assets/banks/1 generic/cash.png"],
      ["GCash Wallet • PHP", "₱12,838.00", "/assets/banks/philippines/gcash.png"],
    ],
    insight: "Dining is down 12% this month. You could move the difference toward your Japan goal without changing your usual budget.",
    planAmount: "₱12,000",
  },
  global: {
    documents: [["CHASE STATEMENT", "12 months"], ["RECEIPT", "$84.20"], ["PAYPAL EXPORT", "Old records"], ["UTILITY BILL", "Card activity"]],
    documentLines: [
      [["Pay day", "+ $6,800"], ["Whole Foods", "− $84"], ["National Grid", "− $192"]],
      [["Groceries", "$84.20"], ["Tax", "$7.31"], ["Total", "$91.51"]],
      [["Uber", "− $22"], ["Transfer received", "+ $300"], ["Streaming", "− $15"]],
    ],
    uploadRows: [
      ["Chase statement", "/assets/banks/uk/chase bank.png"],
      ["PayPal receipt", "/assets/banks/philippines/paypal.png"],
      ["Wise export", "/assets/banks/philippines/wise.png"],
    ],
    balance: "$24,860.42", income: "$6,800", expenses: "$3,142", cashFlow: "$3,658",
    transactions: [["Pay day • Chase", "+ $6,800"], ["Whole Foods", "− $84"], ["National Grid", "− $192"], ["Uber", "− $22"]],
    accountCards: [
      ["Chase Checking • USD", "$18,420.42", "/assets/banks/uk/chase bank.png"],
      ["Cash • USD", "$1,240.00", "/assets/banks/1 generic/cash.png"],
      ["Wise Wallet • USD", "$5,200.00", "/assets/banks/philippines/wise.png"],
    ],
    insight: "Dining is down 12% this month. You could move the difference toward your Japan goal without changing your usual budget.",
    planAmount: "$820",
  },
} as const;

const clamp = (value: number, minimum = 0, maximum = 1) => Math.min(maximum, Math.max(minimum, value));
const sceneAsset = (scene: (typeof scenes)[number], mobile = false) => {
  if (scene === "07-trust") return `/assets/landing-story-v3/07-records-away${mobile ? "-mobile" : ""}.webp`;
  // Keep Pro in the airport setting rather than returning home before the finale.
  if (scene === "08-pro") return `/assets/landing-story-v2/05-plan${mobile ? "-mobile" : ""}.webp`;
  if (scene === "06-life" && mobile) return "/assets/landing-story-v3/06-life-mobile-clear.webp";
  const folder = scene === "06-life" || scene === "05-plan" ? "landing-story-v2" : "landing-story-v3";
  return `/assets/${folder}/${scene}${mobile ? "-mobile" : ""}.webp`;
};

function ComparisonTable() {
  return <table className={styles.comparisonTable}>
    <caption>The old way compared with organizing your finances in Clover</caption>
    <thead><tr><th scope="col">The old way</th><th scope="col">A simpler way</th></tr></thead>
    <tbody>
      <tr><td>Enter transactions one by one</td><td><strong>1. Upload</strong> statements, receipts, or screenshots</td></tr>
      <tr><td>Build your financial history manually</td><td><strong>2. Organize</strong> months of transactions in minutes</td></tr>
      <tr><td>Guess what changed in your finances</td><td><strong>3. Understand</strong> patterns, reports, and Adviser guidance</td></tr>
      <tr><td>Make decisions without knowing what to do next</td><td><strong>4. Improve</strong> by acting on one clear recommendation at a time</td></tr>
    </tbody>
  </table>;
}

export function JourneyActions({ authEnabled, final = false }: { authEnabled: boolean; final?: boolean }) {
  return <div className={styles.actions}>
    {authEnabled ? <LandingSignupModal enabled>Organize my finances for free <span aria-hidden="true">→</span></LandingSignupModal> : <Link className="button button-primary button-pill" href="/sign-up" prefetch={false}>Organize my finances for free <span aria-hidden="true">→</span></Link>}
    {!final && <Link className="button button-secondary button-pill" href="/sign-in" prefetch={false}>Log in</Link>}
  </div>;
}

export function ProComparison({ market, style }: { market: LandingMarket; style: CSSProperties }) {
  const prices = market === "ph" ? ["PHP 169", "PHP 1,699"] : ["USD 2.69", "USD 26.99"];
  return <div className={styles.proDetails} style={style}>
    <table className={styles.proTable}>
      <caption>Compare Clover Free and Pro</caption>
      <thead><tr><th scope="col">Plan</th><th scope="col">Free</th><th scope="col">Pro</th></tr></thead>
      <tbody>
        <tr><th scope="row">Monthly billing</th><td>Free</td><td><strong>{prices[0]}</strong> / month</td></tr>
        <tr><th scope="row">Annual billing</th><td>Free</td><td><strong>{prices[1]}</strong> / year</td></tr>
        <tr><th scope="row">Uploads & accounts</th><td>No caps for now</td><td>No caps for now</td></tr>
        <tr><th scope="row">Reports & Adviser</th><td>Basic guidance</td><td>Advanced guidance</td></tr>
        <tr><th scope="row">Goals</th><td>Basic tracking</td><td>Tracking + advice</td></tr>
        <tr><th scope="row">Investments</th><td>Basic tracking</td><td>Full portfolio tools</td></tr>
      </tbody>
    </table>
    <div className={styles.proActions}>
      <Link className="button button-primary button-pill" href="/sign-up?intent=pro&interval=annual" prefetch={false}>Upgrade to Pro <span aria-hidden="true">→</span></Link>
      <small>You can keep using Clover for free.</small>
    </div>
  </div>;
}

export function JourneyHeader() {
  const headerRef = useRef<HTMLElement>(null);
  const [featuresOpen, setFeaturesOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  useEffect(() => {
    const closeMenus = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!headerRef.current?.contains(target) && !target.closest("[data-mobile-navigation]")) {
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
  return <>      <header ref={headerRef} className={styles.header}>
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
              {FEATURE_LINKS.map((item) => <Link key={item.href} href={item.href} onClick={() => setFeaturesOpen(false)}><strong>{item.label}</strong>{item.products ? <small>{item.products}</small> : null}</Link>)}
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
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
            aria-controls="preview-mobile-menu"
            onClick={() => setMobileMenuOpen((open) => !open)}
          >
            <span aria-hidden="true" /><span aria-hidden="true" /><span aria-hidden="true" />
          </button>
        </div>
        <div className={styles.headerActions}><Link href="/sign-in">Log in</Link><Link href="/sign-up">Sign up</Link></div>
      </header>

      {mobileMenuOpen ? <div data-mobile-navigation="true">
        <button className={styles.mobileMenuBackdrop} type="button" aria-label="Close menu" onClick={() => setMobileMenuOpen(false)} />
        <div className={styles.mobileDrawer} id="preview-mobile-menu" role="dialog" aria-modal="true" aria-label="Clover navigation">
          <div className={styles.mobileDrawerHeader}>
            <Image src="/clover-mark.svg" alt="" width={34} height={34} />
            <strong>Menu</strong>
            <button type="button" aria-label="Close menu" onClick={() => setMobileMenuOpen(false)}>×</button>
          </div>
          <div className={styles.mobileDrawerLinks}>
            <p>Features</p>
            {FEATURE_LINKS.map((item) => <Link key={item.href} href={item.href} onClick={() => setMobileMenuOpen(false)}><strong>{item.label}</strong>{item.products ? <small>{item.products}</small> : null}</Link>)}
            <span />
            <Link href="/help" onClick={() => setMobileMenuOpen(false)}>Help</Link>
            <Link href="/contact-us" onClick={() => setMobileMenuOpen(false)}>Contact</Link>
            <Link href="/privacy-policy" onClick={() => setMobileMenuOpen(false)}>Privacy Policy</Link>
            <Link href="/terms-of-service" onClick={() => setMobileMenuOpen(false)}>Terms of Service</Link>
          </div>
        </div>
      </div> : null}

</>;
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
  const chapterFloor = Math.min(chapters.length - 1, Math.floor(storyPosition));
  const chapterPhase = storyPosition - chapterFloor;
  const displayedChapter = chapterPhase < 0.5 ? chapterFloor : Math.min(chapters.length - 1, chapterFloor + 1);
  const sceneMotion = (index: number): CSSProperties => {
    // The comparison shares the hero setting; subsequent scenes start one chapter later.
    const distance = Math.max(0, storyPosition - 1) - index;
    const proximity = clamp(1 - Math.abs(distance));
    const easedProximity = proximity * proximity * (3 - 2 * proximity);
    const depth = Math.min(1, Math.abs(distance));
    const scale = distance < 0 ? 0.955 + easedProximity * 0.045 : 1 + depth * 0.065;
    return {
      opacity: easedProximity,
      transform: `translate3d(${clamp(distance, -1, 1) * -5.5}%, ${clamp(distance, -1, 1) * -1.8}%, 0) scale(${scale})`,
    };
  };
  const chapterMotion = (index: number): CSSProperties => {
    return {
      opacity: index === 1 || index === 7 || index === displayedChapter ? 1 : 0,
      transform: "translate3d(0, 0, 0)",
    };
  };
  const tableMotion = (index: number): CSSProperties => {
    const visibility = clamp((0.58 - Math.abs(storyPosition - index)) / 0.25);
    return {
      opacity: visibility,
      transform: `translate3d(0, ${(1 - visibility) * 10}px, 0)`,
    };
  };
  const productMotion = (index: number, direction = 1): CSSProperties => {
    const distance = storyPosition - productChapters[index];
    const proximity = clamp(1 - Math.abs(distance) * 1.35);
    return {
      opacity: proximity,
      visibility: proximity > 0 ? "visible" : "hidden",
      transform: `translate3d(${clamp(distance, -1, 1) * 34 * direction}px, ${clamp(distance, -1, 1) * 18}px, 0) scale(${0.94 + proximity * 0.06})`,
    };
  };

  return <div ref={journeyRef} className={styles.journey} data-chapter={chapterLayouts[chapter]} data-comparison={chapter === 1} data-pro={chapter === 7} data-has-cta={chapter === 0 || chapter === 7 || chapter === chapters.length - 1} data-market={market} style={{ "--journey-progress": 0 } as CSSProperties}>
    <div className={styles.stage}>
      <JourneyHeader />

      <div className={styles.world} aria-hidden="true">
        <div className={styles.sceneStack}>
          {scenes.map((scene, index) => (
            <div className={styles.scene} data-scene={scene} data-active={Math.max(0, chapter - 1) === index} key={scene} style={sceneMotion(index)}>
              <span className={styles.sceneBackdrop} style={{ "--scene-backdrop": `url("${sceneAsset(scene)}")` } as CSSProperties} />
              <picture className={styles.sceneSubject}>
                <source media="(max-width: 900px)" srcSet={sceneAsset(scene, true)} />
                <img src={sceneAsset(scene)} alt="" draggable={false} fetchPriority={index === 0 ? "high" : "auto"} />
              </picture>
            </div>
          ))}
        </div>
        <div className={styles.worldWash} />
        <svg viewBox="0 0 1200 700" preserveAspectRatio="none"><path d="M-70 470 C160 390 210 150 450 230 C690 310 605 560 845 470 C1040 398 1000 150 1280 118" /></svg>
      </div>

      <section className={styles.story} aria-live="polite">
        {chapters.map((item, index) => <div className={`${styles.chapter} ${index === 1 ? styles.comparisonChapter : ""} ${index === 7 ? styles.proChapter : ""} ${index === 8 ? styles.finalChapter : ""}`} data-active={chapter === index} key={index} aria-hidden={chapter !== index} inert={chapter !== index} style={chapterMotion(index)}>
          <div style={{ opacity: index === displayedChapter ? 1 : 0 }}><h1>{item.title}</h1>
          {item.copy ? <p>{item.copy}</p> : null}</div>
          {index === 1 ? <div className={styles.comparisonDetails} style={tableMotion(index)}><ComparisonTable /></div> : null}
          {index === 3 ? <div className={styles.trustLinks}><Link href="/privacy-policy">Privacy Policy</Link><Link href="/features/security">How Clover protects your data →</Link></div> : null}
          {index === 7 ? <ProComparison market={market} style={tableMotion(index)} /> : null}
          {(index === 0 || index === chapters.length - 1) && <JourneyActions authEnabled={authEnabled} final={index === chapters.length - 1} />}
        </div>)}
      </section>

      <div className={styles.supportStage} data-active={displayedChapter !== 1 && displayedChapter < chapters.length - 1} aria-hidden="true">
      <div className={styles.heroEvidence} data-story-visual="evidence" style={productMotion(0)}>
        <div className={styles.evidenceDocuments}>
          {local.documents.slice(0, 3).map(([label, detail], index) => <div className={styles.evidenceDocument} key={label}>
            <Image src={local.uploadRows[index][1]} alt="" width={34} height={34} />
            <small>{label}</small><strong>{detail}</strong>
            <div className={styles.documentLineItems}>{local.documentLines[index].map(([name, amount]) => <span key={name}><b>{name}</b><i>{amount}</i></span>)}</div>
          </div>)}
        </div>
        <div className={styles.evidenceFlow}><span /><span /><span /></div>
        <div className={styles.evidenceDestination}>
          <Image src="/clover-mark.svg" alt="" width={34} height={34} />
          <span><small>CLOVER IMPORT</small><strong>Accounts and transactions ready</strong></span>
          <b>{market === "ph" ? "248 organized" : "186 organized"}</b>
        </div>
      </div>

      <div className={styles.iphoneFrame} data-story-visual="phone" style={productMotion(1, -1)}>
        <span className={styles.iphoneSideButtons} />
        <div className={styles.iphoneDisplay}>
          <div className={styles.iphoneStatusBar}><b>9:41</b><span className={styles.iphoneIsland} /><span className={styles.iphoneIndicators}><svg viewBox="0 0 18 12"><path d="M1 11V8h2v3M5 11V6h2v5M9 11V3h2v8M13 11V1h2v10" stroke="currentColor" strokeWidth="1.5" /></svg><svg viewBox="0 0 16 12"><path d="M1 3q7-5 14 0M4 6q4-3 8 0M7 9q1-1 2 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg><i /></span></div>
          <Image className={styles.iphoneAppScreen} src={`/assets/landing-screens/transactions-${market}.webp`} alt="Clover mobile Transactions page with fictional sample records" width={1206} height={2334} sizes="250px" draggable={false} unoptimized />
          <span className={styles.iphoneHomeIndicator} />
        </div>
        <span className={styles.iphoneGlass} />
      </div>

      <div className={styles.laptop} data-story-visual="laptop" style={productMotion(2)}><div className={styles.laptopScreen}>
        <div className={styles.appBar}><Image src="/clover-mark.svg" alt="" width={26} height={26} /><span>Accounts</span><i /><i /></div>
        <div className={styles.accountsHeading}><span><small>Estimated total</small><strong>{local.balance}</strong></span><button type="button">+ Add account</button></div>
        <div className={styles.accountGrid}>{local.accountCards.map(([label, amount, logo]) => <div key={label}><Image src={logo} alt="" width={34} height={34} /><span><small>{label}</small><strong>{amount}</strong></span><b>›</b></div>)}</div>
      </div><span className={styles.laptopBase} /></div>

      <div className={styles.adviser} data-story-visual="adviser" style={productMotion(3, -1)}><div><Image src="/clover-mark.svg" alt="" width={34} height={34} /><span><small>Ask Clover</small><b>Your financial picture</b></span></div><div className={styles.userPrompt}>Could I comfortably plan a Japan trip next year?</div><p>{local.insight}</p><div className={styles.suggestion}><span>✈</span><b>Japan in spring</b><strong>{local.planAmount} monthly</strong></div><button type="button">Create this plan →</button></div>

      <div className={styles.planCard} data-story-visual="plan" style={productMotion(4)}>
        <div className={styles.planHeader}><Image src="/clover-mark.svg" alt="" width={30} height={30} /><span><small>Split Bills</small><b>Airport lunch</b></span></div>
        <div className={styles.sharedExpense}><small>Shared equally · 4 people</small><strong>{market === "ph" ? "₱2,400" : "$120"}</strong><span>Paid by Maya</span></div>
        <div className={styles.sharedPeople}>
          {["Maya", "Alex", "Sam", "Leo"].map((name, index) => <div key={name}><b>{name}</b><span>{market === "ph" ? "₱600" : "$30"}</span><small>{index === 0 ? "Paid" : index === 1 ? "Settled" : "Owes"}</small></div>)}
        </div>
        <p className={styles.sharedPrivacy}>Only the shared expense is visible. Personal accounts stay private.</p>
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
