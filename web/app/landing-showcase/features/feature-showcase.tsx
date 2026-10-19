"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { PublicFooter } from "@/components/public-footer";
import { JourneyHeader } from "@/app/landing-preview/landing-journey";
import type { FeatureStory } from "@/lib/feature-stories";
import type { PricingMarket } from "@/lib/public-plan-comparison";
import f from "./feature-showcase.module.css";
const bank = (name: string) =>
  `/assets/banks/philippines/${name}.${name === "unionbank" ? "jpg" : "png"}`;
const money = (n: number) =>
  `₱${n.toLocaleString("en-PH", { maximumFractionDigits: 0 })}`;
const merchants = [
  {
    name: "Coffee at Yardstick",
    category: "Food & Dining",
    account: "BPI",
    amount: -240,
    date: "Oct 20",
    logo: "bpi",
  },
  {
    name: "Groceries at The Marketplace",
    category: "Groceries",
    account: "Maya",
    amount: -1850,
    date: "Oct 19",
    logo: "maya",
  },
  {
    name: "Salary",
    category: "Income",
    account: "BPI",
    amount: 48000,
    date: "Oct 18",
    logo: "bpi",
  },
  {
    name: "Dinner at Ippudo",
    category: "Food & Dining",
    account: "BPI",
    amount: -780,
    date: "Oct 17",
    logo: "bpi",
  },
];
function Mark({ name }: { name: string }) {
  return (
    <img
      className={f.mark}
      src={bank(name)}
      width={32}
      height={32}
      alt=""
      loading="lazy"
    />
  );
}
function Tag({ children }: { children: React.ReactNode }) {
  return <span className={f.tag}>{children}</span>;
}
function Panel({
  title,
  detail,
  children,
  className = "",
}: {
  title: string;
  detail?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`${f.panel} ${className}`}>
      <div className={f.panelHeader}>
        <strong>{title}</strong>
        {detail && <span>{detail}</span>}
      </div>
      {children}
    </div>
  );
}
function TransactionsDemo() {
  const [filter, setFilter] = useState("All"),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState<string | null>(null);
  const rows = merchants.filter(
    (row) =>
      (filter === "All" || row.category === filter) &&
      row.name.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className={f.transactionScene} data-selected={Boolean(selected)}>
      <Panel title="Transactions" detail="October 2026">
        <label className={f.search}>
          ⌕
          <input
            aria-label="Search sample transactions"
            placeholder="Search your transactions"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className={f.tabs}>
          {["All", "Food & Dining", "Groceries"].map((x) => (
            <button
              key={x}
              aria-pressed={filter === x}
              onClick={() => setFilter(x)}
            >
              {x}
            </button>
          ))}
        </div>
        <div className={f.table}>
          {rows.map((row) => (
            <button
              className={f.transactionRow}
              key={row.name}
              onClick={() => setSelected(row.name)}
            >
              <Mark name={row.logo} />
              <span>
                <strong>{row.name}</strong>
                <small>
                  {row.category} · {row.date}
                </small>
              </span>
              <b data-positive={row.amount > 0}>
                {row.amount > 0 ? "+" : "−"}
                {money(Math.abs(row.amount))}
              </b>
              <span aria-hidden>›</span>
            </button>
          ))}
          {!rows.length && <p>No examples match your search.</p>}
        </div>
        <div className={f.panelFoot}>
          {rows.length} transactions{" "}
          <span>Select a row to see its details</span>
        </div>
      </Panel>
      <div className={f.floating}>
        <Panel
          title={
            selected ? "Transaction details" : "Every detail stays connected"
          }
          detail="Sample"
        >
          <span className={f.detailIcon}>↗</span>
          <h3>
            {selected ?? "From the original record to your own category."}
          </h3>
          <dl>
            <div>
              <dt>Account</dt>
              <dd>
                {merchants.find((x) => x.name === selected)?.account ?? "BPI"}
              </dd>
            </div>
            <div>
              <dt>Category</dt>
              <dd>
                {merchants.find((x) => x.name === selected)?.category ??
                  "Food & Dining"}
              </dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>Uploaded statement</dd>
            </div>
          </dl>
        </Panel>
      </div>
    </div>
  );
}
function AccountsDemo() {
  const [currency, setCurrency] = useState("All currencies");
  return (
    <div className={f.accountScene}>
      <Panel title="Accounts" detail="Your own financial picture">
        <div className={f.tabs}>
          {["All currencies", "PHP", "USD"].map((x) => (
            <button
              key={x}
              onClick={() => setCurrency(x)}
              aria-pressed={currency === x}
            >
              {x}
            </button>
          ))}
        </div>
        <div className={f.summary}>
          <div>
            <small>
              {currency === "All currencies" ? "Est. net worth" : "Net worth"}
            </small>
            <strong>
              {currency === "USD"
                ? "$2,450"
                : currency === "PHP"
                  ? "₱156,800"
                  : "₱294,000"}
            </strong>
          </div>
          <div>
            <small>Accounts</small>
            <strong>
              {currency === "USD" ? "1" : currency === "PHP" ? "3" : "4"}
            </strong>
          </div>
        </div>
        <div className={f.accountGrid}>
          {(currency === "USD"
            ? [["gotrade", "GoTrade", "Investments", "$2,450"]]
            : [
                ["bpi", "BPI Personal", "Banks & Savings", "₱84,300"],
                ["maya", "Maya Wallet", "Wallets", "₱12,500"],
                ["unionbank", "UnionBank", "Banks & Savings", "₱60,000"],
                ...(currency === "All currencies"
                  ? [["gotrade", "GoTrade", "Investments", "$2,450"]]
                  : []),
              ]
          ).map(([logo, name, type, value]) => (
            <div className={f.account} key={name}>
              <Mark name={logo} />
              <strong>{name}</strong>
              <small>{type}</small>
              <b>
                {value} <span>⌄</span>
              </b>
            </div>
          ))}
        </div>
      </Panel>
      <div className={f.annotation}>
        <span>↔</span>
        <div>
          <strong>One view across currencies</strong>
          <small>Choose a currency, or see an estimated combined total.</small>
        </div>
      </div>
    </div>
  );
}
function RecurringDemo() {
  const [day, setDay] = useState(18);
  const events: Record<number, [string, string, string]> = {
    15: ["Rent", "₱12,000", "Monthly"],
    18: ["Globe", "₱1,699", "Monthly"],
    20: ["Netflix", "₱549", "Monthly"],
    30: ["Salary", "+₱48,000", "Monthly income"],
  };
  const event = events[day];
  return (
    <div className={f.twoPanels}>
      <Panel title="Recurring" detail="November 2026">
        <div className={f.weekdays}>
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>
        <div className={f.calendar}>
          {Array.from({ length: 6 }, (_, i) => (
            <span aria-hidden="true" key={`offset-${i}`} />
          ))}
          {Array.from({ length: 30 }, (_, i) => i + 1).map((n) =>
            events[n] ? (
              <button
                key={n}
                aria-label={`November ${n}: ${events[n][0]}`}
                aria-pressed={day === n}
                onClick={() => setDay(n)}
              >
                {n}
                <i />
              </button>
            ) : (
              <span key={n}>{n}</span>
            ),
          )}
        </div>
      </Panel>
      <Panel title="Coming up" detail={`November ${day}`}>
        <div className={f.largeDate}>
          {day}
          <small>NOVEMBER</small>
        </div>
        <h3>{event[0]}</h3>
        <div className={f.bigAmount}>{event[1]}</div>
        <Tag>{event[2]}</Tag>
        <div className={f.note}>
          See the next expected payment alongside your other commitments.
        </div>
      </Panel>
    </div>
  );
}
function ReportsDemo({ advanced = false }: { advanced?: boolean }) {
  const [period, setPeriod] = useState("October"),
    [view, setView] = useState("Categories");
  const oct = period === "October";
  const values = oct ? [6000, 4500, 3200, 1300] : [4500, 3800, 2900, 1100];
  return (
    <div className={f.reportsScene}>
      <Panel
        title={advanced ? "A report worth coming back to" : "Reports"}
        detail={
          advanced
            ? "Saved view · Monthly spending"
            : "Compare your recorded activity"
        }
      >
        <div className={f.reportControls}>
          <div className={f.tabs}>
            {["September", "October"].map((x) => (
              <button
                key={x}
                aria-pressed={period === x}
                onClick={() => setPeriod(x)}
              >
                {x}
              </button>
            ))}
          </div>
          <div className={f.tabs}>
            {["Categories", "Income & expenses"].map((x) => (
              <button
                key={x}
                aria-pressed={view === x}
                onClick={() => setView(x)}
              >
                {x}
              </button>
            ))}
          </div>
        </div>
        {view === "Categories" ? (
          <div className={f.chartLayout}>
            <div
              className={f.donut}
              style={{ "--slice": oct ? "40%" : "36.6%" } as CSSProperties}
            >
              <div>
                <small>{period}</small>
                <strong>{money(values.reduce((a, b) => a + b, 0))}</strong>
              </div>
            </div>
            <div className={f.bars}>
              {["Food & Dining", "Groceries", "Transport", "Shopping"].map(
                (x, i) => (
                  <div key={x}>
                    <div>
                      <span>{x}</span>
                      <b>{money(values[i])}</b>
                    </div>
                    <i style={{ width: `${values[i] / 65}%` }} />
                  </div>
                ),
              )}
            </div>
          </div>
        ) : (
          <div className={f.incomeTable}>
            <div>
              <strong>Category</strong>
              <strong>September</strong>
              <strong>October</strong>
            </div>
            {[
              ["Income", "₱48,000", "₱48,000"],
              ["Expenses", "₱12,300", "₱15,000"],
              ["Net cash flow", "₱35,700", "₱33,000"],
            ].map((row) => (
              <div key={row[0]}>
                {row.map((x, i) => (
                  <span key={i}>{x}</span>
                ))}
              </div>
            ))}
          </div>
        )}
        <div className={f.panelFoot}>
          Same records. A different perspective.
          <span>Try a period or report view</span>
        </div>
      </Panel>
      <div className={f.annotation}>
        <span>↗</span>
        <div>
          <strong>
            {oct
              ? "Food & Dining increased by ₱1,500"
              : "Your September baseline"}
          </strong>
          <small>
            {oct
              ? "Compare periods to see what changed."
              : "Switch to October to compare your next month."}
          </small>
        </div>
      </div>
    </div>
  );
}
const questions = [
  {
    q: "Why did food spending go up?",
    answer: "Food & Dining is ₱1,500 higher than September in this example.",
    detail: "Dining out contributed ₱1,100 of the increase.",
    items: [
      ["Dining out", 1100],
      ["Coffee", 400],
    ] as [string, number][],
  },
  {
    q: "What bills are coming up?",
    answer: "Your next two expected payments total ₱2,248.",
    detail: "Globe is due Nov 18. Netflix is due Nov 20.",
    items: [
      ["Globe", 1699],
      ["Netflix", 549],
    ] as [string, number][],
  },
  {
    q: "Add lunch, ₱350 from Maya",
    answer: "Here’s the transaction for you to confirm.",
    detail: "Lunch · Food & Dining · Maya · ₱350",
    items: [] as [string, number][],
  },
];
function AskDemo({ advanced = false }: { advanced?: boolean }) {
  const [index, setIndex] = useState(0),
    [confirmed, setConfirmed] = useState(false);
  const examples = advanced
    ? [
        {
          q: "Can I add ₱2,000 to my goal?",
          answer: "Start with what is already committed.",
          detail:
            "In this example, monthly net cash flow is ₱33,000. Upcoming bills total ₱2,248. A ₱2,000 contribution would leave ₱28,752 before other unrecorded spending.",
          items: [
            ["Upcoming bills", 2248],
            ["Goal contribution", 2000],
          ] as [string, number][],
        },
        {
          q: "What should I review first?",
          answer: "Food & Dining is the clearest change to explore.",
          detail:
            "It rose ₱1,500 from September. Check dining out and coffee before changing a budget.",
          items: [
            ["Dining out increase", 1100],
            ["Coffee increase", 400],
          ] as [string, number][],
        },
      ]
    : questions;
  const q = examples[index];
  return (
    <Panel
      title="Ask Clover"
      detail={
        advanced
          ? "Explore a follow-up"
          : "A conversation with your own records"
      }
    >
      <div className={f.questionChips}>
        {examples.map((x, i) => (
          <button
            key={x.q}
            aria-pressed={i === index}
            onClick={() => {
              setIndex(i);
              setConfirmed(false);
            }}
          >
            {x.q}
          </button>
        ))}
      </div>
      <div className={f.chat} key={index}>
        <div className={f.userMessage}>{q.q}</div>
        <div className={f.assistant}>
          <img
            src="/assets/mascots/velvet-chat.webp"
            alt=""
            width={36}
            height={36}
          />
          <strong>Clover</strong>
        </div>
        <p>{q.answer}</p>
        <p className={f.muted}>{q.detail}</p>
        {q.items.map(([name, value]) => (
          <div className={f.chatMetric} key={name}>
            <span>{name}</span>
            <b>{money(value)}</b>
          </div>
        ))}
        {!advanced && index === 2 && (
          <button className={f.primary} onClick={() => setConfirmed(true)}>
            {confirmed
              ? "Example transaction added ✓"
              : "Confirm example transaction"}
          </button>
        )}
        <small className={f.example}>
          Interactive example · no account data is changed
        </small>
      </div>
    </Panel>
  );
}
function SavedReportsDemo() {
  const [selected, setSelected] = useState("Food trends"),
    [saved, setSaved] = useState(false);
  const food = selected === "Food trends";
  return (
    <div className={f.twoPanels}>
      <Panel title="Your saved reports" detail="The views you return to">
        <div className={f.savedViews}>
          {["Food trends", "Monthly cash flow"].map((x) => (
            <button
              key={x}
              aria-pressed={selected === x}
              onClick={() => setSelected(x)}
            >
              <span>▥</span>
              <div>
                <strong>{x}</strong>
                <small>
                  {x === "Food trends"
                    ? "Food & Dining · 3 months"
                    : "All accounts · Monthly"}
                </small>
              </div>
              <span>›</span>
            </button>
          ))}
        </div>
        <div className={f.note}>
          Reopen a useful combination of filters without setting it up again.
        </div>
      </Panel>
      <Panel title={selected} detail="July – September">
        <div className={f.savedChart}>
          {(food ? [4500, 5200, 6000] : [35700, 34000, 33000]).map((n, i) => (
            <div key={i}>
              <b>{money(n)}</b>
              <i style={{ height: `${n / (food ? 60 : 357)}px` }} />
              <small>{["July", "August", "September"][i]}</small>
            </div>
          ))}
        </div>
        <button className={f.primary} onClick={() => setSaved((x) => !x)}>
          {saved ? "Example report saved ✓" : "Save example view"}
        </button>
        <small className={f.example}>
          Interactive example · no reports are added to your account
        </small>
      </Panel>
    </div>
  );
}
function InvestmentsDemo() {
  const [selected, setSelected] = useState("All");
  const holdings = [
    ["Apple", "AAPL", "10 units", "₱128,800"],
    ["Microsoft", "MSFT", "5 units", "₱118,200"],
    ["ATRAM Global Tech", "Fund", "20 units", "₱45,000"],
  ];
  return (
    <Panel title="Investments" detail="Holdings, value and allocation">
      <div className={f.tabs}>
        {["All", "Stocks", "Funds"].map((x) => (
          <button
            aria-pressed={x === selected}
            key={x}
            onClick={() => setSelected(x)}
          >
            {x}
          </button>
        ))}
      </div>
      <div className={f.investmentHeader}>
        <div>
          <small>Estimated portfolio value</small>
          <strong>
            {selected === "Stocks"
              ? "₱247,000"
              : selected === "Funds"
                ? "₱45,000"
                : "₱292,000"}
          </strong>
        </div>
        <svg
          viewBox="0 0 340 95"
          role="img"
          aria-label="Illustrative six-month portfolio trend"
        >
          <path d="M0 82 L35 70 L70 74 L105 48 L140 58 L175 35 L210 42 L245 22 L280 30 L340 6" />
        </svg>
      </div>
      <div className={f.holdings}>
        {holdings
          .filter(
            (x) =>
              selected === "All" ||
              (selected === "Funds" ? x[1] === "Fund" : x[1] !== "Fund"),
          )
          .map(([name, ticker, units, value]) => (
            <div key={ticker}>
              <div className={f.ticker}>
                {ticker === "Fund" ? "A" : ticker.slice(0, 1)}
              </div>
              <span>
                <strong>{name}</strong>
                <small>
                  {ticker} · {units}
                </small>
              </span>
              <b>{value}</b>
            </div>
          ))}
      </div>
      <div className={f.note}>
        Keep your units and recorded purchase information beside estimated
        values.
      </div>
    </Panel>
  );
}
function BudgetDemo() {
  const [limit, setLimit] = useState(10000);
  const spent = 6250;
  return (
    <div className={f.twoPanels}>
      <Panel title="Budgeting" detail="Food & Dining · Monthly">
        <div
          className={f.budgetRing}
          style={
            {
              "--budget": `${Math.min(100, (spent / limit) * 100)}%`,
            } as CSSProperties
          }
        >
          <div>
            <small>Spent this month</small>
            <strong>₱6,250</strong>
            <span>of {money(limit)}</span>
          </div>
        </div>
        <div className={f.rangeLabel}>
          <label htmlFor="budget-example">Monthly budget</label>
          <b>{money(limit)}</b>
        </div>
        <input
          id="budget-example"
          aria-label="Sample monthly budget"
          type="range"
          min={5000}
          max={15000}
          step={500}
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
        />
      </Panel>
      <Panel
        title="Room for the rest of the month"
        detail="Updates with your example"
      >
        <div className={f.bigAmount}>{money(Math.abs(limit - spent))}</div>
        <Tag>{limit >= spent ? "remaining" : "over budget"}</Tag>
        <div className={f.lineItems}>
          {[
            ["Dining out", "₱3,750"],
            ["Coffee", "₱1,500"],
            ["Takeaway", "₱1,000"],
          ].map(([x, y]) => (
            <div key={x}>
              <span>{x}</span>
              <b>{y}</b>
            </div>
          ))}
        </div>
        <div className={f.note}>
          Move the budget slider to explore how the remaining amount changes.
        </div>
      </Panel>
    </div>
  );
}
function GoalsDemo() {
  const [saved, setSaved] = useState(42000);
  return (
    <div className={f.twoPanels}>
      <Panel title="Goals" detail="Emergency fund">
        <div className={f.goalShape}>☂</div>
        <h3>Space to breathe.</h3>
        <div className={f.bigAmount}>
          {money(saved)} <small>/ ₱100,000</small>
        </div>
        <div className={f.progress}>
          <i style={{ width: `${saved / 1000}%` }} />
        </div>
        <div className={f.panelFoot}>
          {saved / 1000}% of your target<span>Target · December 2027</span>
        </div>
      </Panel>
      <Panel
        title="Build it one contribution at a time"
        detail="Example contribution"
      >
        <div className={f.largeDate}>+₱2,000</div>
        <p>A small step today moves your goal forward.</p>
        <button
          className={f.primary}
          disabled={saved >= 100000}
          onClick={() => setSaved((x) => Math.min(100000, x + 2000))}
        >
          {saved >= 100000
            ? "Example target reached ✓"
            : "Add example contribution"}
        </button>
        <button className={f.textButton} onClick={() => setSaved(42000)}>
          Reset example
        </button>
        <div className={f.note}>
          Review progress alongside your budgets and upcoming commitments.
        </div>
      </Panel>
    </div>
  );
}
const people = [
  { name: "Alex", color: "#d5f3e7" },
  { name: "Jamie", color: "#d7edf6" },
  { name: "Sam", color: "#eee1f8" },
];
function People() {
  return (
    <div className={f.people}>
      {people.map((p) => (
        <div key={p.name}>
          <span style={{ background: p.color }}>{p.name[0]}</span>
          <small>{p.name}</small>
        </div>
      ))}
    </div>
  );
}
function CirclesDemo() {
  const [scope, setScope] = useState("Shared");
  return (
    <div className={f.twoPanels}>
      <Panel title="Weekend in La Union" detail="Circle · 3 people">
        <People />
        <div className={f.summary}>
          <div>
            <small>Shared expenses</small>
            <strong>₱18,600</strong>
          </div>
        </div>
        <div className={f.lineItems}>
          {[
            ["Beach house", "Alex", "₱12,000"],
            ["Dinner", "Jamie", "₱4,200"],
            ["Fuel", "Sam", "₱2,400"],
          ].map(([title, name, value]) => (
            <div key={title}>
              <span>
                {title}
                <small>Paid by {name}</small>
              </span>
              <b>{value}</b>
            </div>
          ))}
        </div>
      </Panel>
      <Panel
        title="Share the right context"
        detail="Your finances stay personal"
      >
        <div className={f.tabs}>
          {["Shared", "Personal"].map((x) => (
            <button
              key={x}
              aria-pressed={scope === x}
              onClick={() => setScope(x)}
            >
              {x}
            </button>
          ))}
        </div>
        <div className={f.scopeIcon}>{scope === "Shared" ? "◎" : "◈"}</div>
        <h3>
          {scope === "Shared"
            ? "The trip, together."
            : "Your personal money stays yours."}
        </h3>
        <p>
          {scope === "Shared"
            ? "The group sees the expenses you choose to share in this Circle."
            : "Your salary, personal accounts and other transactions are outside this shared example."}
        </p>
        <Tag>
          {scope === "Shared"
            ? "Visible to Alex, Jamie & Sam"
            : "Not shared with this Circle"}
        </Tag>
      </Panel>
    </div>
  );
}
function SplitDemo() {
  const [assign, setAssign] = useState([
    [true, true, true],
    [true, true, false],
    [false, false, true],
  ]);
  const amounts = [900, 600, 180];
  const totals = people.map((_, p) =>
    assign.reduce(
      (n, row, i) => n + (row[p] ? amounts[i] / row.filter(Boolean).length : 0),
      0,
    ),
  );
  return (
    <div className={f.twoPanels}>
      <Panel title="Dinner, fairly shared" detail="Split Bills · ₱1,680">
        <div className={f.splitTable}>
          <div>
            <span>Item</span>
            {people.map((p) => (
              <strong key={p.name}>{p.name}</strong>
            ))}
          </div>
          {["Pizza", "Chicken", "Coffee"].map((name, i) => (
            <div key={name}>
              <span>
                {name}
                <small>{money(amounts[i])}</small>
              </span>
              {people.map((p, j) => (
                <label key={p.name}>
                  <input
                    type="checkbox"
                    aria-label={`${p.name} pays for ${name.toLowerCase()}`}
                    checked={assign[i][j]}
                    onChange={() =>
                      setAssign((old) =>
                        old.map((row, r) =>
                          r === i ? row.map((v, c) => (c === j ? !v : v)) : row,
                        ),
                      )
                    }
                  />
                </label>
              ))}
            </div>
          ))}
          <div className={f.splitTotal}>
            <strong>To pay</strong>
            {totals.map((n, i) => (
              <b key={i}>{money(n)}</b>
            ))}
          </div>
        </div>
        {assign.some((row) => !row.some(Boolean)) && (
          <p role="status">
            Choose at least one person for each item to assign the full bill.
          </p>
        )}
      </Panel>
      <Panel
        title="A clear request, ready to share"
        detail="Example payment request"
      >
        <div className={f.requestArrow}>↗</div>
        <h3>Hi Jamie 👋</h3>
        <p>Here’s your share of dinner.</p>
        <div className={f.bigAmount}>{money(totals[1])}</div>
        <div className={f.lineItems}>
          {["Pizza", "Chicken", "Coffee"]
            .filter((_, i) => assign[i][1])
            .map((name) => (
              <div key={name}>
                <span>{name}</span>
                <span>Included</span>
              </div>
            ))}
        </div>
        <div className={f.note}>
          Send the itemized request with your payment QR through the chat app
          you use.
        </div>
      </Panel>
    </div>
  );
}
function SourceDemo() {
  return (
    <div className={f.twoPanels}>
      <Panel title="Original record" detail="Uploaded statement">
        <div className={f.document}>
          <div>
            <Mark name="bpi" />
            <strong>BPI</strong>
          </div>
          <h3>Statement of account</h3>
          <small>October 2026 · •••• 3012</small>
          {[
            ["Oct 18", "Salary", "+₱48,000"],
            ["Oct 19", "The Marketplace", "−₱1,850"],
            ["Oct 20", "Yardstick", "−₱240"],
          ].map((row) => (
            <div key={row[0]}>
              {row.map((x) => (
                <span key={x}>{x}</span>
              ))}
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Trace the transaction back" detail="Source context">
        <div className={f.sourcePath}>
          <span>Original file</span>
          <i>↓</i>
          <span>Extracted row</span>
          <i>↓</i>
          <span>Your transaction</span>
        </div>
        <div className={f.note}>
          The original description stays separate from the simplified title, so
          you can check the evidence behind a record.
        </div>
      </Panel>
    </div>
  );
}
function ReviewDemo() {
  const [kept, setKept] = useState(false);
  return (
    <div className={f.twoPanels}>
      <Panel title="Review a suggested category" detail="Sample transaction">
        <h3>Yardstick Coffee</h3>
        <div className={f.bigAmount}>₱240</div>
        <div className={f.diff}>
          <div>
            <small>Original description</small>
            <strong>YARDSTICK COFFEE MAKATI</strong>
          </div>
          <span>↓</span>
          <div>
            <small>Suggested category</small>
            <strong>Food & Dining</strong>
          </div>
        </div>
      </Panel>
      <Panel title="You have the final say" detail="Review">
        <Tag>{kept ? "Example confirmed" : "Your confirmation needed"}</Tag>
        <h3>
          {kept
            ? "Your choice is recorded."
            : "Check it. Keep it. Make it yours."}
        </h3>
        <p>
          Confirm the details you recognize. Correct anything that needs
          attention.
        </p>
        <button className={f.primary} onClick={() => setKept((x) => !x)}>
          {kept ? "Reset example" : "Confirm example category"}
        </button>
        <small className={f.example}>
          This demonstration never changes your records.
        </small>
      </Panel>
    </div>
  );
}
function ControlsDemo() {
  const [tab, setTab] = useState("Connections");
  return (
    <Panel title="Your controls" detail="Account settings">
      <div className={f.tabs}>
        {["Connections", "Export", "Delete account"].map((x) => (
          <button key={x} aria-pressed={tab === x} onClick={() => setTab(x)}>
            {x}
          </button>
        ))}
      </div>
      <div className={f.controlDemo}>
        {tab === "Connections" ? (
          <>
            <Mark name="bpi" />
            <h3>Choose what to connect.</h3>
            <p>
              Manage your supported bank connections and unlink accounts from
              Clover.
            </p>
          </>
        ) : tab === "Export" ? (
          <>
            <span className={f.scopeIcon}>↓</span>
            <h3>Your information, in your hands.</h3>
            <p>
              Export your recorded information through your account settings.
            </p>
          </>
        ) : (
          <>
            <span className={f.scopeIcon}>◈</span>
            <h3>A deliberate choice.</h3>
            <p>
              Account deletion asks for confirmation. Apple subscriptions are
              managed separately in your App Store account.
            </p>
          </>
        )}
      </div>
      <div className={f.note}>
        This is a demonstration of the controls. No connection or account is
        changed here.
      </div>
    </Panel>
  );
}
function ProDemo({ market }: { market: PricingMarket }) {
  const [annual, setAnnual] = useState(true);
  const ph = market === "ph";
  return (
    <Panel title="Choose your room to grow" detail="Free · Plus · Pro">
      <div className={f.tabs}>
        {[true, false].map((x) => (
          <button
            key={String(x)}
            aria-pressed={annual === x}
            onClick={() => setAnnual(x)}
          >
            {x ? "Yearly" : "Monthly"}
          </button>
        ))}
      </div>
      <div className={f.planColumns}>
        {[
          ["Free", "Start with the essentials", "Uploads & manual entry"],
          [
            "Plus",
            "Connect your everyday money",
            "Up to 2 linked bank accounts",
          ],
          [
            "Pro",
            "See a wider financial picture",
            "Up to 5 linked bank accounts",
          ],
        ].map(([name, line, benefit]) => (
          <div key={name}>
            <Tag>{name}</Tag>
            <h3>{line}</h3>
            <p>{benefit}</p>
            <small>
              {name === "Free"
                ? "Free to start"
                : `${annual ? "Annual" : "Monthly"} plans · ${ph ? "PHP" : "USD"}`}
            </small>
          </div>
        ))}
      </div>
      <a className={f.primary} href="/pricing">
        View full plans & pricing →
      </a>
    </Panel>
  );
}
function Demo({ id, market }: { id: string; market: PricingMarket }) {
  switch (id) {
    case "transactions":
      return <TransactionsDemo />;
    case "accounts":
      return <AccountsDemo />;
    case "recurring":
      return <RecurringDemo />;
    case "reports":
      return <ReportsDemo />;
    case "adviser":
      return <AskDemo />;
    case "investments":
      return <InvestmentsDemo />;
    case "budgeting":
      return <BudgetDemo />;
    case "goals":
      return <GoalsDemo />;
    case "circles":
      return <CirclesDemo />;
    case "split-bills":
      return <SplitDemo />;
    case "uploaded-files":
      return <SourceDemo />;
    case "review":
      return <ReviewDemo />;
    case "private-account":
      return <ControlsDemo />;
    case "deeper-guidance":
      return <AskDemo advanced />;
    case "investment-context":
      return <SavedReportsDemo />;
    case "compare":
      return <ProDemo market={market} />;
    default:
      return null;
  }
}
// One passive scroll listener; animate only visible stages and stop the settling loop at rest.
function useFeatureMotion(root: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const stages = [
      ...el.querySelectorAll<HTMLElement>("[data-feature-stage]"),
    ];
    const active = new Set<HTMLElement>();
    let raf = 0;
    let disposed = false;
    const values = new Map<HTMLElement, number>();
    const reduced = () =>
      media.matches ||
      new URL(location.href).searchParams.get("motion") === "off";
    const draw = () => {
      raf = 0;
      if (disposed || document.hidden) return;
      let settle = false;
      for (const stage of active) {
        const r = stage.getBoundingClientRect();
        const target = reduced()
          ? 0
          : Math.max(
              -1,
              Math.min(
                1,
                (r.top + r.height / 2 - innerHeight / 2) / innerHeight,
              ),
            );
        const old = values.get(stage) ?? target;
        const next = old + (target - old) * 0.16;
        values.set(stage, next);
        stage.style.setProperty("--travel", next.toFixed(4));
        if (Math.abs(target - next) > 0.001) settle = true;
      }
      if (settle) raf = requestAnimationFrame(draw);
    };
    const request = () => {
      if (!raf) raf = requestAnimationFrame(draw);
    };
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const stage = entry.target as HTMLElement;
          if (entry.isIntersecting) {
            active.add(stage);
            stage.dataset.inView = "true";
          } else {
            active.delete(stage);
            stage.dataset.inView = "false";
          }
        }
        request();
      },
      { rootMargin: "120px" },
    );
    stages.forEach((stage) => observer.observe(stage));
    addEventListener("scroll", request, { passive: true });
    addEventListener("resize", request);
    media.addEventListener("change", request);
    document.addEventListener("visibilitychange", request);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      removeEventListener("scroll", request);
      removeEventListener("resize", request);
      media.removeEventListener("change", request);
      document.removeEventListener("visibilitychange", request);
    };
  }, [root]);
}
export function FeatureShowcase({
  story,
  initialMarket,
}: {
  story: FeatureStory;
  initialMarket: PricingMarket;
  authEnabled?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  useFeatureMotion(root);
  const chapters = story.chapters.filter(
    (c) => c.id !== "overview" && c.id !== "start",
  );
  return (
    <div className={f.feature} ref={root}>
      <a className={f.skip} href="#feature-main">
        Skip to content
      </a>
      <div className={f.header}>
        <JourneyHeader
          featureBasePath="/landing-showcase/features"
          homeHref="/landing-showcase"
        />
      </div>
      <main id="feature-main" aria-label={story.title}>
        <h1 className={f.pageTitle}>{story.title}</h1>
        <nav className={f.chapterNav} aria-label="On this page">
          {chapters.map((c) => (
            <a key={c.id} href={`#${c.id}`}>
              {c.title.replace(/\.$/, "")}
            </a>
          ))}
        </nav>
        {chapters.map((chapter, i) => (
          <section
            key={chapter.id}
            id={chapter.id}
            className={f.chapter}
            aria-labelledby={`${chapter.id}-title`}
          >
            <div className={f.caption}>
              <span className={f.chapterNumber}>
                {String(i + 1).padStart(2, "0")} /{" "}
                {String(chapters.length).padStart(2, "0")}
              </span>
              <h2 id={`${chapter.id}-title`}>
                {chapter.title} <em>{chapter.accent}</em>
              </h2>
              <p>{chapter.copy}</p>
            </div>
            <div className={f.stage} data-feature-stage>
              <div className={f.stageInner}>
                <Demo id={chapter.id} market={initialMarket} />
              </div>
            </div>
          </section>
        ))}
      </main>
      <PublicFooter includeTikTok storeVariant="white" mobileShowcase />
    </div>
  );
}
