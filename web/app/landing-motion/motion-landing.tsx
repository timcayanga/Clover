"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { CloverMascot } from "@/components/clover-mascot";
import { BrandSculpture, SpendingSculpture } from "./brand-sculpture";
import s from "./motion-landing.module.css";

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const accounts = [
  {
    name: "BPI",
    kind: "Savings",
    amount: "₱48,250",
    logo: "bpi.png",
    color: "#a81329",
  },
  {
    name: "Maya",
    kind: "Wallet",
    amount: "₱6,840",
    logo: "maya.png",
    color: "#102624",
  },
  {
    name: "UnionBank",
    kind: "Credit card",
    amount: "₱8,200",
    logo: "unionbank.jpg",
    color: "#c55000",
  },
];
const periods = {
  October: {
    total: "₱18,400",
    shares: [40, 27, 20, 13],
    amounts: ["₱7,360", "₱4,968", "₱3,680", "₱2,392"],
  },
  September: {
    total: "₱21,200",
    shares: [49, 21, 18, 12],
    amounts: ["₱10,388", "₱4,452", "₱3,816", "₱2,544"],
  },
} as const;
const categories = [
  { name: "Food & Dining", icon: "food-dining", color: "#fdba74" },
  { name: "Subscriptions", icon: "subscriptions", color: "#ddd6fe" },
  { name: "Transport", icon: "transport", color: "#bae6fd" },
  { name: "Everything else", icon: "other", color: "#94a3b8" },
];
const questions = [
  "Where did my money go?",
  "Help me plan for a trip",
  "Add lunch, ₱500",
];
const replies = [
  "Food & Dining is your largest spending category this month. Here’s a closer look.",
  "Let’s make your Japan trip a goal. How much would you like to save, and when are you hoping to go?",
  "Lunch · ₱500 · Food & Dining. Which account did you pay from?",
];

function Arrow({ down = false }: { down?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={down ? { transform: "rotate(90deg)" } : undefined}
    >
      <path
        d="M4 12h15m-6-6 6 6-6 6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function CategoryIcon({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <img
      className={s.categoryIcon}
      src={`/figma-icons/categories/${name}.svg`}
      alt=""
      width={size}
      height={size}
      loading="lazy"
    />
  );
}
function Chapter({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <div className={s.chapter}>
      <span>{n}</span>
      {children}
    </div>
  );
}
function Receipt() {
  return (
    <div className={s.receipt}>
      <div className={s.receiptHeading}>
        <span>FROM YOUR EVERYDAY LIFE</span>
        <strong>MENDOKORO</strong>
      </div>
      <div className={s.receiptTotal}>
        <span>Lunch with a friend</span>
        <b>₱500.00</b>
      </div>
      <div className={s.barcode} aria-hidden="true" />
    </div>
  );
}

function Ledger() {
  return (
    <div className={s.ledger}>
      <div className={s.ledgerHead}>
        <img src="/clover-mark.svg" alt="" width={28} height={28} />
        <span>A little more organized.</span>
      </div>
      <div className={s.ledgerRow}>
        <CategoryIcon name="food-dining" />
        <div>
          <strong>Mendokoro Ramenba</strong>
          <span>Food & Dining · Maya</span>
        </div>
        <b>−₱500</b>
      </div>
      <div className={s.ledgerRow}>
        <CategoryIcon name="salary" />
        <div>
          <strong>Salary</strong>
          <span>Income · BPI</span>
        </div>
        <b className={s.positive}>+₱45,000</b>
      </div>
      <div className={s.ledgerRow}>
        <CategoryIcon name="groceries" />
        <div>
          <strong>Weekend groceries</strong>
          <span>Groceries · BPI</span>
        </div>
        <b>−₱1,280</b>
      </div>
      <div className={s.ledgerNote}>
        <span>✓</span> You review. Clover learns.
      </div>
    </div>
  );
}

