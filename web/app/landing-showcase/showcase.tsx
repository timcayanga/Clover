"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { planSwipeDirection, sampleSplitShares } from "./showcase-interactions";
import { useShowcaseMotion } from "./use-showcase-motion";
import { SwitchOfferNotice } from "@/components/switch-campaign";
import {
  plannedPremiumPrices,
  plannedProPrices,
  type PricingMarket,
} from "@/lib/public-plan-comparison";
import s from "./showcase.module.css";
import { PublicFooter } from "@/components/public-footer";
import { StoreAvailability } from "@/components/app-store-links";
import { JourneyHeader, JourneyActions } from "@/app/landing-preview/landing-journey";

export function Icon({
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
export function Brand() {
  return (
    <span className={s.brand}>
      <img src="/clover-mark.svg" width="28" height="28" alt="" />
      <img src="/clover-name-teal.svg" width="100" height="28" alt="Clover" />
    </span>
  );
}
export function Action({
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
export function Mascot({ pose, size = 160 }: { pose: string; size?: number }) {
  return (
    <img
      className={s.mascot}
      src={pose === "welcome" ? "/assets/landing-showcase/mascot-welcome-hd-20261018.webp" : `/assets/mascots/velvet-${pose}.webp`}
      width={size}
      height={size}
      alt=""
      loading="lazy"
    />
  );
}
export function Heading({
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
export function ScrollScene({
  id,
  className,
  children,
  flow = false,
}: {
  id: string;
  className: string;
  children: ReactNode;
  flow?: boolean;
}) {
  return (
    <section id={id} className={`${s.scene} ${className}`} data-scroll-scene data-scroll-flow={flow || undefined}>
      <div className={s.pin}>{children}</div>
    </section>
  );
}

// Reuse the people and locations from Clover's production story. These are
// marketing images, not screenshots or customer records.
export function StoryPhoto({
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
export function AppScreen({
  page,
  eager = false,
}: {
  page: "accounts" | "transactions";
  eager?: boolean;
}) {
  const capture = `/assets/landing-showcase/${page}-current-20261019.webp`;
  return (
    <div className={s.phone}>
      <div className={s.phoneDisplay}>
        <div className={s.phoneStatus} aria-hidden="true">
          <b>9:41</b>
          <span className={s.phoneCamera} />
          <span className={s.phoneIndicators}>
            <svg viewBox="0 0 18 12">
              <path
                d="M1 11V8h2v3M5 11V6h2v5M9 11V3h2v8M13 11V1h2v10"
                stroke="currentColor"
                strokeWidth="1.5"
              />
            </svg>
            <svg viewBox="0 0 16 12">
              <path
                d="M1 3q7-5 14 0M4 6q4-3 8 0M7 9q1-1 2 0"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <i />
          </span>
        </div>
        <img
          src={capture}
          className={page === "accounts" ? s.accountCapture : s.transactionCapture}
          alt={
            page === "accounts"
              ? "Clover account lists with BPI, UnionBank, BDO, Maya, GCash, GoTrade and ATRAM, using fictional balances."
              : "Clover Transactions showing merchant logos, category fallbacks, dates, amounts and a sample profile photo."
          }
          width={402}
          height={page === "accounts" ? 872 : 820}
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : "auto"}
          decoding="async"
        />
        <span className={s.phoneHome} aria-hidden="true" />
      </div>
    </div>
  );
}
export function Receipt({ small = false }: { small?: boolean }) {
  return (
    <div
      className={`${s.receipt} ${small ? s.smallReceipt : ""}`}
      aria-hidden="true"
    >
      <img
        src="/assets/logo-library/company logos/food/starbucks/icon.png"
        className={s.receiptLogo}
        width={38}
        height={38}
        alt=""
      />
      <strong>STARBUCKS</strong>
      <span>October 5, 2026 · 9:41 AM</span>
      <div>
        <span>1 × Grande Mocha Frappuccino</span>
        <span>₱120.00</span>
      </div>
      <div><span>1 × Sausage Roll</span><span>₱70.00</span></div>
      <div className={s.receiptNote}><span>Payment</span><span>BPI card</span></div>
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
export function PurchaseThroughline() {
  return (
    <div className={s.purchaseThroughline} data-purchase-throughline aria-hidden="true">
      <div className={s.purchasePaper}>
        <div className={s.purchaseReceiptHead}>
          <img src="/assets/logo-library/company logos/food/starbucks/icon.png" width="36" height="36" alt="" /> STARBUCKS<small>October 5, 2026 · 9:41 AM</small>
        </div>
        <div className={s.purchaseIdentity}>
          <img
            src="/assets/logo-library/company logos/food/starbucks/icon.png"
            width={44}
            height={44}
            alt=""
          />
          <div>
            <strong>Coffee at Starbucks</strong>
            <small>Food & dining · BPI</small>
          </div>
          <b>−₱190.00</b>
        </div>
        <div className={s.purchaseReceiptTail}>
          <span>Grande Mocha Frappuccino · Sausage Roll</span>
          <span>Total paid</span>
          <div className={s.barcode} />
        </div>
      </div>
    </div>
  );
}

export function ConnectionOptions() {
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
export function TransactionMoment() {
  return (
    <div className={s.transactionMoment}>
      <img
        src="/assets/logo-library/company logos/food/starbucks/icon.png"
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
export function SpendingStory() {
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
          data-receipt-destination
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
            {current ? <span>{current.name}</span> : null}
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
const sampleQuestions = [
  ["🍽️", "Ask why food spending is up"],
  ["📊", "Show my spending this month"],
  ["🏦", "Add my BPI savings account"],
  ["🧾", "Add lunch, ₱500 from BPI"],
  ["✈️", "Help budget for my Japan trip"],
] as const;

function AnimatedQuestion() {
  const root = useRef<HTMLSpanElement>(null);
  const [prompt, setPrompt] = useState({text: "", emoji: "🍽️" as string});
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    let visible = false, timer: ReturnType<typeof setTimeout> | undefined;
    let index = 0, letters = 0, deleting = false;
    const stop = () => { clearTimeout(timer); timer = undefined; };
    const tick = () => {
      const [emoji, text] = sampleQuestions[index];
      letters += deleting ? -1 : 1;
      setPrompt({emoji, text: Array.from(text).slice(0, letters).join("")});
      let delay = deleting ? 10 : 24;
      if (!deleting && letters === Array.from(text).length) { deleting = true; delay = 1200; }
      else if (deleting && letters === 0) { deleting = false; index = (index + 1) % sampleQuestions.length; delay = 120; }
      timer = setTimeout(tick, delay);
    };
    const sync = () => {
      stop();
      if (media.matches) { setPrompt({emoji:sampleQuestions[0][0],text:sampleQuestions[0][1]}); return; }
      if (visible && !document.hidden) timer = setTimeout(tick, 200);
    };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
    if (root.current) observer.observe(root.current);
    document.addEventListener("visibilitychange", sync);
    media.addEventListener("change", sync);
    return () => { stop(); observer.disconnect(); document.removeEventListener("visibilitychange",sync); media.removeEventListener("change",sync); };
  }, []);
  return <span ref={root} className={s.animatedQuestion} aria-label="Ask Clover about spending, reports, accounts, transactions, and budgets"><span aria-hidden="true">{prompt.emoji}</span><span aria-hidden="true">{prompt.text}<i className={s.typingCursor} /></span></span>;
}

export function Conversation() {
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
        <AnimatedQuestion />
        <Icon />
      </div>
    </div>
  );
}
export function GoalMoment({ compact = false }: { compact?: boolean } = {}) {
  return (
    <div className={`${s.goalMoment} ${compact ? s.goalCompact : ""}`}>
      <div className={s.goalTitle}>
        <Mascot pose="savings" size={70} />
        <div>
          <span>Savings goal</span>
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

export { StoreAvailability } from "@/components/app-store-links";

export function Plans({ initialMarket }: { initialMarket: PricingMarket }) {
  const [annual, setAnnual] = useState(true);
  const [active, setActive] = useState(0);
  const swipe = useRef<{ id: number; x: number; y: number; horizontal: boolean } | null>(null);
  const suppressClickUntil = useRef(0);
  const plans = [
    {
      name: "Pro",
      price: plannedPremiumPrices(initialMarket),
      features: [
        "40 financial accounts",
        "5 linked bank accounts",
        "Higher limits for Ask Clover",
      ],
    },
    {
      name: "Plus",
      price: plannedProPrices(initialMarket),
      features: [
        "20 financial accounts",
        "2 linked bank accounts",
        "Advanced reports & Ask Clover",
      ],
    },
    {
      name: "Free",
      price: null,
      features: [
        "Statement & receipt uploads",
        "10 financial accounts",
        "Essential reports & Ask Clover",
      ],
    },
  ];
  const move = (direction: number) =>
    setActive((value) => (value + direction + plans.length) % plans.length);
  return (
    <div className={s.pricing}>
      <div className={s.priceControls}>
        <div role="group" aria-label="Billing period">
          <button
            type="button"
            aria-pressed={annual}
            onClick={() => setAnnual(true)}
          >
            Yearly
          </button>
          <button
            type="button"
            aria-pressed={!annual}
            onClick={() => setAnnual(false)}
          >
            Monthly
          </button>
        </div>
      </div>
      <div
        className={s.planCarousel}
        role="region"
        aria-roledescription="carousel"
        aria-label="Clover plans"
        tabIndex={0}
        onPointerDown={(event) => {
          if (!event.isPrimary || event.pointerType === "mouse") return;
          swipe.current = { id:event.pointerId, x:event.clientX, y:event.clientY, horizontal:false };
        }}
        onPointerMove={(event) => {
          const start = swipe.current;
          if (!start || start.id !== event.pointerId) return;
          const dx = event.clientX - start.x;
          const dy = event.clientY - start.y;
          if (!start.horizontal && Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { swipe.current = null; return; }
          if (!start.horizontal && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.2) {
            start.horizontal = true;
            event.currentTarget.setPointerCapture(event.pointerId);
          }
          if (start.horizontal) {
            event.currentTarget.dataset.dragging = "true";
            event.currentTarget.style.setProperty("--swipe-x", `${Math.max(-180,Math.min(180,dx))}px`);
          }
        }}
        onPointerUp={(event) => {
          const start = swipe.current;
          if (!start || start.id !== event.pointerId) return;
          if (start.horizontal) {
            const direction = planSwipeDirection(event.clientX-start.x, event.clientY-start.y);
            if (direction) move(direction);
            suppressClickUntil.current = performance.now() + 350;
          }
          swipe.current = null;
          event.currentTarget.dataset.dragging = "false";
          event.currentTarget.style.setProperty("--swipe-x", "0px");
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={(event) => {
          swipe.current = null;
          event.currentTarget.dataset.dragging = "false";
          event.currentTarget.style.setProperty("--swipe-x", "0px");
        }}
        onClickCapture={(event) => {
          if (performance.now() < suppressClickUntil.current) { event.preventDefault(); event.stopPropagation(); }
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            move(-1);
          }
          if (event.key === "ArrowRight") {
            event.preventDefault();
            move(1);
          }
        }}
      >
        <div className={s.planCards}>
          {plans.map((plan, i) => {
            const offset = (i - active + plans.length) % plans.length;
            const position = offset === 2 ? -1 : offset;
            return (
              <article
                key={plan.name}
                className={s.planCard}
                data-tier={plan.name}
                data-plan-active={i === active}
                aria-hidden={i !== active}
                inert={i !== active}
                style={
                  {
                    "--card": i,
                    "--position": position,
                    "--distance": Math.abs(position),
                  } as CSSProperties
                }
              >
                <h3>{plan.name}</h3>
                <div className={s.price}>
                  <strong>
                    {plan.price?.[annual ? "annual" : "monthly"] ?? "Free"}
                  </strong>
                  {plan.price ? (
                    <span>/ {annual ? "year" : "month"}</span>
                  ) : (
                    <span>No subscription needed</span>
                  )}
                </div>
                <ul>
                  {plan.features.map((feature) => (
                    <li key={feature}>
                      <Icon kind="check" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Action href={plan.name === "Free" ? "/sign-up" : "/pricing"}>
                  {plan.name === "Free" ? "Start free" : `Explore ${plan.name}`}
                </Action>
              </article>
            );
          })}
        </div>
        <div className={s.carouselControls}>
          <button
            type="button"
            aria-label="Previous plan"
            onClick={() => move(-1)}
          >
            <Icon kind="back" />
          </button>
          <span role="status" aria-live="polite">
            {plans[active].name}{" "}
            <small>
              {active + 1} / {plans.length}
            </small>
          </span>
          <button type="button" aria-label="Next plan" onClick={() => move(1)}>
            <Icon />
          </button>
        </div>
      </div>
      <Link className={s.compare} href="/pricing">
        Compare all features <Icon />
      </Link>
      <div className={s.switchBanner}><SwitchOfferNotice compact /></div>
    </div>
  );
}

export function ControlCard() {
  return (
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
  );
}

export function CircleCard() {
  return (
    <div className={s.circleCard}>
      <div className={s.miniHeader}>
        <strong>
          <img
            src="/assets/3d icons/navigation/figma-v7/circles.webp"
            width="28"
            height="28"
            alt=""
            loading="lazy"
          />
          Japan Trip
        </strong>
        <span>Circles</span>
      </div>
      <div className={s.circlePeople}>
        <Person face={0} name="Alex" /><Person face={1} name="Jamie" /><Person face={2} name="Sam" />
      </div>
      <div>
        <span>Travel budget</span>
        <b>₱38,500 / ₱55,000</b>
      </div>
      <div className={s.circleTrack}>
        <i />
      </div>
      <small className={s.tripDetails}>🇯🇵 Tokyo & Kyoto · 7 days</small>
    </div>
  );
}

// Crop the actual people from production's closing group photo in CSS;
// no illustrated profile defaults or new synthetic identities.
function Person({ face, name }: { face: number; name: string }) {
  const positions = ["75.83% 25.33%", "58.00% 26.00%", "64.16% 27.33%"];
  return <span className={s.person} role="img" aria-label={name} style={{ backgroundPosition: positions[face] ?? positions[0] }} />;
}

export function SplitCard({ compact = false }: { compact?: boolean } = {}) {
  const [assignments, setAssignments] = useState([[true,true,true],[true,true,false],[false,false,true]]);
  const names = ["Alex", "Jamie", "Sam"];
  const items = [{name:"Pasta",amount:45000},{name:"Chicken",amount:45000},{name:"Coffee",amount:30000}];
  const totals = sampleSplitShares(items.map(item=>item.amount), assignments);
  const money = (cents:number) => `₱${(cents/100).toLocaleString("en-PH",{maximumFractionDigits:2})}`;
  const bill = <>
    <div className={s.miniHeader}><strong>Lunch with friends</strong><span>Split Bills</span></div>
    <strong className={s.sharedTotal}>₱1,200.00</strong>
    <table className={s.splitMatrix}>
      <caption>Choose who pays for each item</caption>
      <thead><tr><th scope="col">Item</th>{names.map((name,i)=><th key={name} scope="col"><Person face={i} name={name}/><span>{name}</span></th>)}</tr></thead>
      <tbody>{items.map((item,row)=><tr key={item.name}><th scope="row">{item.name}<small>{money(item.amount)}</small></th>{names.map((name,col)=><td key={name}><input type="checkbox" aria-label={`${name} pays for ${item.name.toLowerCase()}`} checked={assignments[row][col]} disabled={assignments[row][col] && assignments[row].filter(Boolean).length===1} onChange={()=>setAssignments(current=>current.map((values,r)=>r===row?values.map((value,c)=>c===col?!value:value):values))}/></td>)}</tr>)}</tbody>
      <tfoot><tr><th scope="row">To pay</th>{totals.map((total,i)=><td key={names[i]}>{money(total)}</td>)}</tr></tfoot>
    </table>
  </>;
  if (compact) return <div className={s.sharedCard}>{bill}</div>;
  return <div className={s.splitExample}>
    <div className={s.sharedCard}>{bill}</div>
    <div className={s.requestBridge}><svg viewBox="0 0 24 32" fill="none" aria-hidden="true"><path d="M12 1v27m-7-7 7 7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg><span>Request payment through Clover</span></div>
    <div className={s.gcashRequest}>
      <div className={s.gcashRequestHeading}><img src="/assets/banks/philippines/gcash.png" alt="" width={26} height={26}/><strong>GCash</strong><span>Payment request</span></div>
      <div className={s.gcashRequestBody}><div><strong>Hi friends! 👋</strong><p>Here’s our lunch split:</p><ul>{names.map((name,i)=><li key={name}><span>{name}</span><b>{money(totals[i])}</b></li>)}</ul></div><figure><div className={s.qrIdentity}><strong>AL•• ••• RE••</strong><span>09•• ••• 1234</span></div><div className={s.qrCode}><img src="/assets/landing-showcase/gcash-sample-qr.svg" alt="Sample black QR code" width={120} height={120}/><img className={s.qrPhMark} src="/assets/landing-showcase/qr-ph-symbol.svg" alt="QR Ph" width={28} height={28}/></div><figcaption>Sample QR</figcaption></figure></div>
      <div className={s.requestChannels}><span>Send via</span><span role="img" aria-label="Messenger" title="Messenger"><svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="showcase-messenger" x2="0" y2="1"><stop stopColor="#00b2ff"/><stop offset="1" stopColor="#a033ff"/></linearGradient></defs><path fill="url(#showcase-messenger)" d="M12 2C6.3 2 2 6.1 2 11.5c0 3.1 1.4 5.6 3.8 7.3V22l3.4-1.9c.9.2 1.8.4 2.8.4 5.7 0 10-4.1 10-9.5S17.7 2 12 2Z"/><path fill="#fff" d="m5.5 14 5-5 3 2.5 5-2.5-5 5-3-2.5Z"/></svg></span>{[["WhatsApp","/assets/logo-library/company logos/social-media/whatsapp/icon.png"],["Instagram","/assets/logo-library/company logos/social-media/instagram/icon.png"],["Gmail","/assets/landing-showcase/gmail-color.png"]].map(([name,path])=><img key={name} src={path} alt={name} title={name} width={24} height={24} loading="lazy"/>)}</div>
    </div>
  </div>;
}

export function BudgetMoment() {
  return (
    <div className={s.budgetMoment}>
      <div className={s.miniHeader}>
        <strong>Everyday spending</strong>
        <span>Budgeting</span>
      </div>
      <div>
        <span>Food & dining</span>
        <strong>
          ₱6,000 <small>/ ₱8,000</small>
        </strong>
      </div>
      <div className={s.circleTrack}>
        <i />
      </div>
      <small>₱2,000 left in your budget</small>
    </div>
  );
}

export function Showcase({ initialMarket, authEnabled = false, homeHref = "/landing-showcase", featureBasePath = "/landing-showcase/features" }: { initialMarket: PricingMarket; authEnabled?: boolean; homeHref?: string; featureBasePath?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const { mode, reduced } = useShowcaseMotion(root);
  return (
    <div
      ref={root}
      className={`${s.site} ${s.revisedStory}`}
      data-motion={reduced ? "off" : mode}
      data-reduced={reduced}
    >
      <a href="#showcase-main" className={s.skip}>
        Skip to content
      </a>
      <div className={s.productionHeader}>
        <JourneyHeader featureBasePath={featureBasePath} homeHref={homeHref} />
      </div>
      <main id="showcase-main" className={s.mainStory}>
        <div className={s.mainPurchase} data-main-purchase aria-hidden="true"><div className={s.mainPaper}><div className={s.mainReceiptBody}><Receipt /></div></div><img className={s.mainFlyingBrand} src="/assets/logo-library/company logos/food/starbucks/icon.png" width={64} height={64} alt="" /></div>
        <ScrollScene id="together" className={s.hero} flow>
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
              <div className={s.signupAction}><JourneyActions authEnabled={authEnabled} final /><Link className={s.loginLink} href="/sign-in">Log in</Link></div>
              <StoreAvailability variant="white" />
            </div>
            <div className={`${s.stage} ${s.heroStage}`}>
              <div className={s.heroPhone}>
                <AppScreen page="accounts" eager />
              </div>
              <div className={s.heroReceipt}>
                <div className={s.receiptDock} data-receipt-origin><div className={s.mobileReceipt}><Receipt small /></div></div><div className={s.ingestStatement}><span><img src="/assets/banks/philippines/bpi.png" alt="" width={24} height={24} />BPI · Statement</span><b>September 2026</b><div className={s.statementRows}><div><span>Sep 30 · Payroll credit</span><b>+₱48,000</b></div><div><span>Sep 28 · Fund transfer</span><b>−₱5,000</b></div><div><span>Sep 26 · Meralco</span><b>−₱1,920</b></div><div><span>Sep 25 · Interest earned</span><b>+₱18.50</b></div></div><small>12 transactions → Clover</small></div>
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

        <ScrollScene id="one-picture" className={s.journey} flow>
          <div className={s.journeyWorld}>
            <article className={s.journeyBeat} data-story-act data-story-weight="1" data-chapter="organize">
              <div className={s.journeyCopy} data-receipt-caption>
                <Heading text="Stop piecing your history together by hand. Bring your accounts and records into one organized view.">
                  Connect. Upload.
                  <br />
                  <em>Or add it yourself.</em>
                </Heading>
                <ol className={s.organizeSteps} aria-label="From scattered records to a clearer picture">
                  <li>Bring together</li><li>Organize</li><li>Understand</li><li>Improve</li>
                </ol>
              </div>
              <div
                className={`${s.journeyArt} ${s.journeyRecords}`}
                data-story-art
              >
                <div className={s.receiptStop} data-receipt-stop />
                <div className={s.connectStack}><ConnectionOptions /><div className={s.manualPreview}><span>Add manually</span><strong>Lunch with friends</strong><b>₱500.00</b><small>Food & dining · BPI</small></div></div>

              </div>
            </article>
            <article className={s.journeyBeat} data-story-act data-story-weight="0.85" data-chapter="understand">
              <div className={s.journeyCopy}>
                <Heading text="See where your money stands and what changed. Bring spending, accounts, obligations, and investments into focus.">
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
            <article className={s.journeyBeat} data-story-act data-story-weight="1.2" data-chapter="ask">
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
                <div className={s.conversationPhoto}>
                  <div className={s.mobileAskPrompt}><span><img src="/clover-mark.svg" alt="" width={22} height={22} /><strong>Ask Clover</strong></span><AnimatedQuestion /></div>
                  <img src="/assets/marketing-photos-v4/adviser-desktop.webp" alt="A woman using her phone on a terrace." width={1672} height={941} loading="lazy" />
                </div>
                <Conversation />
                <div className={s.journeyMascot}>
                  <Mascot pose="chat" size={150} />
                </div>
              </div>
            </article>
            <article className={s.journeyBeat} data-story-act data-story-weight="0.55" data-chapter="trust">
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
                    mobile="landing-story-v3/07-private-review"
                    alt="Reviewing personal financial records at home."
                  />
                </div>
                <ControlCard />
              </div>
            </article>
            <article className={s.journeyBeat} data-story-act data-story-weight="1.2" data-chapter="together">
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
                <CircleCard />
                <div className={s.mobileTogetherCaption}><Heading text="Split expenses with friends on Split Bills. Manage shared plans on Circles.">Manage money together.<br /><em>With less effort.</em></Heading></div>
                <SplitCard />
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
        <section data-scroll-scene id="start-with-clover" className={s.finalCta} aria-labelledby="final-cta-title">
          <div className={s.finalFriends} aria-hidden="true">
            <div className={s.finalFriend} data-side="left"><svg viewBox="790 120 365 750" role="presentation" focusable="false"><image href="/assets/landing-story-v2/06-life.webp" width="1693" height="900" /></svg></div>
            <div className={s.finalFriend} data-side="right"><svg viewBox="1155 120 430 750" role="presentation" focusable="false"><image href="/assets/landing-story-v2/06-life.webp" width="1693" height="900" /></svg></div>
            <img className={s.finalGroupMobile} src="/assets/landing-story-v2/06-life.webp" alt="" width={1693} height={900} loading="lazy" />
          </div>
          <h2 id="final-cta-title">Feel clearer about your money, and more confident <em>about what comes next.</em></h2>
          <div className={s.signupAction}><JourneyActions authEnabled={authEnabled} final /><Link className={s.loginLink} href="/sign-in">Log in</Link></div>
          <StoreAvailability variant="white" />
        </section>
      </main>
      <PublicFooter includeTikTok storeVariant="white" mobileShowcase />
    </div>
  );
}
