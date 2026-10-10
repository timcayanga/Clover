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
        src={`/assets/landing-showcase/${page}-production-20261009.webp`}
        alt={
          page === "accounts"
            ? "Clover Accounts showing bank, wallet and investment balances with sample data."
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
function DepthField({ name }: { name: string }) {
  return (
    <div className={s.depthField} aria-hidden="true">
      <svg viewBox="0 0 640 600" fill="none">
        <defs>
          <linearGradient
            id={`ribbon-${name}`}
            x1="80"
            y1="100"
            x2="540"
            y2="500"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#aaf4dc" />
            <stop offset=".45" stopColor="#00adc0" />
            <stop offset="1" stopColor="#b4efe2" />
          </linearGradient>
        </defs>
        <path
          d="M90 460C-40 190 240 30 450 120S660 390 410 470 160 390 280 240"
          stroke="#058c9e"
          strokeOpacity=".10"
          strokeWidth="40"
          transform="translate(0 12)"
        />
        <path
          d="M90 460C-40 190 240 30 450 120S660 390 410 470 160 390 280 240"
          stroke={`url(#ribbon-${name})`}
          strokeWidth="32"
        />
        <path
          d="M90 460C-40 190 240 30 450 120S660 390 410 470 160 390 280 240"
          stroke="white"
          strokeOpacity=".55"
          strokeWidth="2"
          transform="translate(-5 -8)"
        />
      </svg>
      <i className={s.depthPearl} />
      <i className={s.depthPearlSmall} />
    </div>
  );
}

const sampleAccounts = [
  { name: "BPI", type: "Bank", amount: 124861, logo: "bpi", color: "#b9152e" },
  {
    name: "GCash",
    type: "Wallet",
    amount: 3600,
    logo: "gcash",
    color: "#1677dd",
  },
  {
    name: "Maya",
    type: "Wallet",
    amount: 36500,
    logo: "maya",
    color: "#117549",
  },
  {
    name: "UnionBank",
    type: "Bank",
    amount: 120000,
    logo: "unionbank",
    color: "#da6b12",
  },
];
const sampleMoney = (amount: number) => `₱${amount.toLocaleString("en-PH")}`;
function MoneySculpture() {
  const [selected, setSelected] = useState<number | null>(null);
  const current = selected === null ? null : sampleAccounts[selected];
  return (
    <div className={s.moneySculpture}>
      <DepthField name="money" />
      <div className={s.moneyPlatform} aria-hidden="true" />
      {sampleAccounts.map((account, index) => (
        <button
          key={account.name}
          className={s.bankTile}
          style={
            { "--tile": index, "--bank-color": account.color } as CSSProperties
          }
          data-position={index}
          aria-pressed={selected === index}
          aria-label={`Explore ${account.name}, ${account.type}, ${sampleMoney(account.amount)}. Select again to see all accounts.`}
          onClick={() => setSelected(selected === index ? null : index)}
        >
          <img
            src={`/assets/landing-showcase/${account.logo}.webp`}
            width={40}
            height={40}
            alt=""
            loading="lazy"
          />
          <span>
            <strong>{account.name}</strong>
            <small>{account.type}</small>
          </span>
          <b>{sampleMoney(account.amount)}</b>
          <svg viewBox="0 0 100 22" aria-hidden="true">
            <path
              d="M0 20 15 17 30 19 45 9 60 11 75 3 100 1"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
          </svg>
        </button>
      ))}
      <div className={s.moneyCenter} aria-live="polite" aria-atomic="true">
        <img src="/clover-mark.svg" width={26} height={26} alt="" />
        <span>
          {current ? `${current.name} balance` : "Your money together"}
        </span>
        <strong>
          {sampleMoney(
            current
              ? current.amount
              : sampleAccounts.reduce(
                  (sum, account) => sum + account.amount,
                  0,
                ),
          )}
        </strong>
        <small>Sample balances · PHP</small>
      </div>
    </div>
  );
}

function Receipt({ small = false }: { small?: boolean }) {
  return (
    <img
      className={s.realReceipt}
      src="/assets/landing-showcase/starbucks-receipt-realistic-20261010.webp"
      width={520}
      height={946}
      alt=""
      loading={small ? "eager" : "lazy"}
      decoding="async"
    />
  );
}

const everydayPurchases = [
  {
    merchant: "Jollibee",
    item: "Lunch",
    amount: "₱250.00",
    icon: "food-dining",
    color: "#be1830",
  },
  {
    merchant: "Puregold",
    item: "Groceries",
    amount: "₱1,250.00",
    icon: "groceries",
    color: "#187942",
  },
  {
    merchant: "McDonald’s",
    item: "Breakfast",
    amount: "₱180.00",
    icon: "food-dining",
    color: "#b9430b",
  },
];
function EverydayRecords() {
  return (
    <div
      className={s.everydayRecords}
      aria-label="Illustrative everyday purchases"
    >
      {everydayPurchases.map((purchase, index) => (
        <div
          className={s.everydayRecord}
          key={purchase.merchant}
          style={
            {
              "--record-index": index,
              "--merchant-color": purchase.color,
            } as CSSProperties
          }
        >
          <img
            src={`/figma-icons/categories/${purchase.icon}.svg`}
            width={32}
            height={32}
            alt=""
          />
          <div>
            <strong>{purchase.merchant}</strong>
            <span>{purchase.item}</span>
          </div>
          <b>−{purchase.amount}</b>
        </div>
      ))}
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
          aria-label="Sample October spending: 15,000 pesos. Food and dining 40%, groceries 30%, transport 20%, shopping 10%."
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
                style={
                  {
                    "--ring-x": `${[22, -25, -22, 22][i]}px`,
                    "--ring-y": `${[-22, -22, 22, 22][i]}px`,
                  } as CSSProperties
                }
                strokeDasharray={`${item.percent - 0.8} ${100 - item.percent + 0.8}`}
                strokeDashoffset={
                  -spending.slice(0, i).reduce((n, x) => n + x.percent, 0)
                }
              />
            ))}
          </svg>
          <div>
            <span>Total spending</span>
            <strong>₱15,000</strong>
          </div>
        </div>
        <div className={s.spendingRows}>
          {spending.map((item) => (
            <div key={item.name}>
              <img
                src={`/figma-icons/categories/${item.icon}.svg`}
                alt=""
                width={26}
                height={26}
              />
              <span>{item.name}</span>
              <strong>{item.amount}</strong>
              <i style={{ background: item.color }} />
            </div>
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
                text="Your banks, receipts, and everyday spending. A clearer picture of your money, with Clover."
              >
                Months of finances.
                <br />
                <em>Organized in minutes.</em>
              </Heading>
              <Action />
            </div>
            <div className={`${s.stage} ${s.heroStage}`}>
              <DepthField name="hero" />
              <div className={s.orbit} aria-hidden="true" />
              <div className={s.orbitInner} aria-hidden="true" />
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

        <ScrollScene id="one-picture" className={s.togetherScene}>
          <div className={`${s.storyGrid} ${s.reverse}`}>
            <div className={s.copy}>
              <Heading text="Across your banks and wallets, see what you have. One clearer picture, without the mental juggling.">
                Many places.
                <br />
                <em>One picture.</em>
              </Heading>
            </div>
            <div className={`${s.stage} ${s.moneyStage}`}>
              <MoneySculpture />
            </div>
          </div>
        </ScrollScene>

        <ScrollScene id="breathing-room" className={s.evening}>
          <div className={s.storyGrid}>
            <div className={s.copy}>
              <Heading text="Bring the records you already have. Clover finds and organizes the transactions, ready for your confirmation.">
                Less sorting.
                <br />
                <em>More living.</em>
              </Heading>
            </div>
            <div className={`${s.stage} ${s.importStage}`}>
              <DepthField name="import" />
              <div className={s.paperStatement} aria-hidden="true">
                <img
                  src="/assets/landing-showcase/bpi.webp"
                  width={36}
                  height={36}
                  alt=""
                />
                <strong>Account statement</strong>
                <span>September 2026</span>
                <div />
                <div />
                <div />
                <div />
              </div>
              <EverydayRecords />
              <div className={s.importReceipt}>
                <Receipt />
              </div>
              <div className={s.importPhone}>
                <AppScreen page="transactions" />
              </div>
              <div className={s.importTransaction}>
                <TransactionMoment />
              </div>
              <div className={s.scanLine} aria-hidden="true" />
            </div>
          </div>
        </ScrollScene>

        <ScrollScene id="a-little-clarity" className={s.clarity}>
          <div className={`${s.storyGrid} ${s.reverse}`}>
            <div className={s.copy}>
              <Heading text="The little purchases. The regular bills. See the patterns behind your spending, and understand what changed.">
                Less wondering.
                <br />
                <em>More knowing.</em>
              </Heading>
            </div>
            <div className={`${s.stage} ${s.reportStage}`}>
              <DepthField name="report" />
              <SpendingStory />
            </div>
          </div>
        </ScrollScene>

        <ScrollScene id="looking-forward" className={s.ask}>
          <div className={s.storyGrid}>
            <div className={s.copy}>
              <Heading text="Ask the question on your mind. Clover brings your own records into the conversation, so the numbers make sense.">
                Your money.
                <br />
                <em>Let’s talk about it.</em>
              </Heading>
            </div>
            <div className={`${s.stage} ${s.chatStage}`}>
              <DepthField name="chat" />
              <div className={s.chatHalo} aria-hidden="true" />
              <Conversation />
              <div className={s.chatMascot}>
                <Mascot pose="chat" size={190} />
              </div>
            </div>
          </div>
        </ScrollScene>

        <ScrollScene id="more-living" className={s.living}>
          <div className={s.storyGrid}>
            <div className={s.copy}>
              <Heading text="A buffer for the unexpected. A little more freedom every month. Give your plans a place to grow.">
                Make room.
                <br />
                <em>For what matters.</em>
              </Heading>
              <Action>Start my story</Action>
            </div>
            <div className={`${s.stage} ${s.lifeStage}`}>
              <div className={s.lifePhoto}>
                <StoryPhoto
                  desktop="landing-story-v3/07-records-away"
                  mobile="landing-story-v3/07-records-away-mobile"
                  alt="Putting the paperwork away and closing the laptop at home."
                />
              </div>
              <GoalMoment />
            </div>
          </div>
        </ScrollScene>

        <section id="plans" className={s.plans} data-scroll-scene>
          <Heading text="Start free. Choose Plus or Pro when your finances need a little more room.">
            At your pace.
            <br />
            <em>At every stage.</em>
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
