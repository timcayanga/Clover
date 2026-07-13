"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, type ReactNode } from "react";

const transactions = [
  ["Groceries", "Food", "- P2,840"],
  ["Salary", "Income", "+ P68,500"],
  ["Electric bill", "Utilities", "- P3,160"],
] as const;

function CloverCore({ secure = false }: { secure?: boolean }) {
  return (
    <div className={`gravity-core ${secure ? "gravity-core--secure" : ""}`} aria-hidden="true">
      <Image className="gravity-core__logo" src="/clover-mark.svg" alt="" width={128} height={128} />
      {secure ? <span className="gravity-core__lock">&#10003;</span> : null}
    </div>
  );
}

function Person3D({ pose = "standing", label }: { pose?: "standing" | "pointing" | "celebrating"; label?: string }) {
  return (
    <div className={`gravity-person-3d gravity-person-3d--${pose}`} aria-hidden="true">
      <div className="gravity-person-3d__head"><i /><b /><span /></div>
      <div className="gravity-person-3d__neck" />
      <div className="gravity-person-3d__body"><i className="gravity-person-3d__arm gravity-person-3d__arm--left" /><i className="gravity-person-3d__arm gravity-person-3d__arm--right" /></div>
      <div className="gravity-person-3d__legs"><i /><i /></div>
      {label ? <strong>{label}</strong> : null}
    </div>
  );
}

function SourceVisual() {
  return (
    <div className="gravity-visual gravity-visual--sources" aria-hidden="true">
      <div className="gravity-orbit gravity-orbit--outer" />
      <div className="gravity-orbit gravity-orbit--inner" />
      <div className="gravity-document gravity-document--bank"><span>STATEMENT</span><b>Account activity</b><i /><i /><i /></div>
      <div className="gravity-document gravity-document--receipt"><span>RECEIPT</span><b>Market</b><i /><i /><i /></div>
      <div className="gravity-document gravity-document--sheet"><span>SHEET</span><b>2026 records</b><i /><i /><i /></div>
      <div className="gravity-document gravity-document--shot"><span>SCREENSHOT</span><b>Recent activity</b><i /><i /><i /></div>
      <Person3D pose="pointing" />
      <CloverCore />
      <div className="gravity-ledger">
        <div className="gravity-ledger__top"><span>Clover</span><b>Transactions</b></div>
        {transactions.map(([name, category, amount]) => (
          <div className="gravity-ledger__row" key={name}><i /><strong>{name}</strong><span>{category}</span><b>{amount}</b></div>
        ))}
      </div>
    </div>
  );
}

function ImportVisual() {
  return (
    <div className="gravity-visual gravity-visual--import" aria-hidden="true">
      <div className="gravity-file-stack"><div>PDF</div><div>JPG</div><div>CSV</div></div>
      <div className="gravity-stream">
        {["Date", "Merchant", "Category", "Amount"].map((label) => <span key={label}>{label}</span>)}
      </div>
      <CloverCore />
      <div className="gravity-import-card">
        <span>Imported in seconds</span><strong>8 months</strong><small>1,842 transactions organized</small>
        <div className="gravity-import-card__bar"><i /></div>
      </div>
    </div>
  );
}

function InsightVisual() {
  return (
    <div className="gravity-visual gravity-visual--insights" aria-hidden="true">
      <div className="gravity-chart">
        <div className="gravity-chart__head"><span>Spending overview</span><b>Last 6 months</b></div>
        <svg viewBox="0 0 480 220" role="presentation">
          <defs><linearGradient id="gravityArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#08abc3" stopOpacity=".38"/><stop offset="1" stopColor="#08abc3" stopOpacity="0"/></linearGradient></defs>
          <path className="gravity-chart__area" d="M10 178 C70 152 90 70 150 100 S240 180 290 116 S390 48 470 62 L470 210 L10 210Z" />
          <path className="gravity-chart__line" d="M10 178 C70 152 90 70 150 100 S240 180 290 116 S390 48 470 62" />
        </svg>
        <div className="gravity-chart__months"><span>Jan</span><span>Feb</span><span>Mar</span><span>Apr</span><span>May</span><span>Jun</span></div>
      </div>
      <div className="gravity-insight gravity-insight--one"><span>Largest change</span><strong>Dining down 18%</strong></div>
      <div className="gravity-insight gravity-insight--two"><span>On track</span><strong>P12,400 saved</strong></div>
      <div className="gravity-money-flow gravity-money-flow--one"><i>P</i><span>Income</span></div>
      <div className="gravity-money-flow gravity-money-flow--two"><i>P</i><span>Spending</span></div>
      <div className="gravity-money-flow gravity-money-flow--three"><i>P</i><span>Savings</span></div>
      <Person3D pose="standing" label="Your money movement" />
    </div>
  );
}

function SplitVisual() {
  return (
    <div className="gravity-visual gravity-visual--split" aria-hidden="true">
      <div className="gravity-expense"><span>Dinner</span><strong>P4,800</strong><small>Split equally</small></div>
      <div className="gravity-split-line gravity-split-line--one" />
      <div className="gravity-split-line gravity-split-line--two" />
      <div className="gravity-split-line gravity-split-line--three" />
      {["You", "Mia", "Sam"].map((name, index) => <div className={`gravity-person gravity-person--${index + 1}`} key={name}><i>{name[0]}</i><strong>{name}</strong><span>P1,600</span></div>)}
      <div className="gravity-settled">All clear</div>
    </div>
  );
}

function ProVisual() {
  return (
    <div className="gravity-visual gravity-visual--pro" aria-hidden="true">
      <div className="gravity-pro-ring gravity-pro-ring--one" />
      <div className="gravity-pro-ring gravity-pro-ring--two" />
      <div className="gravity-pro-card gravity-pro-card--portfolio"><span>Portfolio</span><strong>P1.24M</strong><small>+8.4% this year</small></div>
      <div className="gravity-pro-card gravity-pro-card--cash"><span>Cash flow</span><strong>+P18,600</strong><small>Monthly average</small></div>
      <div className="gravity-pro-card gravity-pro-card--worth"><span>Net worth</span><strong>P2.08M</strong><small>Across 9 accounts</small></div>
      <div className="gravity-pro-badge">PRO</div>
      <div className="gravity-net-worth-tower"><i /><i /><i /><i /><span>Net worth</span></div>
      <Person3D pose="celebrating" label="Everything in view" />
    </div>
  );
}

function SecurityVisual() {
  return (
    <div className="gravity-visual gravity-visual--security" aria-hidden="true">
      <div className="gravity-security-orbit gravity-security-orbit--one"><span>Files</span></div>
      <div className="gravity-security-orbit gravity-security-orbit--two"><span>Accounts</span></div>
      <div className="gravity-security-orbit gravity-security-orbit--three"><span>History</span></div>
      <div className="gravity-shield"><CloverCore secure /></div>
      <p>Protected and under your control</p>
    </div>
  );
}

function StorySection({ id, eyebrow, title, copy, visual, reverse = false, tone = "light" }: {
  id: string;
  eyebrow: string;
  title: ReactNode;
  copy: ReactNode;
  visual: ReactNode;
  reverse?: boolean;
  tone?: "light" | "mint" | "deep";
}) {
  return (
    <section className={`gravity-chapter gravity-chapter--${tone} ${reverse ? "gravity-chapter--reverse" : ""}`} id={id} data-gravity-chapter>
      <div className="gravity-chapter__inner">
        <div className="gravity-chapter__copy">
          <span className="gravity-chapter__eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
          <div>{copy}</div>
        </div>
        <div className="gravity-chapter__stage">{visual}</div>
      </div>
    </section>
  );
}

export function LandingFinancialStory() {
  const storyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = storyRef.current;
    if (!root) return;
    const chapters = Array.from(root.querySelectorAll<HTMLElement>("[data-gravity-chapter]"));
    let frame = 0;
    const update = () => {
      frame = 0;
      const viewport = window.innerHeight || 1;
      chapters.forEach((chapter) => {
        const rect = chapter.getBoundingClientRect();
        const progress = Math.max(0, Math.min(1, (viewport - rect.top) / (viewport + rect.height)));
        const distance = Math.abs(rect.top + rect.height / 2 - viewport / 2);
        chapter.style.setProperty("--gravity-progress", progress.toFixed(3));
        chapter.classList.toggle("is-gravity-active", distance < Math.max(viewport * 0.68, rect.height * 0.48));
      });
    };
    const requestUpdate = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    const updatePointer = (event: PointerEvent) => {
      const x = (event.clientX / window.innerWidth - 0.5) * 2;
      const y = (event.clientY / window.innerHeight - 0.5) * 2;
      root.style.setProperty("--gravity-pointer-x", x.toFixed(3));
      root.style.setProperty("--gravity-pointer-y", y.toFixed(3));
    };
    const resetPointer = () => {
      root.style.setProperty("--gravity-pointer-x", "0");
      root.style.setProperty("--gravity-pointer-y", "0");
    };
    update();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);
    window.addEventListener("pointermove", updatePointer, { passive: true });
    document.documentElement.addEventListener("mouseleave", resetPointer);
    return () => {
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
      window.removeEventListener("pointermove", updatePointer);
      document.documentElement.removeEventListener("mouseleave", resetPointer);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="gravity-story" ref={storyRef}>
      <section className="gravity-hero" data-gravity-chapter>
        <div className="gravity-hero__aurora" aria-hidden="true" />
        <div className="gravity-hero__inner">
          <div className="gravity-hero__copy">
            <h1>Months of finances.<br /><em>Organized in minutes.</em></h1>
            <p>Upload the financial files you already have. Clover organizes them so you can follow your money movement and keep track of your net worth.</p>
            <div className="gravity-hero__actions">
              <Link className="button button-primary button-pill" href="/sign-up" prefetch={false}>Organize my finances for free</Link>
              <Link className="button button-secondary button-pill" href="/sign-in" prefetch={false}>Log in</Link>
            </div>
            <div className="gravity-hero__proof"><span>No card required</span><span>Review before saving</span><span>Your data stays yours</span></div>
          </div>
          <div className="gravity-hero__stage"><SourceVisual /></div>
        </div>
      </section>

      <StorySection id="statement-import" eyebrow="Bring it together" reverse title={<>Start with what you <em>already have.</em></>} copy={<><p>Upload statements, receipts, screenshots, or spreadsheets. You can also add anything manually.</p><p>Clover extracts the useful details and organizes months of history without months of typing.</p></>} visual={<ImportVisual />} />
      <StorySection id="insights" eyebrow="Follow every movement" title={<>See where your money <em>comes and goes.</em></>} copy={<><p>Clover turns organized transactions into a clear view of income, spending, transfers, and savings.</p><p>Follow changes across months without rebuilding reports by hand.</p></>} visual={<InsightVisual />} />
      <StorySection id="split-bills" eyebrow="Share without the awkward math" reverse title={<>One expense. Everyone’s share, <em>made clear.</em></>} copy={<><p>Choose a transaction, add the people involved, and Clover works out each share.</p><p>Everyone can see who paid, who owes, and what has already been settled.</p></>} visual={<SplitVisual />} />
      <StorySection id="pro" eyebrow="Your complete financial picture" tone="deep" title={<>Keep your <em>net worth</em> in view.</>} copy={<><p>Pro brings cash, debts, investments, and account balances into one continuously updated picture.</p><p>See what you own, what you owe, and how your net worth changes over time.</p></>} visual={<ProVisual />} />
      <StorySection id="trust" eyebrow="Stay in control" reverse title={<>Your financial data stays <em>yours.</em></>} copy={<><p>Your files, accounts, and financial history are protected and separated from everyone else’s.</p><p>You decide what enters Clover, review what was extracted, and control access to your account.</p></>} visual={<SecurityVisual />} />

      <section className="gravity-finale" data-gravity-chapter>
        <CloverCore />
        <h2>Make money management feel simpler.</h2>
        <p>Bring your records together and start seeing the story behind your money.</p>
        <div className="gravity-finale__actions">
          <Link className="button button-primary button-pill" href="/sign-up" prefetch={false}>Organize my finances for free</Link>
          <Link className="button button-secondary button-pill" href="/sign-in" prefetch={false}>Log in</Link>
        </div>
      </section>
    </div>
  );
}
