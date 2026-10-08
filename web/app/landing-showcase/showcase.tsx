"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import Link from "next/link";
import { CloverMascot } from "@/components/clover-mascot";
import { SwitchOfferNotice } from "@/components/switch-campaign";
import {
  plannedPremiumPrices,
  plannedProPrices,
  type PricingMarket,
} from "@/lib/public-plan-comparison";
import { ProductStory } from "./product-story";
import s from "./showcase.module.css";

const chapters = [
  ["together", "Come together"],
  ["your-way", "Start your way"],
  ["your-control", "Stay in control"],
  ["your-picture", "See your money"],
  ["ask-clover", "Ask Clover"],
  ["shared", "Share the load"],
  ["plans", "Find your plan"],
  ["begin", "A clearer tomorrow"],
] as const;
const sources = [
  {
    label: "BPI Savings",
    kind: "Bank statement",
    logo: "bpi.png",
    amount: "₱60,000",
  },
  {
    label: "GCash",
    kind: "Wallet activity",
    logo: "gcash.png",
    amount: "₱24,250",
  },
];
const modes = ["Connect", "Upload", "Add manually"] as const;
const questions = [
  "Where did my money go?",
  "Help me save for a trip",
  "Add lunch, ₱500",
];
const bankNames = [
  ["BDO", "bdo.png"],
  ["BPI", "bpi.png"],
  ["Landbank", "landbank.png"],
  ["Metrobank", "metrobank.png"],
  ["RCBC", "rcbc.png"],
  ["Security Bank", "security bank.png"],
];
const clamp = (n: number) => Math.max(0, Math.min(1, n));

