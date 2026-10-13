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

// Reuse the people and locations from Clover's production story. These are
// marketing images, not screenshots or customer records.
function StoryPhoto({
  desktop,
  mobile,
  alt,
  eager = false,
}: {
  desktop: string;
  mobile: string;
  alt: string;
  eager?: boolean;
}) {
  return (
    <picture className={s.photo}>
      <source
        media="(max-width: 900px), (max-width: 1100px) and (min-height: 1000px)"
        srcSet={`/assets/${mobile}.webp`}
      />
      <img
        src={`/assets/${desktop}.webp`}
        alt={alt}
        width={1672}
        height={941}
        loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : "auto"}
        decoding="async"
      />
    </picture>
  );
}

// Screens are captured from the production UI with fictional data. The layered
// cards are lightweight editorial illustrations, never a live financial account.
function AppScreen({
  page,
  eager = false,
}: {
  page: "accounts" | "transactions";
  eager?: boolean;
}) {
  return (
    <div className={s.phone}>
      <div className={s.phoneCamera} aria-hidden="true" />
      <img
        src={`/assets/landing-showcase/${page === "accounts" ? "accounts-sections-production-20261014" : "transactions-production-hd-20261013"}-2x.webp`}
        srcSet={`/assets/landing-showcase/${page === "accounts" ? "accounts-sections-production-20261014" : "transactions-production-hd-20261013"}-2x.webp 804w, /assets/landing-showcase/${page === "accounts" ? "accounts-sections-production-20261014" : "transactions-production-hd-20261013"}.webp 1206w`}
        sizes="(max-width: 900px) 285px, (max-width: 1100px) and (min-height: 1000px) 285px, 310px"
        alt={
          page === "accounts"
            ? "Clover account lists with BPI, UnionBank, BDO, Maya, GCash, GoTrade and ATRAM, using fictional balances."
            : "Clover Transactions showing categorized purchases, dates, amounts and bank logos with sample data."
        }
        width={402}
        height={820}
        loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : "auto"}
        decoding="async"
      />
    </div>
  );
}
function Receipt({ small = false }: { small?: boolean }) {
  return (
    <div
      className={`${s.receipt} ${small ? s.smallReceipt : ""}`}
      aria-hidden="true"
    >
      <img
        src="/figma-icons/categories/food-dining.svg"
        className={s.receiptLogo}
        width={38}
        height={38}
        alt=""
      />
      <strong>STARBUCKS</strong>
      <span>October 5, 2026 · 9:41 AM</span>
      <div>
        <span>Caffè Latte</span>
        <span>₱190.00</span>
      </div>
      <div className={s.receiptTotal}>
        <strong>Total</strong>
        <strong>₱190.00</strong>
      </div>
      <div className={s.barcode} />
    </div>
  );
}

// One purchase stays in the same DOM node as paper becomes a row, then joins
// its category. The labels are illustrative; no customer data is processed here.
function PurchaseThroughline() {
  return (
    <div className={s.purchaseThroughline} aria-hidden="true">
      <div className={s.purchasePaper}>
        <div className={s.purchaseReceiptHead}>
          STARBUCKS<small>October 5, 2026 · 9:41 AM</small>
        </div>
        <div className={s.purchaseIdentity}>
          <img
            src="/figma-icons/categories/food-dining.svg"
            width={44}
            height={44}
            alt=""
          />
          <div>
            <strong>Coffee at Starbucks</strong>
            <small>Food & dining · BPI</small>
          </div>
          <b>₱190.00</b>
        </div>
        <div className={s.purchaseReceiptTail}>
          <span>Caffè Latte</span>
          <span>Total paid</span>
          <div className={s.barcode} />
        </div>
      </div>
    </div>
  );
}