export function MotionLanding() {
  const root = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [period, setPeriod] = useState<keyof typeof periods>("October");
  const [question, setQuestion] = useState(0);
  const motion = !paused && !reduced;
  const report = periods[period];

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    el.dataset.enhanced = "true";
    const reveal = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).dataset.visible = "true";
            reveal.unobserve(entry.target);
          }
      },
      { threshold: 0.08 },
    );
    el.querySelectorAll("[data-reveal]").forEach((node) =>
      reveal.observe(node),
    );
    const scenes = Array.from(el.querySelectorAll<HTMLElement>("[data-scene]"));
    const visible = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          (entry.target as HTMLElement).dataset.active = String(
            entry.isIntersecting,
          );
      },
      { rootMargin: "80px" },
    );
    scenes.forEach((node) => visible.observe(node));
    let frame = 0;
    let pointerFrame = 0;
    const update = () => {
      frame = 0;
      const height = window.innerHeight;
      // Read the scene geometry together, before updating visual properties.
      const measurements = scenes.map((scene) => ({
        scene,
        rect: scene.getBoundingClientRect(),
      }));
      const scrollableHeight = document.documentElement.scrollHeight - height;
      for (const { scene, rect } of measurements) {
        if (rect.bottom < -height || rect.top > height * 2) continue;
        const p = motion
          ? clamp((height - rect.top) / (height + rect.height))
          : 0.5;
        scene.style.setProperty("--scene-progress", p.toFixed(4));
        if (scene.dataset.scene === "import") {
          const progress = motion
            ? clamp(-rect.top / Math.max(1, rect.height - height))
            : 0.7;
          scene.style.setProperty(
            "--gather",
            clamp((progress - 0.1) / 0.7).toFixed(4),
          );
        }
      }
      el.style.setProperty(
        "--read",
        String(clamp(window.scrollY / Math.max(1, scrollableHeight))),
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const tilt = el.querySelector<HTMLElement>("[data-tilt]");
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const move = (event: PointerEvent) => {
      if (!motion || !finePointer.matches || !tilt) return;
      cancelAnimationFrame(pointerFrame);
      pointerFrame = requestAnimationFrame(() => {
        const rect = tilt.getBoundingClientRect();
        tilt.style.setProperty(
          "--mx",
          String((event.clientX - rect.left) / rect.width - 0.5),
        );
        tilt.style.setProperty(
          "--my",
          String((event.clientY - rect.top) / rect.height - 0.5),
        );
      });
    };
    const reset = () => {
      cancelAnimationFrame(pointerFrame);
      tilt?.style.setProperty("--mx", "0");
      tilt?.style.setProperty("--my", "0");
    };
    tilt?.addEventListener("pointermove", move, { passive: true });
    tilt?.addEventListener("pointerleave", reset);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    update();
    return () => {
      reveal.disconnect();
      visible.disconnect();
      cancelAnimationFrame(frame);
      reset();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      tilt?.removeEventListener("pointermove", move);
      tilt?.removeEventListener("pointerleave", reset);
    };
  }, [motion]);

  return (
    <div ref={root} className={s.page} data-motion={motion ? "on" : "off"}>
      <a className={s.skip} href="#main">
        Skip to content
      </a>
      <header className={s.nav}>
        <Link href="/" aria-label="Clover home" className={s.logo}>
          <img
            src="/clover-name-teal.svg"
            alt="Clover"
            width={106}
            height={32}
          />
        </Link>
        <nav aria-label="Page navigation">
          <a href="#story">The story</a>
          <a href="#clarity">The possibilities</a>
          <Link href="/pricing">Plans</Link>
        </nav>
        <div className={s.navActions}>
          <button
            className={s.motionControl}
            onClick={() => setPaused(!paused)}
            disabled={reduced}
            aria-label={
              reduced
                ? "Reduced motion enabled"
                : paused
                  ? "Resume motion"
                  : "Pause motion"
            }
            title={
              reduced
                ? "Your reduced motion preference is enabled"
                : paused
                  ? "Resume motion"
                  : "Pause motion"
            }
          >
            {paused || reduced ? (
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="m7 4 9 6-9 6Z" fill="currentColor" />
              </svg>
            ) : (
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path
                  d="M7 4v12M13 4v12"
                  stroke="currentColor"
                  strokeWidth="2.5"
                />
              </svg>
            )}
          </button>
          <Link className={s.navCta} href="/sign-up">
            Start free <Arrow />
          </Link>
        </div>
        <span className={s.readProgress} aria-hidden="true" />
      </header>

      <main id="main">
        <section
          className={s.hero}
          data-scene="hero"
          aria-labelledby="hero-title"
        >
          <div className={s.heroGrid}>
            <div className={s.heroCopy}>
              <span className={s.eyebrow}>
                <span /> A LITTLE CLARITY CHANGES EVERYTHING
              </span>
              <h1 id="hero-title">
                Months of finances.
                <br />
                <em>Organized in minutes.</em>
              </h1>
              <p>
                Bring the scattered pieces of your money together. Make more
                room for life.
              </p>
              <div className={s.heroActions}>
                <Link href="/sign-up" className={s.primary}>
                  Find your clarity <Arrow />
                </Link>
                <a href="#story" className={s.textLink}>
                  Explore Clover <Arrow down />
                </a>
              </div>
              <span className={s.platforms}>
                Made for your everyday. <b>iOS · Android · Web</b>
              </span>
            </div>
            <div
              className={s.heroArt}
              data-tilt
              aria-label="Clover connects the little pieces of your financial life"
            >
              <div className={s.halo} aria-hidden="true" />
              <div className={s.orbit} aria-hidden="true">
                <i />
                <i />
              </div>
              <div className={s.orbitTwo} aria-hidden="true" />
              <BrandSculpture />
              <div className={`${s.floatObject} ${s.heroLunch}`}>
                <CategoryIcon name="food-dining" size={44} />
                <div>
                  <span>A little everyday life</span>
                  <strong>
                    Lunch <b>₱500</b>
                  </strong>
                </div>
              </div>
              <div className={`${s.floatObject} ${s.heroBank}`}>
                <img
                  src="/assets/banks/philippines/maya.png"
                  alt=""
                  width={42}
                  height={42}
                />
                <div>
                  <span>Maya wallet</span>
                  <strong>
                    ₱6,840<span>.00</span>
                  </strong>
                </div>
              </div>
              <div className={s.heroTile} aria-hidden="true">
                <CategoryIcon name="travel-lifestyle" size={72} />
              </div>
              <div className={s.heroMascot}>
                <CloverMascot pose="welcome" size={138} />
              </div>
              <div className={s.artCaption}>
                Less scattered. More connected.
              </div>
            </div>
          </div>
          <div className={s.heroFoot}>
            <a href="#story">
              <span className={s.scrollLine} aria-hidden="true" /> A clearer
              picture starts here <Arrow down />
            </a>
            <span>YOUR MONEY, WITH A LITTLE MORE PERSPECTIVE.</span>
          </div>
        </section>

        <section
          id="story"
          className={s.importScene}
          data-scene="import"
          aria-labelledby="story-title"
        >
          <div className={s.importSticky}>
            <div className={s.sectionCopy} data-reveal>
              <Chapter n="01">BRING IT ALL TOGETHER</Chapter>
              <h2 id="story-title">
                A fresh start.
                <br />
                <em>Without starting over.</em>
              </h2>
              <p>
                That stack of receipts. Those months of statements. The
                spreadsheet you meant to finish.
              </p>
              <p>
                Start with what you already have. Clover finds the transactions
                and helps you put them in order.
              </p>
              <div className={s.fileTypes}>
                <span>Statements</span>
                <span>Receipts</span>
                <span>Spreadsheets</span>
              </div>
              <div className={s.microNote}>
                Connect supported banks, upload a file, or add it yourself.
              </div>
            </div>
            <div className={s.importArt}>
              <div className={s.importTrack} aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <div className={s.paperStack}>
                <div className={s.paperBack}>
                  <span>BANK STATEMENT</span>
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
                <Receipt />
              </div>
              <div className={s.scanBeam} aria-hidden="true" />
              <div className={s.importLedger}>
                <Ledger />
              </div>
              <div className={s.importBadge}>
                <img src="/clover-mark.svg" alt="" width={22} height={22} />
                <span>From records to a clearer picture</span>
              </div>
            </div>
          </div>
        </section>

        <section
          id="together"
          className={s.accountsSection}
          data-scene="accounts"
          aria-labelledby="accounts-title"
        >
          <div className={s.centerCopy} data-reveal>
            <Chapter n="02">SEE THE WHOLE PICTURE</Chapter>
            <h2 id="accounts-title">
              Different places.
              <br />
              <em>One place to make sense of it.</em>
            </h2>
            <p>
              Banks, wallets, cash, credit cards, and investments.
              <br className={s.desktopBreak} /> Give every part of your money a
              place to belong.
            </p>
          </div>
          <div className={s.accountStage}>
            <div className={s.accountOrbit} aria-hidden="true" />
            <div className={s.accountCards}>
              {accounts.map((account, i) => (
                <div
                  className={s.accountCard}
                  key={account.name}
                  style={{ "--i": i, "--bank": account.color } as CSSProperties}
                >
                  <div className={s.accountCardTop}>
                    <img
                      src={`/assets/banks/philippines/${account.logo}`}
                      alt=""
                      width={52}
                      height={52}
                      loading="lazy"
                    />
                    <span>{account.kind}</span>
                  </div>
                  <strong>{account.name}</strong>
                  <span className={s.accountBalance}>
                    {account.amount}
                    <small>.00</small>
                  </span>
                  <div className={s.accountCardBottom}>
                    <span>
                      {account.kind === "Credit card"
                        ? "Outstanding balance"
                        : "Account balance"}
                    </span>
                    <span aria-hidden="true">↗</span>
                  </div>
                </div>
              ))}
            </div>
            <div className={s.balanceNote}>
              <span className={s.balanceDot} />
              Bank + wallet balances <strong>₱55,090.00</strong>
            </div>
          </div>
          <div className={s.accountBenefits}>
            <span>
              <b>Less app hopping.</b> More perspective.
            </span>
            <span>
              <b>Your currencies.</b> Your bigger picture.
            </span>
          </div>
        </section>

        <section
          id="clarity"
          className={s.reportSection}
          data-scene="report"
          aria-labelledby="report-title"
        >
          <div className={s.sectionCopy} data-reveal>
            <Chapter n="03">FIND THE PATTERNS</Chapter>
            <h2 id="report-title">
              Oh.
              <br />
              <em>That’s where it went.</em>
            </h2>
            <p>
              Turn a month of everyday moments into a picture you can
              understand. Explore your spending, compare periods, and see what
              changed.
            </p>
            <div className={s.periodControl} aria-label="Example report period">
              {(["September", "October"] as const).map((p) => (
                <button
                  key={p}
                  aria-pressed={period === p}
                  onClick={() => setPeriod(p)}
                >
                  {p}
                </button>
              ))}
            </div>
            <div className={s.reportTotal} aria-live="polite">
              <span>{period} spending</span>
              <strong>{report.total}</strong>
            </div>
          </div>
          <div className={s.reportArt}>
            <div className={s.donutStage}>
              <SpendingSculpture values={report.shares} />
              <div className={s.donutCenter}>
                <span>
                  EVERYDAY LIFE,
                  <br />
                  IN PERSPECTIVE.
                </span>
              </div>
            </div>
            <div className={s.legend}>
              {categories.map((category, i) => (
                <div className={s.legendRow} key={category.name}>
                  <CategoryIcon name={category.icon} size={34} />
                  <span>{category.name}</span>
                  <b>{report.amounts[i]}</b>
                  <span className={s.share}>{report.shares[i]}%</span>
                </div>
              ))}
            </div>
            <small className={s.demoLabel}>
              Interactive example · Try another month
            </small>
          </div>
        </section>

        <section
          id="ask"
          className={s.askSection}
          data-scene="ask"
          aria-labelledby="ask-title"
        >
          <div className={s.askBackdrop} aria-hidden="true" />
          <div className={s.sectionCopy} data-reveal>
            <Chapter n="04">A LITTLE GUIDANCE GOES A LONG WAY</Chapter>
            <h2 id="ask-title">
              Money questions?
              <br />
              <em>You’ve got Clover.</em>
            </h2>
            <p>
              Ask in your own words. Explore your records, make a plan, or add
              an everyday expense with a little help along the way.
            </p>
            <div className={s.askMascot}>
              <CloverMascot pose="chat" size={230} />
              <span>A friendly place to start.</span>
            </div>
          </div>
          <div className={s.chat}>
            <div className={s.chatHeading}>
              <img
                src="/assets/mascots/velvet-compact.webp"
                alt=""
                width={44}
                height={44}
                loading="lazy"
              />
              <div>
                <strong>Ask Clover</strong>
                <span>Your money. A conversation.</span>
              </div>
              <span className={s.chatSpark} aria-hidden="true">
                ✧
              </span>
            </div>
            <div
              className={s.chatContent}
              aria-live="polite"
              aria-atomic="true"
              key={question}
            >
              <div className={s.userMessage}>{questions[question]}</div>
              <div className={s.assistantName}>
                <img
                  src="/assets/mascots/velvet-compact.webp"
                  alt=""
                  width={28}
                  height={28}
                  loading="lazy"
                />
                <strong>Clover</strong>
              </div>
              <p>{replies[question]}</p>
              {question === 0 ? (
                <div className={s.chatChart}>
                  <div>
                    <CategoryIcon name="food-dining" size={32} />
                    <span>Food & Dining</span>
                    <b>₱7,360</b>
                  </div>
                  <div
                    className={s.chatBars}
                    aria-label="Food and Dining accounts for 40 percent of example spending"
                  >
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                  <small>40% of October spending</small>
                </div>
              ) : question === 1 ? (
                <div className={s.chatGoal}>
                  <CategoryIcon name="travel-lifestyle" size={52} />
                  <div>
                    <strong>Japan, here you come.</strong>
                    <span>A goal begins with a little intention.</span>
                  </div>
                </div>
              ) : (
                <div className={s.chatTransaction}>
                  <CategoryIcon name="food-dining" size={42} />
                  <div>
                    <strong>Lunch</strong>
                    <span>Ready for your account choice</span>
                  </div>
                  <b>₱500</b>
                </div>
              )}
            </div>
            <div className={s.chatPrompts}>
              <span>TRY A CONVERSATION</span>
              {questions.map((q, i) => (
                <button
                  key={q}
                  aria-pressed={question === i}
                  onClick={() => setQuestion(i)}
                >
                  {q}
                  <Arrow />
                </button>
              ))}
            </div>
          </div>
        </section>

        <section
          className={s.lifeSection}
          data-scene="life"
          aria-labelledby="life-title"
        >
          <div className={s.centerCopy} data-reveal>
            <Chapter n="05">MAKE ROOM FOR LIFE</Chapter>
            <h2 id="life-title">
              It’s never just
              <br />
              <em>about the numbers.</em>
            </h2>
            <p>
              It’s the trip you’ve been planning.
              <br />
              The people you share a little everyday life with.
            </p>
          </div>
          <div className={s.lifeGrid}>
            <article className={s.goalPanel} data-reveal>
              <div className={s.goalVisual}>
                <svg viewBox="0 0 280 180" aria-hidden="true">
                  <path
                    d="M30 160a110 110 0 0 1 220 0"
                    fill="none"
                    stroke="#fff"
                    strokeWidth="22"
                    strokeLinecap="round"
                  />
                  <path
                    className={s.goalArc}
                    d="M30 160a110 110 0 0 1 220 0"
                    fill="none"
                    stroke="#03a8c0"
                    strokeWidth="22"
                    strokeLinecap="round"
                    pathLength="100"
                    strokeDasharray="64 100"
                  />
                </svg>
                <CloverMascot pose="savings" size={146} />
                <div className={s.goalPercent}>
                  64<span>%</span>
                </div>
              </div>
              <div className={s.goalNumbers}>
                <span>Japan trip</span>
                <b>
                  ₱32,000 <small>of ₱50,000</small>
                </b>
              </div>
              <h3>A little closer, every day.</h3>
              <p>
                Set a goal, make a budget, and watch the little steps add up.
              </p>
            </article>
            <article className={s.sharedPanel} data-reveal>
              <div className={s.sharedVisual}>
                <div className={s.sharedRing} />
                <div className={s.sharedCenter}>
                  <CategoryIcon name="food-dining" size={46} />
                  <strong>Dinner together</strong>
                  <b>₱1,800</b>
                </div>
                <span className={s.personOne}>You</span>
                <span className={s.personTwo}>Alex</span>
                <span className={s.personThree}>Sam</span>
                <span className={s.sharedShare}>₱600 each</span>
              </div>
              <h3>Less “who owes who?”</h3>
              <p>
                Split a bill or create a Circle. Keep shared expenses clear,
                together.
              </p>
            </article>
          </div>
        </section>

        <section className={s.trustSection} aria-label="You stay in control">
          <div data-reveal>
            <span>01 / YOUR RECORDS</span>
            <h3>You bring the real life.</h3>
            <p>Start with files and accounts you already use.</p>
          </div>
          <div data-reveal>
            <span>02 / YOUR DECISIONS</span>
            <h3>You’re always in control.</h3>
            <p>Review suggestions and make them your own.</p>
          </div>
          <div data-reveal>
            <span>03 / YOUR PACE</span>
            <h3>A little at a time is fine.</h3>
            <p>Start free. Grow into what you need.</p>
          </div>
        </section>

        <section
          id="start"
          className={s.finale}
          data-scene="finale"
          aria-labelledby="start-title"
        >
          <div className={s.finaleArt}>
            <BrandSculpture small />
          </div>
          <div className={s.finaleCopy} data-reveal>
            <span className={s.eyebrow}>
              A LITTLE CLARITY. A LOT MORE POSSIBILITY.
            </span>
            <h2 id="start-title">
              Your money.
              <br />
              Your life.
              <br />
              <em>A little more in bloom.</em>
            </h2>
            <Link href="/sign-up" className={s.primary}>
              Start your Clover story <Arrow />
            </Link>
            <Link href="/pricing" className={s.textLink}>
              Explore the plans <Arrow />
            </Link>
          </div>
        </section>
      </main>
      <footer className={s.footer}>
        <div className={s.footerTop}>
          <Link href="/" aria-label="Clover home">
            <img
              src="/clover-name-teal.svg"
              alt="Clover"
              width={112}
              height={34}
              loading="lazy"
            />
          </Link>
          <span>Months of finances. Organized in minutes.</span>
        </div>
        <div className={s.footerBottom}>
          <p>
            Illustrative financial examples, not account data or app
            screenshots. Feature availability and limits depend on your plan,
            bank, and region.
          </p>
          <nav aria-label="Footer">
            <Link href="/features">Features</Link>
            <Link href="/help">Help</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