function Icon({
  kind = "arrow",
}: {
  kind?:
    | "arrow"
    | "down"
    | "link"
    | "upload"
    | "edit"
    | "check"
    | "lock"
    | "pause"
    | "play";
}) {
  const paths = {
    arrow: "M4 12h15m-6-6 6 6-6 6",
    down: "M12 4v15m-6-6 6 6 6-6",
    link: "m9 15 6-6M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 1 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0",
    upload: "M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5",
    edit: "m16 3 5 5L8 21H3v-5ZM13 6l5 5",
    check: "m5 12 4 4L19 6",
    lock: "M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5ZM12 15v2",
    pause: "M8 5v14M16 5v14",
    play: "m7 4 13 8-13 8Z",
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d={paths[kind]}
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function Eyebrow({ n, children }: { n: number; children: ReactNode }) {
  return (
    <p className={s.eyebrow}>
      <span>{String(n).padStart(2, "0")}</span>
      {children}
    </p>
  );
}
function Action({
  children = "Start with Clover",
  secondary = false,
  href = "/sign-up",
}: {
  children?: ReactNode;
  secondary?: boolean;
  href?: string;
}) {
  return (
    <Link
      prefetch={false}
      href={href}
      className={secondary ? s.textLink : s.action}
    >
      {children}
      <Icon />
    </Link>
  );
}
function BankLogo({ file, size = 42 }: { file: string; size?: number }) {
  return (
    <img
      className={s.bankLogo}
      src={`/assets/banks/philippines/${file}`}
      alt=""
      width={size}
      height={size}
      loading="lazy"
    />
  );
}
function Category({ name }: { name: string }) {
  return (
    <img
      src={`/figma-icons/categories/${name}.svg`}
      alt=""
      width={40}
      height={40}
      loading="lazy"
    />
  );
}
function Receipt() {
  return (
    <div className={s.receipt}>
      <div className={s.receiptBrand}>A LITTLE EVERYDAY</div>
      <strong>
        Good food.
        <br />
        Good company.
      </strong>
      <div className={s.receiptRule} />
      <span>Lunch with a friend</span>
      <div className={s.receiptLine}>
        <span>Total</span>
        <b>₱500.00</b>
      </div>
      <div className={s.barcode} />
      <small>A moment worth keeping.</small>
    </div>
  );
}
function Phone({
  screen,
  caption,
}: {
  screen: "accounts" | "ask" | "split";
  caption: string;
}) {
  // These exact public sample screens are currently served by clover.ph.
  const image = {
    accounts: "accounts-20260928.png",
    ask: "adviser-20261007.png",
    split: "split-20260928.png",
  }[screen];
  return (
    <figure className={s.phoneFigure}>
      <div className={s.phone}>
        <div className={s.phoneTop}>
          <span>9:41</span>
          <i />
          <span>••• ▰</span>
        </div>
        <img
          className={s.phoneScreen}
          src={`/assets/marketing-screens/${image}`}
          alt={`Clover ${caption}, as shown on the live Clover website, with sample data`}
          width={1560}
          height={3024}
          loading="lazy"
        />
        <div className={s.homeIndicator} />
      </div>
      <figcaption>{caption} in Clover</figcaption>
    </figure>
  );
}
function Donut({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`${s.donut} ${compact ? s.donutCompact : ""}`}>
      <svg
        viewBox="0 0 300 300"
        role="img"
        aria-label="Example spending: food 38%, home 27%, travel 21%, other 14%"
      >
        <circle
          cx="150"
          cy="150"
          r="111"
          fill="none"
          stroke="#edf3f5"
          strokeWidth="43"
        />
        {[
          { color: "#03a8c0", value: 38, offset: 0 },
          { color: "#6ee7b7", value: 27, offset: 38 },
          { color: "#fdba74", value: 21, offset: 65 },
          { color: "#bba6e4", value: 14, offset: 86 },
        ].map(({ color, value, offset }) => (
          <circle
            key={color}
            className={s.donutArc}
            cx="150"
            cy="150"
            r="111"
            fill="none"
            stroke={color}
            strokeWidth="43"
            pathLength="100"
            strokeDasharray={`${value - 0.8} ${100.8 - value}`}
            strokeDashoffset={-offset}
            transform="rotate(-90 150 150)"
          />
        ))}
      </svg>
      <div>
        <span>This month</span>
        <strong>₱24,800</strong>
        <small>Where it went</small>
      </div>
    </div>
  );
}
function ChatDemo() {
  const [question, setQuestion] = useState(0);
  return (
    <div className={s.chatDemo}>
      <div className={s.chatHeader}>
        <CloverMascot pose="chat" size={52} />
        <div>
          <strong>Ask Clover</strong>
          <span>A little clarity. A helpful next step.</span>
        </div>
        <span className={s.liveDot} />
      </div>
      <div className={s.chatBody} key={question} aria-live="polite">
        <div className={s.userBubble}>{questions[question]}</div>
        <div className={s.cloverReply}>
          <CloverMascot pose="compact" size={32} />
          <div>
            <strong>Clover</strong>
            <p>
              {
                [
                  "Food & Dining is your biggest spending category this month. Here’s your spending at a glance.",
                  "Let’s make room for something to look forward to. How much would you like to save for your trip?",
                  "Lunch, ₱500, Food & Dining. Which account did you pay from?",
                ][question]
              }
            </p>
          </div>
        </div>
        {question === 0 ? (
          <div className={s.chatChart}>
            <Donut compact />
            <div>
              <span>
                <i style={{ background: "#03a8c0" }} />
                Food & Dining
              </span>
              <span>
                <i style={{ background: "#6ee7b7" }} />
                Home
              </span>
              <span>
                <i style={{ background: "#fdba74" }} />
                Travel
              </span>
              <span>
                <i style={{ background: "#bba6e4" }} />
                Other
              </span>
            </div>
          </div>
        ) : question === 1 ? (
          <div className={s.goalPreview}>
            <CloverMascot pose="savings" size={90} />
            <div>
              <small>Your next adventure</small>
              <strong>Japan trip</strong>
              <span>A goal to build together.</span>
            </div>
          </div>
        ) : (
          <div className={s.transactionPreview}>
            <Category name="food-dining" />
            <div>
              <strong>Lunch</strong>
              <span>Food & Dining · Account to confirm</span>
            </div>
            <b>−₱500</b>
          </div>
        )}
      </div>
      <div className={s.questionChoices} aria-label="Try an example question">
        {questions.map((q, i) => (
          <button
            key={q}
            type="button"
            aria-pressed={question === i}
            onClick={() => setQuestion(i)}
          >
            {q}
            <Icon />
          </button>
        ))}
      </div>
      <small className={s.demoNote}>
        Interactive example with sample data.
      </small>
    </div>
  );
}
function PlanScene({ initialMarket }: { initialMarket: PricingMarket }) {
  const [annual, setAnnual] = useState(false);
  const [market, setMarket] = useState(initialMarket);
  const prices = [null, plannedProPrices(market), plannedPremiumPrices(market)];
  const plans = [
    {
      name: "Free",
      tag: "A clearer everyday.",
      description:
        "Bring your records together and start seeing the bigger picture.",
      features: [
        "Statement & receipt uploads",
        "10 financial accounts",
        "Essential reports",
        "Basic Ask Clover",
      ],
    },
    {
      name: "Plus",
      tag: "Room to grow.",
      description:
        "Connect your accounts and go deeper into your financial life.",
      features: [
        "Everything in Free",
        "20 financial accounts",
        "2 linked bank accounts",
        "Advanced reports & Ask Clover",
      ],
    },
    {
      name: "Pro",
      tag: "More possibility.",
      description:
        "More connections, higher limits, and more help along the way.",
      features: [
        "Everything in Plus",
        "40 financial accounts",
        "5 linked bank accounts",
        "A larger AI allowance",
      ],
    },
  ];
  return (
    <div className={s.pricing}>
      <div className={s.priceControls}>
        <div className={s.billingToggle} aria-label="Billing period">
          <button
            type="button"
            aria-pressed={!annual}
            onClick={() => setAnnual(false)}
          >
            Monthly
          </button>
          <button
            type="button"
            aria-pressed={annual}
            onClick={() => setAnnual(true)}
          >
            Yearly
          </button>
        </div>
        <label>
          Prices in{" "}
          <select
            value={market}
            onChange={(e) => setMarket(e.target.value as PricingMarket)}
          >
            <option value="ph">PHP</option>
            <option value="global">USD</option>
          </select>
        </label>
      </div>
      <div className={s.planCards}>
        {plans.map((plan, i) => (
          <article
            key={plan.name}
            className={`${s.planCard} ${i === 1 ? s.plusPlan : i === 2 ? s.proPlan : ""}`}
          >
            <div className={s.planSymbol} aria-hidden="true">
              {Array.from({ length: i + 1 }, (_, n) => (
                <img
                  key={n}
                  src="/clover-mark.svg"
                  alt=""
                  width={32}
                  height={32}
                />
              ))}
            </div>
            <span className={s.planTag}>{plan.tag}</span>
            <h3>{plan.name}</h3>
            <p>{plan.description}</p>
            <div className={s.planPrice} aria-live="polite">
              <strong>
                {i === 0 ? "Free" : prices[i]![annual ? "annual" : "monthly"]}
              </strong>
              {i > 0 && <span>/ {annual ? "year" : "month"}</span>}
            </div>
            <ul>
              {plan.features.map((f) => (
                <li key={f}>
                  <Icon kind="check" />
                  {f}
                </li>
              ))}
            </ul>
            <Action href={i === 0 ? "/sign-up" : "/pricing"}>
              {i === 0 ? "Start for free" : `Explore ${plan.name}`}
            </Action>
          </article>
        ))}
      </div>
      <p className={s.priceNote}>
        Web pricing. Features and usage limits vary by plan.{" "}
        <Link href="/pricing">
          Compare everything included
          <Icon />
        </Link>
      </p>
      <SwitchOfferNotice compact />
    </div>
  );
}

export function Showcase({ initialMarket }: { initialMarket: PricingMarket }) {
  const root = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(true);
  const [chapter, setChapter] = useState(0);
  const [mode, setMode] = useState<(typeof modes)[number]>("Upload");
  const active = useRef(0);
  const animated = !paused && !reduced;
  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(query.matches);
    change();
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const visuals = [...el.querySelectorAll<HTMLElement>("[data-visual]")];
    const sections = [...el.querySelectorAll<HTMLElement>("[data-chapter]")];
    let frame = 0;
    const update = () => {
      frame = 0;
      const height = window.innerHeight;
      const max = document.documentElement.scrollHeight - height;
      const bounds = sections.map((section) => section.getBoundingClientRect());
      const visualBounds = visuals.map((visual) =>
        visual.getBoundingClientRect(),
      );
      let current = 0;
      bounds.forEach((box, i) => {
        if (box.top < height * 0.45) current = i;
      });
      if (active.current !== current) {
        active.current = current;
        setChapter(current);
      }
      sections.forEach((section, i) => {
        const box = bounds[i];
        if (box.bottom < -height || box.top > height * 2) return;
        const p = clamp(-box.top / Math.max(1, box.height - height));
        const enter = clamp((height - box.top) / (height * 0.85));
        section.style.setProperty("--scene", String(animated ? p : 0.5));
        section.style.setProperty("--enter", String(animated ? enter : 1));
      });
      visuals.forEach((visual, i) =>
        visual.style.setProperty(
          "--visual",
          String(
            animated
              ? clamp(
                  (height - visualBounds[i].top) /
                    (height + visualBounds[i].height * 0.3),
                )
              : 1,
          ),
        ),
      );
      el.style.setProperty(
        "--page-travel",
        String(max > 0 ? clamp(window.scrollY / max) : 0),
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const resize = new ResizeObserver(schedule);
    resize.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [animated]);

  return (
    <div ref={root} className={s.site} data-motion={animated ? "on" : "off"}>
      <a href="#showcase-main" className={s.skip}>
        Skip to content
      </a>
      <header className={s.nav}>
        <a
          href="#together"
          className={s.logo}
          aria-label="Clover, back to the beginning"
        >
          <img src="/clover-mark.svg" alt="" width={30} height={30} />
          <img
            src="/clover-name-teal.svg"
            alt="Clover"
            width={108}
            height={30}
          />
        </a>
        <nav aria-label="Main navigation">
          <a href="#your-way">How it works</a>
          <a href="#your-picture">Your money</a>
          <a href="#plans">Plans</a>
        </nav>
        <div className={s.navActions}>
          <button
            className={s.motionToggle}
            type="button"
            onClick={() => setPaused((p) => !p)}
            aria-label={paused ? "Enable animation" : "Pause animation"}
            aria-pressed={paused}
            title={paused ? "Enable animation" : "Pause animation"}
          >
            <Icon kind={paused ? "play" : "pause"} />
          </button>
          <Link prefetch={false} href="/sign-in" className={s.login}>
            Log in
          </Link>
          <Action>Start free</Action>
        </div>
        <div className={s.pageProgress} />
      </header>
      <aside className={s.journeyRail} aria-label="Page chapters">
        {chapters.map(([id, label], i) => (
          <a
            key={id}
            href={`#${id}`}
            aria-label={label}
            aria-current={chapter === i ? "step" : undefined}
          >
            <span>{label}</span>
            <i />
          </a>
        ))}
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-label={paused ? "Enable animation" : "Pause animation"}
          title={paused ? "Enable animation" : "Pause animation"}
        >
          <Icon kind={paused ? "play" : "pause"} />
        </button>
      </aside>
      <main id="showcase-main">
        <section id="together" data-chapter className={s.hero}>
          <div className={s.heroSticky}>
            <div className={s.heroInner}>
              <div className={s.heroCopy}>
                <p className={s.introLabel}>
                  <span /> A little clarity changes everything.
                </p>
                <h1>
                  Months of finances.
                  <br />
                  <em>
                    Organized
                    <br className={s.desktopBreak} /> in minutes.
                  </em>
                </h1>
                <p className={s.lead}>
                  Connect supported banks, upload statements and receipts, or
                  add details manually. Bring your money together. Make room for
                  what matters.
                </p>
              </div>
              <div className={s.heroVisual}>
                <ProductStory animated={animated} />
              </div>
              <div className={s.heroActionCluster}>
                <div className={s.heroActions}>
                  <Action>Organize my finances for free</Action>
                  <a href="#your-way" className={s.explore}>
                    Explore Clover
                    <Icon kind="down" />
                  </a>
                </div>
                <div className={s.deviceNote}>
                  Made for your everyday.<span>Web · iOS · Android</span>
                </div>
              </div>
            </div>
            <a href="#your-way" className={s.scrollCue}>
              <span>There’s more to your money. Scroll to explore.</span>
              <i>
                <Icon kind="down" />
              </i>
            </a>
          </div>
        </section>

        <section id="your-way" data-chapter className={s.intake}>
          <div className={s.stickyScene}>
            <div className={s.splitLayout}>
              <div className={s.copy}>
                <Eyebrow n={2}>Start your way</Eyebrow>
                <h2>
                  Your financial life.
                  <br />
                  <em>Already in progress.</em>
                </h2>
                <p>
                  No need to start from scratch. Bring the statements, receipts,
                  screenshots, and spreadsheets you already have.
                </p>
                <p>
                  Or connect a supported bank and bring your accounts into view.
                  A quick manual entry works, too.
                </p>
                <div
                  className={s.modeTabs}
                  aria-label="Ways to add your records"
                >
                  {modes.map((m, i) => (
                    <button
                      type="button"
                      key={m}
                      aria-pressed={mode === m}
                      onClick={() => setMode(m)}
                    >
                      <Icon
                        kind={i === 0 ? "link" : i === 1 ? "upload" : "edit"}
                      />
                      {m}
                    </button>
                  ))}
                </div>
                <div className={s.modeDescription} aria-live="polite">
                  {mode === "Connect"
                    ? "Choose a supported bank, then select the accounts you want to link. Bank availability varies by country."
                    : mode === "Upload"
                      ? "Clover finds the transactions. You review the details, make corrections, and keep moving."
                      : "A coffee, a payday, a cash expense. Add the details of everyday life as they happen."}
                </div>
                <Action secondary href="/features/manage-money">
                  A simpler way to get organized
                </Action>
              </div>
              <div className={s.intakeVisual} data-visual data-mode={mode}>
                <div className={s.intakeOrbit} />
                <div className={s.intakePaper}>
                  <Receipt />
                </div>
                <div className={s.sourceChip}>
                  <BankLogo file="bpi.png" />
                  <span>Statements</span>
                </div>
                <div className={s.sourceChipTwo}>
                  <Category name="shopping" />
                  <span>Screenshots</span>
                </div>
                <div className={s.intakePanel} key={mode}>
                  <div className={s.panelHeader}>
                    <img src="/clover-mark.svg" alt="" width={26} height={26} />
                    <strong>
                      {mode === "Connect"
                        ? "Your bank. Your choice."
                        : mode === "Upload"
                          ? "Everything, falling into place."
                          : "One little moment, recorded."}
                    </strong>
                  </div>
                  {mode === "Connect" ? (
                    <div className={s.bankGrid}>
                      {bankNames.map(([name, logo]) => (
                        <div key={name}>
                          <BankLogo file={logo} />
                          <span>{name}</span>
                        </div>
                      ))}
                    </div>
                  ) : mode === "Upload" ? (
                    <div className={s.ledger}>
                      {[
                        [
                          "food-dining",
                          "Lunch with a friend",
                          "Food & Dining",
                          "−₱500",
                        ],
                        ["salary", "Payday", "Income", "+₱45,000"],
                        [
                          "groceries",
                          "Weekend groceries",
                          "Groceries",
                          "−₱1,280",
                        ],
                      ].map(([icon, title, category, amount], i) => (
                        <div
                          key={title}
                          className={s.ledgerRow}
                          style={{ "--row": i } as CSSProperties}
                        >
                          <Category name={icon} />
                          <div>
                            <strong>{title}</strong>
                            <span>{category}</span>
                          </div>
                          <b>{amount}</b>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className={s.manualExample}>
                      <span>What was it for?</span>
                      <strong>Lunch with a friend</strong>
                      <div>
                        <span>Amount</span>
                        <b>₱500.00</b>
                      </div>
                      <div>
                        <span>Category</span>
                        <b>
                          <Category name="food-dining" />
                          Food & Dining
                        </b>
                      </div>
                    </div>
                  )}
                  <div className={s.panelFooter}>
                    <Icon kind="check" />
                    You review. Clover learns.
                  </div>
                </div>
                <span className={s.sampleLabel}>An illustrated example</span>
              </div>
            </div>
          </div>
        </section>

        <section id="your-control" data-chapter className={s.control}>
          <div className={s.controlInner}>
            <div className={s.controlArt} data-visual aria-hidden="true">
              <div className={s.vaultRing} />
              <div className={s.vaultRingTwo} />
              <div className={s.vaultGlass}>
                <Icon kind="lock" />
                <span>Yours.</span>
              </div>
              <div className={s.controlToken}>
                <Icon kind="check" />
                You decide.
              </div>
              <CloverMascot pose="welcome" size={120} />
            </div>
            <div className={s.copy}>
              <Eyebrow n={3}>Stay in control</Eyebrow>
              <h2>
                Your money is personal.
                <br />
                <em>Let’s keep it that way.</em>
              </h2>
              <p>
                Your records are private, reviewable, and traceable. Clover
                helps you organize them. You stay in control of the details.
              </p>
              <div className={s.controlList}>
                {[
                  "Review and edit your records",
                  "Export your data when you need it",
                  "Delete your data through your account",
                ].map((text) => (
                  <div key={text}>
                    <Icon kind="check" />
                    <span>{text}</span>
                  </div>
                ))}
              </div>
              <Action secondary href="/privacy-policy">
                How Clover protects your data
              </Action>
            </div>
          </div>
        </section>

        <section id="your-picture" data-chapter className={s.picture}>
          <div className={s.stickyScene}>
            <div className={s.pictureHeading}>
              <Eyebrow n={4}>See the bigger picture</Eyebrow>
              <h2>
                Less piecing it together.
                <br />
                <em>More seeing what’s possible.</em>
              </h2>
              <p>
                Accounts, spending, recurring bills, and investments.
                <br className={s.desktopBreak} /> One connected view of your
                financial life.
              </p>
            </div>
            <div className={s.pictureStage} data-visual>
              <div className={s.accountFloat}>
                <span className={s.smallLabel}>Your money, together</span>
                {sources.map((account) => (
                  <div key={account.label}>
                    <BankLogo file={account.logo} />
                    <div>
                      <strong>{account.label}</strong>
                      <span>{account.kind}</span>
                    </div>
                    <b>{account.amount}</b>
                  </div>
                ))}
                <div className={s.accountFloatTotal}>
                  <span>Tracked balance</span>
                  <strong>₱84,250</strong>
                </div>
              </div>
              <div className={s.overviewPhone}>
                <Phone screen="accounts" caption="Your accounts" />
              </div>
              <div className={s.reportFloat}>
                <div className={s.reportTop}>
                  <span className={s.smallLabel}>Where it went</span>
                  <span>October</span>
                </div>
                <Donut />
                <div className={s.reportLegend}>
                  <span>
                    <i style={{ background: "#03a8c0" }} />
                    Food
                  </span>
                  <span>
                    <i style={{ background: "#6ee7b7" }} />
                    Home
                  </span>
                  <span>
                    <i style={{ background: "#fdba74" }} />
                    Travel
                  </span>
                  <span>
                    <i style={{ background: "#bba6e4" }} />
                    Other
                  </span>
                </div>
              </div>
            </div>
            <p className={s.pictureFoot}>
              See what changed. Understand your patterns. Build better habits.
              <span>
                Product screen from the live Clover site. Surrounding visuals
                use sample data.
              </span>
            </p>
          </div>
        </section>

        <section id="ask-clover" data-chapter className={s.ask}>
          <div className={s.askHeading}>
            <Eyebrow n={5}>A little help along the way</Eyebrow>
            <h2>
              Big questions.
              <br />
              <em>Meet your little helper.</em>
            </h2>
            <p>
              Ask what changed this month. Plan a goal. Add a transaction.
              <br className={s.desktopBreak} /> Ask Clover helps turn your
              records into a clearer next step.
            </p>
          </div>
          <div className={s.askStage}>
            <div className={s.askPhone}>
              <Phone screen="ask" caption="Ask Clover" />
            </div>
            <div className={s.mascotStage}>
              <div className={s.mascotGlow} />
              <CloverMascot pose="chat" size={300} />
              <span>
                A friendly perspective
                <br />
                on your everyday money.
              </span>
            </div>
            <ChatDemo />
          </div>
        </section>

        <section id="shared" data-chapter className={s.shared}>
          <div className={s.sharedInner}>
            <div className={s.copy}>
              <Eyebrow n={6}>Share the load</Eyebrow>
              <h2>
                Life is shared.
                <br />
                <em>Money can be, too.</em>
              </h2>
              <p>
                Dinner with friends. A home with your partner. The plans you’re
                making together.
              </p>
              <div className={s.sharedFeatures}>
                <div>
                  <span>01</span>
                  <div>
                    <h3>Split the bill. Keep the good feeling.</h3>
                    <p>See who paid and who still owes, all in one place.</p>
                  </div>
                </div>
                <div>
                  <span>02</span>
                  <div>
                    <h3>A little more in sync.</h3>
                    <p>
                      Create a Circle for shared expenses, budgets, and goals.
                    </p>
                  </div>
                </div>
              </div>
              <Action secondary href="/features/manage-money-together">
                Make shared money simpler
              </Action>
            </div>
            <div className={s.sharedVisual} data-visual>
              <div className={s.sharedOrbit} />
              <div className={s.sharedPhone}>
                <Phone screen="split" caption="Split Bills" />
              </div>
              <div className={s.sharedBadge}>
                <div className={s.avatars}>
                  <span>J</span>
                  <span>M</span>
                  <span>A</span>
                </div>
                <strong>Dinner, sorted.</strong>
                <span>More time for the good part.</span>
              </div>
              <div className={s.circleBadge}>
                <CloverMascot pose="circles" size={108} />
                <div>
                  <strong>In your Circle.</strong>
                  <span>Your household. Your goals.</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="plans" data-chapter className={s.plans}>
          <div className={s.centerHeading}>
            <Eyebrow n={7}>Grow at your own pace</Eyebrow>
            <h2>
              Start with a little clarity.
              <br />
              <em>Make room for more.</em>
            </h2>
            <p>
              Start free. Choose Plus or Pro as your financial life gets more
              complex.
            </p>
          </div>
          <PlanScene initialMarket={initialMarket} />
        </section>

        <section id="begin" data-chapter className={s.finale}>
          <div className={s.finaleRings} aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <div className={s.finaleContent}>
            <CloverMascot pose="welcome" size={170} />
            <Eyebrow n={8}>Your next chapter</Eyebrow>
            <h2>
              Money looks
              <br />
              <em>better from here.</em>
            </h2>
            <p>
              Feel clearer about your money.
              <br />
              More confident about what comes next.
            </p>
            <Action>Organize my finances for free</Action>
            <span className={s.finaleNote}>
              A little clarity. A lot more possibility.
            </span>
          </div>
        </section>
      </main>
      <footer className={s.footer}>
        <a href="#together" className={s.logo}>
          <img src="/clover-mark.svg" alt="" width={28} height={28} />
          <img
            src="/clover-name-teal.svg"
            alt="Clover"
            width={108}
            height={30}
          />
        </a>
        <div>
          <Link href="/help">Help</Link>
          <Link href="/contact-us">Contact</Link>
          <Link href="/privacy-policy">Privacy</Link>
          <Link href="/terms-of-service">Terms</Link>
        </div>
        <button type="button" onClick={() => setPaused((p) => !p)}>
          <Icon kind={paused ? "play" : "pause"} />
          {paused ? "Enable motion" : "Pause motion"}
        </button>
        <small>
          © {new Date().getFullYear()} Clover. Money looks better from here.
        </small>
      </footer>
    </div>
  );
}
