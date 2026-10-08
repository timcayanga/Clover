"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import s from "./product-story.module.css";

const steps = [
  {
    name: "Bring it in",
    title: "A receipt. A little less life admin.",
    detail:
      "Clover finds the amount, merchant, and category. You stay in control.",
  },
  {
    name: "Get organized",
    title: "Every little moment, in its place.",
    detail:
      "Find your transactions, with accounts and categories already connected.",
  },
  {
    name: "See the picture",
    title: "Less guessing. More understanding.",
    detail: "See where your money goes, then decide what matters next.",
  },
];

const transactions = [
  {
    title: "Lunch at Mendokoro",
    category: "Food & Dining",
    icon: "food-dining",
    account: "BPI",
    bank: "bpi.png",
    amount: "−₱500.00",
  },
  {
    title: "Weekly groceries",
    category: "Groceries",
    icon: "groceries",
    account: "GCash",
    bank: "gcash.png",
    amount: "−₱1,850.00",
  },
  {
    title: "A little retail therapy",
    category: "Shopping",
    icon: "shopping",
    account: "BPI",
    bank: "bpi.png",
    amount: "−₱2,150.00",
  },
];

const categories = [
  {
    label: "Food & Dining",
    amount: "₱3,000",
    color: "#03a8c0",
    share: "37.5%",
  },
  { label: "Groceries", amount: "₱2,850", color: "#63c9ab", share: "35.6%" },
  { label: "Shopping", amount: "₱2,150", color: "#9380ba", share: "26.9%" },
];

function Arrow() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 12h15m-6-6 6 6-6 6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ReceiptScene() {
  return (
    <div className={s.receiptScene}>
      <div className={s.paperStack}>
        <div className={s.backPaper} aria-hidden="true">
          <span>STATEMENT OF ACCOUNT</span>
          <i />
          <i />
          <i />
        </div>
        <div className={s.receipt}>
          <span className={s.receiptLabel}>YOUR RECEIPT</span>
          <strong>MENDOKORO</strong>
          <span>Ramen. A very good idea.</span>
          <div className={s.receiptDate}>October 5, 2026 · 12:34 PM</div>
          <div className={s.receiptItem}>
            <span>Lunch</span>
            <span>₱500.00</span>
          </div>
          <div className={s.receiptTotal}>
            <span>TOTAL</span>
            <b>₱500.00</b>
          </div>
          <div className={s.barcode} aria-hidden="true" />
          <small>Thank you. See you again.</small>
          <div className={s.scan} aria-hidden="true" />
        </div>
      </div>
      <div className={s.flowArrow}>
        <Arrow />
      </div>
      <div className={s.extraction}>
        <div className={s.readyLabel}>
          <span /> Ready for your review
        </div>
        <img
          src="/figma-icons/categories/food-dining.svg"
          width="46"
          height="46"
          alt=""
        />
        <strong>Lunch at Mendokoro</strong>
        <b className={s.receiptAmount}>₱500.00</b>
        <span className={s.categoryPill}>Food &amp; Dining</span>
        <div className={s.extractedDate}>Oct 5, 2026</div>
        <div className={s.linkedAccount}>
          <img
            src="/assets/banks/philippines/bpi.png"
            alt=""
            width="22"
            height="22"
          />
          <span>BPI Savings</span>
        </div>
      </div>
      <div className={s.intakeNote}>
        <img
          src="/assets/mascots/velvet-compact.webp"
          width="34"
          height="34"
          alt=""
        />
        <span>From a photo to the details that matter.</span>
      </div>
    </div>
  );
}