function ConnectionOptions() {
  const banks = [
    ["BDO", "bdo.png"],
    ["BPI", "bpi.png"],
    ["LandBank", "landbank.png"],
    ["Metrobank", "metrobank.png"],
    ["RCBC", "rcbc.png"],
    ["Security Bank", "security bank.png"],
  ];
  return (
    <div className={s.connectionOptions}>
      <div className={s.miniHeader}>
        <strong>Connect</strong>
        <span>Philippines</span>
      </div>
      <div className={s.connectionGrid}>
        {banks.map(([name, file]) => (
          <div key={name}>
            <img
              src={`/assets/banks/philippines/${file}`}
              width="42"
              height="42"
              alt=""
            />
            <span>{name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
function TransactionMoment() {
  return (
    <div className={s.transactionMoment}>
      <img
        src="/figma-icons/categories/food-dining.svg"
        width={44}
        height={44}
        alt=""
      />
      <div>
        <strong>Coffee at Starbucks</strong>
        <span>Food & dining · BPI</span>
      </div>
      <b>−₱190.00</b>
    </div>
  );
}
const spending = [
  {
    name: "Food & dining",
    amount: "₱6,000",
    percent: 40,
    color: "#04acc0",
    icon: "food-dining",
  },
  {
    name: "Groceries",
    amount: "₱4,500",
    percent: 30,
    color: "#68d4b6",
    icon: "groceries",
  },
  {
    name: "Transport",
    amount: "₱3,000",
    percent: 20,
    color: "#8b72bb",
    icon: "transport",
  },
  {
    name: "Shopping",
    amount: "₱1,500",
    percent: 10,
    color: "#e6af55",
    icon: "shopping",
  },
];
function SpendingStory() {
  const [selected, setSelected] = useState<string | null>(null);
  const current = spending.find((item) => item.name === selected);
  return (
    <div className={s.spendingStory}>
      <div className={s.reportCard}>
        <div className={s.miniHeader}>
          <span>Where it went</span>
          <span>October</span>
        </div>
        <div
          className={s.donut}
          role="img"
          aria-label={
            current
              ? `${current.name}: ${current.amount}, ${current.percent}% of the 15,000 peso sample spending.`
              : "Sample October spending: 15,000 pesos. Food and dining 40%, groceries 30%, transport 20%, shopping 10%."
          }
        >
          <svg viewBox="0 0 240 240" aria-hidden="true">
            <circle className={s.donutTrack} cx="120" cy="120" r="94" />
            {spending.map((item, i) => (
              <circle
                key={item.name}
                cx="120"
                cy="120"
                r="94"
                pathLength="100"
                stroke={item.color}
                data-muted={selected !== null && selected !== item.name}
                strokeDasharray={`${item.percent - 0.8} ${100 - item.percent + 0.8}`}
                strokeDashoffset={
                  -spending.slice(0, i).reduce((n, x) => n + x.percent, 0)
                }
              />
            ))}
          </svg>
          <div>
            <span>{current ? current.name : "Total spending"}</span>
            <strong>{current ? current.amount : "₱15,000"}</strong>
          </div>
        </div>
        <div className={s.spendingRows}>
          {spending.map((item) => (
            <button
              key={item.name}
              type="button"
              aria-pressed={selected === item.name}
              aria-label={`Explore ${item.name}, ${item.amount}, ${item.percent}% of spending. Select again to see total spending.`}
              onClick={() =>
                setSelected(selected === item.name ? null : item.name)
              }
            >
              <img
                src={`/figma-icons/categories/${item.icon}.svg`}
                alt=""
                width={26}
                height={26}
              />
              <span>{item.name}</span>
              <strong>{item.amount}</strong>
              <i style={{ background: item.color }} />
            </button>
          ))}
        </div>
      </div>
      <div className={s.reportMascot}>
        <Mascot pose="reports" size={150} />
      </div>
    </div>
  );
}
function Conversation() {
  return (
    <div className={s.conversation}>
      <div className={s.chatTop}>
        <Mascot pose="compact" size={36} />
        <strong>Ask Clover</strong>
      </div>
      <div className={s.question}>Why did I spend more on food?</div>
      <div className={s.answer}>
        <div className={s.cloverSpeaker}>
          <Mascot pose="compact" size={28} />
          <strong>Clover</strong>
        </div>
        <p>
          Dining out is ₱1,500 higher than last month. Your grocery spending
          stayed the same.
        </p>
        <div
          className={s.chatChart}
          role="img"
          aria-label="Food and dining spending increased from 4,500 pesos in September to 6,000 pesos in October."
        >
          <div>
            <span>Sep</span>
            <i />
            <strong>₱4,500</strong>
          </div>
          <div>
            <span>Oct</span>
            <i />
            <strong>₱6,000</strong>
          </div>
        </div>
      </div>
      <div className={s.chatInput}>
        <span>Ask about your money…</span>
        <Icon />
      </div>
    </div>
  );
}
function GoalMoment() {
  return (
    <div className={s.goalMoment}>
      <div className={s.goalTitle}>
        <Mascot pose="savings" size={70} />
        <div>
          <span>A little peace of mind</span>
          <strong>Emergency fund</strong>
        </div>
      </div>
      <div className={s.goalAmount}>
        <strong>₱45,000</strong>
        <span>of ₱60,000</span>
      </div>
      <div className={s.goalTrack}>
        <i />
      </div>
      <div className={s.goalFooter}>
        <span>75% of the way there</span>
        <Icon kind="check" />
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
          <a href="#one-picture">Discover Clover</a>
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
          <div className={s.storyGrid}>
            <div className={s.copy}>
              <Heading
                hero
                text="Connect supported banks, upload statements and receipts, or add details manually. Understand your money and take one clearer step at a time."
              >
                Months of finances.
                <br />
                <em>Organized in minutes.</em>
              </Heading>
              <Action />
            </div>
            <div className={`${s.stage} ${s.heroStage}`}>
              <div className={s.heroPhone}>
                <AppScreen page="accounts" eager />
              </div>
              <div className={s.heroReceipt}>
                <Receipt small />
              </div>
              <div className={s.heroTransaction}>
                <TransactionMoment />
              </div>
              <div className={s.heroMascot}>
                <Mascot pose="welcome" size={124} />
              </div>
            </div>
          </div>
          <a
            className={s.scrollArrow}
            href="#one-picture"
            aria-label="Explore Clover"
          >
            <Icon kind="chevron" />
          </a>
        </ScrollScene>

        <ScrollScene id="one-picture" className={s.journey}>
          <div className={s.journeyWorld}>
            <PurchaseThroughline />
            <article className={s.journeyBeat} data-story-act>
              <div className={s.journeyCopy}>
                <Heading text="Connect supported banks. Upload statements, receipts, screenshots, or spreadsheets. Choose what works for you.">
                  Start with
                  <br />
                  <em>what suits you.</em>
                </Heading>
              </div>
              <div
                className={`${s.journeyArt} ${s.journeyRecords}`}
                data-story-art
              >
                <div className={s.journeyReceipt}>
                  <Receipt />
                </div>
                <ConnectionOptions />
                <div className={s.journeyTransaction}>
                  <TransactionMoment />
                </div>
              </div>
            </article>
            <article className={s.journeyBeat} data-story-act>
              <div className={s.journeyCopy}>
                <Heading text="Your financial records are private, reviewable, and traceable. Edit, export, or delete your data through your account.">
                  Your financial data stays
                  <br />
                  <em>under your control.</em>
                </Heading>
              </div>
              <div
                className={`${s.journeyArt} ${s.journeyPrivacy}`}
                data-story-art
              >
                <div className={s.privacyPhoto}>
                  <StoryPhoto
                    desktop="landing-story-v3/07-private-review"
                    mobile="landing-story-v3/07-private-review-mobile"
                    alt="Reviewing personal financial records at home."
                  />
                </div>
                <div className={s.controlCard}>
                  <span className={s.controlSeal}>
                    <Icon kind="lock" />
                  </span>
                  <strong>Your records. Your choice.</strong>
                  <div>
                    <Icon kind="edit" />
                    <span>Review and edit</span>
                    <Icon kind="check" />
                  </div>
                  <div>
                    <Icon kind="export" />
                    <span>Export your data</span>
                    <Icon kind="check" />
                  </div>
                  <div>
                    <Icon kind="lock" />
                    <span>Private to you</span>
                    <Icon kind="check" />
                  </div>
                </div>
              </div>
            </article>
            <article className={s.journeyBeat} data-story-act>
              <div className={s.journeyCopy}>
                <Heading text="Your financial life in one view. Track accounts, balances, recurring obligations, investments, and trends across your accounts.">
                  Understand your finances.
                  <br />
                  <em>Build better habits.</em>
                </Heading>
              </div>
              <div
                className={`${s.journeyArt} ${s.journeyClarity}`}
                data-story-art
              >
                <SpendingStory />
                <div className={s.insightPhone}>
                  <AppScreen page="transactions" />
                </div>
              </div>
            </article>
            <article className={s.journeyBeat} data-story-act>
              <div className={s.journeyCopy}>
                <Heading text="Ask what changed this month, what you can safely spend, or get help creating a budget and a goal.">
                  Ask what your money
                  <br />
                  can make <em>possible.</em>
                </Heading>
              </div>
              <div
                className={`${s.journeyArt} ${s.journeyConversation}`}
                data-story-art
              >
                <Conversation />
                <div className={s.journeyMascot}>
                  <Mascot pose="chat" size={150} />
                </div>
              </div>
            </article>
            <article className={s.journeyBeat} data-story-act>
              <div className={s.journeyCopy}>
                <Heading text="Split expenses with friends on Split Bills. Manage household expenses with a partner on Circles.">
                  Manage money together.
                  <br />
                  <em>With less effort.</em>
                </Heading>
              </div>
              <div
                className={`${s.journeyArt} ${s.journeyShared}`}
                data-story-art
              >
                <div className={s.sharedPhoto}>
                  <StoryPhoto
                    desktop="landing-story-v3/05-plan"
                    mobile="landing-story-v3/05-plan-mobile"
                    alt="Friends making plans together over a laptop."
                  />
                </div>
                <div className={s.sharedCard}>
                  <div className={s.miniHeader}>
                    <strong>Weekend with friends</strong>
                    <span>Split Bills</span>
                  </div>
                  <strong className={s.sharedTotal}>₱1,200.00</strong>
                  <div className={s.sharedMember}>
                    <span>A</span>
                    <div>
                      Alex<small>Paid with GCash</small>
                    </div>
                    <img
                      src="/assets/banks/philippines/gcash.png"
                      width="32"
                      height="32"
                      alt="GCash"
                    />
                    <strong>₱400</strong>
                  </div>
                  <div className={s.sharedMember}>
                    <span>J</span>
                    <div>
                      Jamie<small>Paid with Maya</small>
                    </div>
                    <img
                      src="/assets/banks/philippines/maya.png"
                      width="32"
                      height="32"
                      alt="Maya"
                    />
                    <strong>₱400</strong>
                  </div>
                  <div className={s.sharedMember}>
                    <span>S</span>
                    <div>
                      Sam<small>Still to settle</small>
                    </div>
                    <strong>₱400</strong>
                  </div>
                </div>
              </div>
            </article>
            <article className={s.journeyBeat} data-story-act>
              <div className={s.journeyCopy}>
                <Heading text="A little more peace of mind. A plan you can grow. Less time untangling your money, and more time living your life.">
                  Feel clearer about your money.
                  <br />
                  <em>More confident about what’s next.</em>
                </Heading>
              </div>
              <div
                className={`${s.journeyArt} ${s.journeyLife}`}
                data-story-art
              >
                <div className={s.lifePhoto}>
                  <StoryPhoto
                    desktop="landing-story-v3/07-records-away"
                    mobile="landing-story-v3/07-records-away-mobile"
                    alt="Putting the paperwork away and closing the laptop at home."
                  />
                </div>
                <GoalMoment />
              </div>
            </article>
          </div>
        </ScrollScene>

        <section id="plans" className={s.plans} data-scroll-scene>
          <Heading text="Start free. Choose Plus or Pro when your finances need a little more room.">
            Do more as your finances
            <br />
            <em>get more complex.</em>
          </Heading>
          <Plans initialMarket={initialMarket} />
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
          Product screens use fictional data. Other visuals are illustrative. ©{" "}
          {new Date().getFullYear()} Clover.
        </small>
      </footer>
    </div>
  );
}
