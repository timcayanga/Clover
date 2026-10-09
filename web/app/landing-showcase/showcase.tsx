"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useShowcaseMotion, type MotionMode } from "./use-showcase-motion";
import { SwitchOfferNotice } from "@/components/switch-campaign";
import {
  plannedPremiumPrices,
  plannedProPrices,
  type PricingMarket,
} from "@/lib/public-plan-comparison";
import s from "./showcase.module.css";

const rows = [
  ["food-dining", "Lunch at Mendokoro", "BPI · Food & Dining", "−₱500.00"],
  ["salary", "Payday", "BPI · Income", "+₱45,000.00"],
  ["groceries", "Weekend groceries", "Maya · Groceries", "−₱1,280.00"],
];
const accounts = [
  {
    name: "BPI Savings",
    type: "Bank",
    logo: "bpi.png",
    amount: "₱46,000",
    color: "#a9182c",
  },
  {
    name: "UnionBank",
    type: "Bank",
    logo: "unionbank.jpg",
    amount: "₱21,250",
    color: "#bf5103",
  },
  {
    name: "Maya",
    type: "Wallet",
    logo: "maya.png",
    amount: "₱5,000",
    color: "#102920",
  },
  {
    name: "GStocks",
    type: "Investment",
    logo: "gcash.png",
    amount: "₱12,000",
    color: "#125995",
  },
];
const spending = [
  {
    name: "Food & Dining",
    icon: "food-dining",
    amount: "₱9,424",
    percent: "38%",
    color: "#03a8c0",
  },
  {
    name: "Housing",
    icon: "housing",
    amount: "₱6,696",
    percent: "27%",
    color: "#6bd2ae",
  },
  {
    name: "Travel",
    icon: "travel-lifestyle",
    amount: "₱5,208",
    percent: "21%",
    color: "#f2b276",
  },
  {
    name: "Groceries",
    icon: "groceries",
    amount: "₱3,472",
    percent: "14%",
    color: "#a68bcc",
  },
];
function Icon({
  kind = "arrow",
}: {
  kind?:
    | "arrow"
    | "pause"
    | "play"
    | "check"
    | "lock"
    | "edit"
    | "export"
    | "chevron"
    | "motion"
    | "replay"
    | "back";
}) {
  const path = {
    arrow: "M4 12h15m-6-6 6 6-6 6",
    pause: "M8 5v14M16 5v14",
    play: "m7 4 13 8-13 8Z",
    check: "m5 12 4 4L19 6",
    lock: "M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5ZM12 15v2",
    edit: "m16 3 5 5L8 21H3v-5ZM13 6l5 5",
    export: "M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5",
    chevron: "m7 9 5 5 5-5",
    motion: "M4 6h16M4 18h16M8 3v6M16 15v6M4 12h16M13 9v6",
    replay: "M4 10a8 8 0 1 1 1 7M4 4v6h6",
    back: "M20 12H5m6-6-6 6 6 6",
  }[kind];
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d={path}
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function Brand() {
  return (
    <span className={s.brand}>
      <img src="/clover-mark.svg" width="28" height="28" alt="" />
      <img src="/clover-name-teal.svg" width="100" height="28" alt="Clover" />
    </span>
  );
}
function Action({
  children = "Start free",
  href = "/sign-up",
}: {
  children?: ReactNode;
  href?: string;
}) {
  return (
    <Link prefetch={false} className={s.action} href={href}>
      {children}
      <Icon />
    </Link>
  );
}
function Category({ name, size = 42 }: { name: string; size?: number }) {
  return (
    <img
      src={`/figma-icons/categories/${name}.svg`}
      width={size}
      height={size}
      alt=""
      loading="lazy"
    />
  );
}
function Bank({ file, size = 40 }: { file: string; size?: number }) {
  return (
    <img
      className={s.bank}
      src={`/assets/landing-showcase/${file.split(".")[0]}.webp`}
      width={size}
      height={size}
      alt=""
      loading="lazy"
    />
  );
}
function Mascot({ pose, size = 160 }: { pose: string; size?: number }) {
  return (
    <img
      className={s.mascot}
      src={`/assets/mascots/velvet-${pose}.webp`}
      width={size}
      height={size}
      alt=""
      loading="lazy"
    />
  );
}
function Heading({
  children,
  text,
  hero = false,
}: {
  children: ReactNode;
  text: string;
  hero?: boolean;
}) {
  return (
    <div className={s.heading}>
      {hero ? <h1>{children}</h1> : <h2>{children}</h2>}
      <p>{text}</p>
    </div>
  );
}
function ScrollScene({
  id,
  className,
  children,
}: {
  id: string;
  className: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={`${s.scene} ${className}`} data-scroll-scene>
      <div className={s.pin}>{children}</div>
    </section>
  );
}

function CloverToken() {
  return (
    <span className={s.cloverToken}>
      <img src="/clover-mark.svg" width="64" height="64" alt="" />
    </span>
  );
}

function Receipt({ statement = false }: { statement?: boolean }) {
  return (
    <div className={`${s.paper} ${statement ? s.statement : ""}`}>
      {statement ? (
        <>
          <Bank file="bpi.png" size={36} />
          <strong>Statement of account</strong>
          <small>October 2026</small>
          <div className={s.paperRule} />
          <div className={s.paperItem}>
            <span>Payday</span>
            <b>₱45,000</b>
          </div>
          <div className={s.paperItem}>
            <span>Housing</span>
            <b>₱6,696</b>
          </div>
          <div className={s.paperItem}>
            <span>Lunch</span>
            <b>₱500</b>
          </div>
          <div className={s.paperLines}>
            <i />
            <i />
            <i />
          </div>
        </>
      ) : (
        <>
          <strong>MENDOKORO</strong>
          <small>October 5, 2026</small>
          <div className={s.paperRule} />
          <div className={s.paperItem}>
            <span>Lunch</span>
            <b>₱500.00</b>
          </div>
          <div className={s.paperTotal}>
            <span>Total</span>
            <b>₱500.00</b>
          </div>
          <div className={s.barcode} />
        </>
      )}
    </div>
  );
}
function Ledger() {
  return (
    <div className={s.ledger}>
      <div className={s.appToolbar}>
        <Brand />
        <span className={s.avatar}>J</span>
      </div>
      <div className={s.ledgerBody}>
        <div className={s.appTitle}>
          <strong>Transactions</strong>
          <span>PHP</span>
        </div>
        {rows.map(([icon, name, category, amount], i) => (
          <div
            className={s.transaction}
            key={name}
            style={{ "--row": i } as CSSProperties}
          >
            <Category name={icon} />
            <div>
              <strong>{name}</strong>
              <span>{category}</span>
            </div>
            <b className={i === 1 ? s.income : ""}>{amount}</b>
          </div>
        ))}
      </div>
    </div>
  );
}
function AccountCard({ index }: { index: number }) {
  const account = accounts[index];
  return (
    <div
      className={s.accountCard}
      style={
        { "--card": index, "--bank-color": account.color } as CSSProperties
      }
    >
      <div>
        <Bank file={account.logo} size={44} />
        <span>{account.type}</span>
      </div>
      <strong>{account.name}</strong>
      <b>{account.amount}</b>
    </div>
  );
}
function SpendingRing() {
  return (
    <div
      className={s.ringStage}
      role="img"
      aria-label="Example monthly spending: ₱24,800. Food and Dining 38 percent, Housing 27 percent, Travel 21 percent, Groceries 14 percent."
    >
      <div className={s.ringObject}>
        {Array.from({ length: 12 }, (_, i) => (
          <div
            key={i}
            className={s.ringLayer}
            style={{ "--depth": i } as CSSProperties}
            aria-hidden="true"
          />
        ))}
        <div className={s.ringTop} aria-hidden="true" />
        <div className={s.ringCenter}>
          <span>Total spending</span>
          <strong>₱24,800</strong>
          <small>This month</small>
        </div>
      </div>
    </div>
  );
}
function LunchMoment() {
  return (
    <div className={s.lunchMoment}>
      <Category name="food-dining" size={36} />
      <div>
        <strong>Lunch at Mendokoro</strong>
        <span>BPI · October 5</span>
      </div>
      <b>₱500</b>
    </div>
  );
}

function ReviewStory() {
  return (
    <div className={s.reviewStage} data-depth-stage>
      <div className={s.reviewReceipt}>
        <Receipt />
      </div>
      <svg className={s.sourceTrail} viewBox="0 0 550 390" aria-hidden="true">
        <path d="M115 180 C115 360 465 355 410 235" />
      </svg>
      <div className={s.reviewCard}>
        <div className={s.reviewTop}>
          <Icon kind="lock" />
          <span>Only you decide</span>
        </div>
        <LunchMoment />
        <div className={s.reviewCategory}>
          <span>Category</span>
          <strong>Food &amp; Dining</strong>
          <Icon kind="edit" />
        </div>
        <div className={s.confirmed}>
          <Icon kind="check" /> Confirmed by you
        </div>
      </div>
    </div>
  );
}

function GoalCard({ shared = false }: { shared?: boolean }) {
  return (
    <div className={s.goalCard} data-shared={shared}>
      <div className={s.goalIcon}>
        <Category name="travel-lifestyle" size={42} />
      </div>
      <div>
        <strong>Weekend away</strong>
        <span>{shared ? "Our shared goal" : "Goal plan"}</span>
      </div>
      <b>₱8,000</b>
      <div
        className={s.goalSteps}
        role="img"
        aria-label="Four monthly steps of 2,000 pesos to a goal of 8,000 pesos"
      >
        {[1, 2, 3, 4].map((step) => (
          <span key={step} style={{ "--step": step } as CSSProperties}>
            <i />₱{step * 2},000
          </span>
        ))}
      </div>
      <small>₱2,000 a month · 4 months</small>
    </div>
  );
}

function Chat() {
  return (
    <div className={s.chatCard}>
      <div className={s.chatHeader}>
        <Mascot pose="compact" size={38} />
        <strong>Ask Clover</strong>
      </div>
      <div className={s.question}>Could we make room for a weekend away?</div>
      <div className={s.reply}>
        <Mascot pose="compact" size={28} />
        <div>
          <strong>Clover</strong>
          <p>
            Food &amp; Dining came to ₱9,424 this month. Want to explore a little
            less dining out and plan ₱2,000 a month for your trip?
          </p>
        </div>
      </div>
      <GoalCard />
    </div>
  );
}

function SharedDream() {
  return (
    <div className={s.dreamStage} data-depth-stage>
      <div className={s.dreamWorld} aria-hidden="true">
        <div className={s.dreamSun} />
        <div className={s.dreamHillBack} />
        <div className={s.dreamSea} />
        <div className={s.dreamHillFront} />
        <div className={s.dreamSail}>
          <i />
        </div>
      </div>
      <div className={s.sharedGoal}>
        <GoalCard shared />
      </div>
      <div className={s.sharedLunch}>
        <LunchMoment />
        <div className={s.splitPeople}>
          <span><i>J</i>Jo <b>₱250</b></span>
          <span><i>M</i>Mika <b>₱250</b></span>
        </div>
      </div>
      <div className={s.dreamMascot}>
        <Mascot pose="circles" size={130} />
      </div>
    </div>
  );
}
function Plans({ initialMarket }: { initialMarket: PricingMarket }) {
  const [annual, setAnnual] = useState(false);
  const [market, setMarket] = useState(initialMarket);
  const prices = [null, plannedProPrices(market), plannedPremiumPrices(market)];
  const plans = [
    {
      name: "Free",
      features: [
        "Statement & receipt uploads",
        "10 financial accounts",
        "Essential reports & Ask Clover",
      ],
    },
    {
      name: "Plus",
      features: [
        "20 financial accounts",
        "2 linked bank accounts",
        "Advanced reports & Ask Clover",
      ],
    },
    {
      name: "Pro",
      features: [
        "40 financial accounts",
        "5 linked bank accounts",
        "Higher limits for Ask Clover",
      ],
    },
  ];
  return (
    <div className={s.pricing}>
      <div className={s.priceControls}>
        <div role="group" aria-label="Billing period">
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
        <select
          aria-label="Pricing currency"
          value={market}
          onChange={(e) => setMarket(e.target.value as PricingMarket)}
        >
          <option value="ph">PHP</option>
          <option value="global">USD</option>
        </select>
      </div>
      <div className={s.planCards}>
        {plans.map((plan, i) => (
          <article
            key={plan.name}
            className={s.planCard}
            data-tier={plan.name}
            style={{ "--card": i } as CSSProperties}
          >
            <h3>{plan.name}</h3>
            <div className={s.price} aria-live="polite">
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
              {i === 0 ? "Start free" : `Explore ${plan.name}`}
            </Action>
          </article>
        ))}
      </div>
      <Link className={s.compare} href="/pricing">
        Compare all features <Icon />
      </Link>
      <SwitchOfferNotice compact />
    </div>
  );
}

export function Showcase({ initialMarket }: { initialMarket: PricingMarket }) {
  const root = useRef<HTMLDivElement>(null);
  const { mode, setMode, reduced, navigateScene } = useShowcaseMotion(root);
  const [controlsOpen, setControlsOpen] = useState(false);
  const controls = useRef<HTMLDivElement>(null);
  const motionTrigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!controlsOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!controls.current?.contains(event.target as Node))
        setControlsOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setControlsOpen(false);
        motionTrigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", escape);
    };
  }, [controlsOpen]);
  return (
    <div
      ref={root}
      className={s.site}
      data-motion={reduced ? "off" : mode}
      data-reduced={reduced}
    >
      <a href="#showcase-main" className={s.skip}>
        Skip to content
      </a>
      <header className={s.nav}>
        <a href="#together" aria-label="Clover, back to top">
          <Brand />
        </a>
        <nav aria-label="Main navigation">
          <a href="#your-way">Discover Clover</a>
          <a href="#plans">Plans</a>
        </nav>
        <div className={s.navActions}>
          <div className={s.motionControls} ref={controls}>
            <button
              ref={motionTrigger}
              className={s.motionButton}
              type="button"
              onClick={() => setControlsOpen((open) => !open)}
              aria-label="Motion controls"
              aria-expanded={controlsOpen}
              aria-controls="showcase-motion-controls"
            >
              <Icon kind="motion" />
            </button>
            {controlsOpen && (
              <div className={s.motionPanel} id="showcase-motion-controls">
                <strong>Motion</strong>
                <div
                  className={s.motionModes}
                  role="group"
                  aria-label="Animation amount"
                >
                  {(["full", "gentle", "off"] as MotionMode[]).map((value) => (
                    <button
                      type="button"
                      key={value}
                      aria-pressed={(reduced ? "off" : mode) === value}
                      disabled={reduced && value !== "off"}
                      onClick={() => setMode(value)}
                    >
                      {value === "full"
                        ? "Full"
                        : value === "gentle"
                          ? "Gentle"
                          : "Off"}
                    </button>
                  ))}
                </div>
                {reduced && (
                  <p>Following your device’s reduced motion setting.</p>
                )}
                <div
                  className={s.sceneControls}
                  role="group"
                  aria-label="Explore scenes"
                >
                  <button
                    type="button"
                    aria-label="Previous scene"
                    onClick={() => navigateScene(-1)}
                  >
                    <Icon kind="back" />
                  </button>
                  <button
                    type="button"
                    aria-label="Restart current scene"
                    onClick={() => navigateScene(0)}
                  >
                    <Icon kind="replay" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next scene"
                    onClick={() => navigateScene(1)}
                  >
                    <Icon />
                  </button>
                </div>
              </div>
            )}
          </div>
          <Link className={s.login} prefetch={false} href="/sign-in">
            Log in
          </Link>
          <Action />
        </div>
        <div className={s.pageProgress} />
      </header>
      <main id="showcase-main">
        <ScrollScene id="together" className={s.hero}>
          <Heading
            hero
            text="Less time piecing your finances together. More room for what matters to you."
          >
            Months of finances.
            <br />
            <em>Organized in minutes.</em>
          </Heading>
          <Action>Organize my finances for free</Action>
          <div
            className={s.heroStage}
            data-depth-stage
            role="img"
            aria-label="Illustration of statements and receipts coming together as organized Clover transactions"
          >
            <div className={s.heroShadow} />
            <div className={s.heroOrbit} aria-hidden="true">
              <i />
              <i />
            </div>
            <div className={s.heroToken} aria-hidden="true">
              <CloverToken />
            </div>
            <div className={s.heroPaper}>
              <Receipt />
            </div>
            <div className={s.heroWindow}>
              <Ledger />
            </div>
            <div className={s.heroBank}>
              <AccountCard index={0} />
            </div>
            <div className={s.heroCategory}>
              <Category name="groceries" size={76} />
            </div>
            <div className={s.heroCategoryTwo}>
              <Category name="salary" size={66} />
            </div>
          </div>
          <a
            className={s.scrollArrow}
            href="#your-way"
            aria-label="Explore Clover"
          >
            <Icon kind="chevron" />
          </a>
        </ScrollScene>

        <ScrollScene id="your-way" className={s.intake}>
          <Heading text="A bank connection, a receipt, a few words. Start with what you have. Clover helps bring it together.">
            Start with<br /><em>what suits you.</em>
          </Heading>
          <div
            className={s.intakeStage}
            data-depth-stage
            role="img"
            aria-label="Example receipts and bank statements assembling into a categorized transaction list"
          >
            <div className={s.intakeGlow} />
            <div className={s.scanBeam} aria-hidden="true" />
            <div className={s.fileOne}>
              <Receipt statement />
            </div>
            <div className={s.fileTwo}>
              <Receipt />
            </div>
            <div className={s.fileThree}>
              <Bank file="maya.png" size={40} />
              <strong>Groceries</strong>
              <span>Added by you · Maya</span>
              <b>₱1,280.00</b>
            </div>
            <div className={s.intakeLedger}>
              <Ledger />
            </div>
            <div className={s.intakeCheck}>
              <Icon kind="check" />
            </div>
          </div>
        </ScrollScene>

        <ScrollScene id="your-control" className={s.control}>
          <div className={s.splitLayout}>
            <Heading text="Your records stay private. Check the details, make changes, and keep the final say.">
              A little help.<br /><em>Still your say.</em>
            </Heading>
            <ReviewStory />
          </div>
        </ScrollScene>

        <ScrollScene id="your-picture" className={s.accounts}>
          <div className={s.splitLayout}>
            <Heading text="The everyday spending, the savings, the future plans. See how it all fits into your life.">
              One less thing<br /><em>to piece together.</em>
            </Heading>
            <div
              className={s.accountsStage}
              data-depth-stage
              role="img"
              aria-label="Example Clover accounts: BPI ₱46,000, UnionBank ₱21,250, Maya ₱5,000, GStocks ₱12,000. Total ₱84,250."
            >
              <div className={s.accountHalo} />
              <div className={s.accountOrbit} aria-hidden="true">
                <i />
                <i />
                <i />
              </div>
              <div className={s.accountTotal}>
                <span>Net worth</span>
                <strong>
                  ₱84,250<span>.00</span>
                </strong>
              </div>
              <div className={s.accountDeck}>
                {accounts.map((account, i) => (
                  <AccountCard key={account.name} index={i} />
                ))}
              </div>
            </div>
          </div>
        </ScrollScene>

        <ScrollScene id="your-spending" className={s.reports}>
          <Heading text="A lunch here. Groceries there. The little things become a picture you can understand, and habits you can shape.">
            It starts to<br /><em>make sense.</em>
          </Heading>
          <div className={s.reportsStage} data-depth-stage>
            <div className={s.spendingJourney}>
              <SpendingRing />
              <div className={s.receiptToCategory}>
                <LunchMoment />
                <span>Part of your Food &amp; Dining</span>
              </div>
            </div>
            <div className={s.reportSpark} aria-hidden="true">
              <CloverToken />
            </div>
            <div className={s.categoryList}>
              {spending.map((item, i) => (
                <div key={item.name} style={{ "--row": i } as CSSProperties}>
                  <Category name={item.icon} />
                  <div>
                    <strong>{item.name}</strong>
                    <span>{item.percent}</span>
                  </div>
                  <b>{item.amount}</b>
                </div>
              ))}
            </div>
          </div>
        </ScrollScene>

        <ScrollScene id="ask-clover" className={s.ask}>
          <div className={s.splitLayout}>
            <Heading text="Turn “where did it go?” into “what could we do next?” Talk it through with Clover, one small step at a time.">
              Make room for<br /><em>a little possibility.</em>
            </Heading>
            <div className={s.askStage} data-depth-stage>
              <div className={s.mascotFigure}>
                <Mascot pose="chat" size={260} />
              </div>
              <Chat />
            </div>
          </div>
        </ScrollScene>

        <ScrollScene id="shared" className={s.shared}>
          <div className={s.splitLayout}>
            <Heading text="From splitting today’s lunch to planning your next adventure. Share the expenses, the goals, and the things you’re looking forward to.">
              A little easier.<br /><em>Together.</em>
            </Heading>
            <SharedDream />
          </div>
        </ScrollScene>

        <section id="plans" className={s.plans} data-scroll-scene>
          <Heading text="Start free. Choose Plus or Pro when you need more connections, insights, and room to grow.">
            A little clarity.
            <br />
            <em>At every stage.</em>
          </Heading>
          <Plans initialMarket={initialMarket} />
        </section>
        <section id="begin" className={s.finale} data-scroll-scene>
          <div className={s.finalMascot}>
            <Mascot pose="welcome" size={190} />
          </div>
          <Heading text="Feel clearer about your money. More confident about what comes next.">
            A little clarity.<br /><em>A little more living.</em>
          </Heading>
          <Action>Organize my finances for free</Action>
        </section>
      </main>
      <footer className={s.footer}>
        <a href="#together" aria-label="Clover, back to top">
          <Brand />
        </a>
        <div>
          <Link href="/help">Help</Link>
          <Link href="/contact-us">Contact</Link>
          <Link href="/privacy-policy">Privacy</Link>
          <Link href="/terms-of-service">Terms</Link>
        </div>
        <small>
          Product illustrations use sample data. © {new Date().getFullYear()}{" "}
          Clover.
        </small>
      </footer>
    </div>
  );
}