function TransactionsScene() {
  return (
    <div className={s.transactionsScene}>
      <div className={s.viewHeading}>
        <strong>Transactions</strong>
        <span>PHP</span>
      </div>
      <div className={s.transactionSummary}>
        <span>Your everyday, organized.</span>
        <span className={s.newPill}>
          Receipt added <span aria-hidden="true">✓</span>
        </span>
      </div>
      <div className={s.transactionRows}>
        {transactions.map((item, i) => (
          <div
            key={item.title}
            className={s.transactionRow}
            style={{ animationDelay: `${i * 90}ms` }}
          >
            <img
              className={s.categoryIcon}
              src={`/figma-icons/categories/${item.icon}.svg`}
              width="38"
              height="38"
              alt=""
            />
            <div className={s.transactionText}>
              <strong>{item.title}</strong>
              <span>{item.category}</span>
              <small>
                <img
                  src={`/assets/banks/philippines/${item.bank}`}
                  width="15"
                  height="15"
                  alt=""
                />
                {item.account} · Oct {5 - i}, 2026
              </small>
            </div>
            <b>{item.amount}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

function SpendingScene() {
  return (
    <div className={s.spendingScene}>
      <div className={s.viewHeading}>
        <strong>Where it went</strong>
        <span>October</span>
      </div>
      <div className={s.chartLayout}>
        <div
          className={s.donut}
          role="img"
          aria-label="Total spending ₱8,000. Food and Dining 37.5 percent, Groceries 35.6 percent, Shopping 26.9 percent."
        >
          <svg viewBox="0 0 200 200" aria-hidden="true">
            <circle
              cx="100"
              cy="100"
              r="79"
              fill="none"
              stroke="#eef3f4"
              strokeWidth="22"
            />
            <g transform="rotate(-90 100 100)" fill="none" strokeWidth="22">
              <circle
                cx="100"
                cy="100"
                r="79"
                pathLength="100"
                stroke="#03a8c0"
                strokeDasharray="36.3 63.7"
              />
              <circle
                cx="100"
                cy="100"
                r="79"
                pathLength="100"
                stroke="#63c9ab"
                strokeDasharray="34.4 65.6"
                strokeDashoffset="-37.5"
              />
              <circle
                cx="100"
                cy="100"
                r="79"
                pathLength="100"
                stroke="#9380ba"
                strokeDasharray="25.7 74.3"
                strokeDashoffset="-73.1"
              />
            </g>
          </svg>
          <div>
            <span>Total spending</span>
            <b>₱8,000</b>
            <small>This month</small>
          </div>
        </div>
        <div className={s.legend}>
          {categories.map((category) => (
            <div key={category.label}>
              <span
                className={s.legendDot}
                style={{ background: category.color }}
              />
              <div>
                <span>{category.label}</span>
                <strong>
                  {category.amount}
                  <small>{category.share}</small>
                </strong>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className={s.insight}>
        <img
          src="/assets/mascots/velvet-compact.webp"
          width="40"
          height="40"
          alt=""
        />
        <span>
          Your lunch is part of the picture.
          <br />
          <strong>Food &amp; Dining includes your ₱500 receipt.</strong>
        </span>
      </div>
    </div>
  );
}

/** An illustrative, deterministic demo. No uploads, financial APIs, or AI calls. */
export function ProductStory({ animated }: { animated: boolean }) {
  const root = useRef<HTMLElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const [step, setStep] = useState(0);
  const [manual, setManual] = useState(false);
  const [visible, setVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [engaged, setEngaged] = useState(false);
  const [hovered, setHovered] = useState(false);
  const playing =
    animated && !manual && visible && pageVisible && !engaged && !hovered;

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.25 },
    );
    observer.observe(el);
    const visibility = () =>
      setPageVisible(document.visibilityState === "visible");
    visibility();
    document.addEventListener("visibilitychange", visibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(
      () => setStep((current) => (current + 1) % steps.length),
      6500,
    );
    return () => window.clearTimeout(timer);
  }, [playing, step]);

  const select = (index: number) => {
    setStep(index);
    setManual(true);
  };
  const navigate = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % steps.length
        : event.key === "ArrowLeft"
          ? (index + steps.length - 1) % steps.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? steps.length - 1
              : null;
    if (next === null) return;
    event.preventDefault();
    select(next);
    tabs.current[next]?.focus();
  };

  return (
    <figure
      ref={root}
      className={s.story}
      data-product-story
      data-step={step}
      data-playing={playing}
      data-animated={animated}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setEngaged(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setEngaged(false);
      }}
    >
      <div className={s.demoLabel}>
        <span>
          <i /> A little look inside Clover
        </span>
        <small>Interactive example</small>
      </div>
      <div className={s.window}>
        <div className={s.appBar}>
          <span>
            <img src="/clover-mark.svg" width="23" height="23" alt="" />
            <img
              src="/clover-name-teal.svg"
              width="78"
              height="22"
              alt="Clover"
            />
          </span>
          <span className={s.sampleBadge}>Sample data</span>
          <span className={s.avatar} aria-hidden="true">
            J
          </span>
        </div>
        <div className={s.viewport}>
          {steps.map((item, index) => (
            <div
              key={item.name}
              id={`product-scene-${index}`}
              role="tabpanel"
              aria-labelledby={`product-step-${index}`}
              hidden={step !== index}
              className={s.scene}
              tabIndex={0}
            >
              {index === 0 ? (
                <ReceiptScene />
              ) : index === 1 ? (
                <TransactionsScene />
              ) : (
                <SpendingScene />
              )}
            </div>
          ))}
        </div>
        <div className={s.controls}>
          <div
            role="tablist"
            aria-label="Explore how Clover works"
            className={s.tabs}
          >
            {steps.map((item, index) => (
              <button
                key={item.name}
                ref={(el) => {
                  tabs.current[index] = el;
                }}
                type="button"
                role="tab"
                id={`product-step-${index}`}
                aria-controls={`product-scene-${index}`}
                aria-selected={step === index}
                tabIndex={step === index ? 0 : -1}
                onClick={() => select(index)}
                onKeyDown={(event) => navigate(event, index)}
              >
                <span className={s.stepNumber}>{index + 1}</span>
                <span>{item.name}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className={s.playControl}
            aria-label={
              manual ? "Play product walkthrough" : "Pause product walkthrough"
            }
            aria-pressed={manual}
            disabled={!animated}
            title={
              !animated ? "Motion is paused in your page settings" : undefined
            }
            onClick={() => {
              if (manual) {
                setHovered(false);
                setEngaged(false);
              }
              setManual((current) => !current);
            }}
          >
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
              {manual || !animated ? (
                <path d="m7 4 9 6-9 6Z" fill="currentColor" />
              ) : (
                <path
                  d="M7 4v12M13 4v12"
                  stroke="currentColor"
                  strokeWidth="2"
                />
              )}
            </svg>
          </button>
        </div>
      </div>
      <figcaption
        className={s.caption}
        aria-live={manual ? "polite" : "off"}
        aria-atomic="true"
      >
        <strong>{steps[step].title}</strong>
        <span>{steps[step].detail}</span>
      </figcaption>
    </figure>
  );
}
