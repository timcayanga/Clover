import Link from "next/link";
import { CloverMascot } from "@/components/clover-mascot";
import c from "./cinematic-opening.module.css";

const accountRows = [
  {
    name: "BPI Savings",
    kind: "Bank account",
    amount: "₱48,250",
    file: "bpi.png",
    color: "#a8112a",
  },
  {
    name: "Maya",
    kind: "Everyday wallet",
    amount: "₱6,840",
    file: "maya.png",
    color: "#102924",
  },
  {
    name: "UnionBank",
    kind: "Credit card",
    amount: "₱8,200",
    file: "unionbank.jpg",
    color: "#d66317",
  },
];

function MiniChart() {
  return (
    <svg viewBox="0 0 420 140" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="opening-chart-fill" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#03b9bf" stopOpacity=".25" />
          <stop offset="1" stopColor="#03b9bf" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M0 105C25 107 30 72 55 80S85 109 113 65 145 90 173 58 200 80 233 47 270 61 300 28 330 48 365 14 399 28 420 5V140H0Z"
        fill="url(#opening-chart-fill)"
      />
      <path
        className={c.chartLine}
        d="M0 105C25 107 30 72 55 80S85 109 113 65 145 90 173 58 200 80 233 47 270 61 300 28 330 48 365 14 399 28 420 5"
        stroke="#03a8c0"
        strokeWidth="3"
        strokeLinecap="round"
        pathLength="1"
      />
      <path d="M0 135H420M0 90H420M0 45H420" stroke="#123b3810" />
    </svg>
  );
}

export function CinematicOpening() {
  return (
    <section
      className={c.scene}
      data-scroll-scene
      data-cinematic
      data-tilt
      aria-labelledby="hero-title"
    >
      <div className={c.sticky}>
        <div className={c.aurora} aria-hidden="true" />
        <div className={c.horizon} aria-hidden="true" />
        <div className={c.intro} data-hero-intro>
          <span className={c.eyebrow}>A LITTLE CLARITY CHANGES EVERYTHING</span>
          <h1 id="hero-title">
            Months of finances.
            <br />
            <em>Organized in minutes.</em>
          </h1>
          <p>Your accounts. Your everyday life. Finally, together.</p>
          <Link href="/sign-up" className={c.cta}>
            Find your clarity <span aria-hidden="true">↗</span>
          </Link>
        </div>
        <div className={c.nextCopy}>
          <span className={c.eyebrow}>MEET YOUR BIGGER PICTURE</span>
          <h2>
            All the little things.
            <br />
            <em>One beautiful view.</em>
          </h2>
          <p>
            From your morning coffee to your next big adventure. Bring your
            money into focus with Clover.
          </p>
          <span className={c.platforms}>
            iOS <i /> Android <i /> Web
          </span>
        </div>
        <div
          className={c.stage}
          aria-label="Illustrative Clover dashboard with accounts, spending, and transactions"
        >
          <div className={c.world}>
            <div className={c.desktop}>
              <div className={c.desktopFrame}>
                <div className={c.browserBar}>
                  <span>
                    <i />
                    <i />
                    <i />
                  </span>
                  <small>clover.ph</small>
                  <b>↗</b>
                </div>
                <div className={c.desktopBody}>
                  <aside>
                    <img
                      src="/clover-name-teal.svg"
                      alt="Clover"
                      width="90"
                      height="28"
                    />
                    <span className={c.active}>⌂ &nbsp; Home</span>
                    <span>⇄ &nbsp; Transactions</span>
                    <span>▦ &nbsp; Accounts</span>
                    <span>◔ &nbsp; Reports</span>
                    <span>✦ &nbsp; Ask Clover</span>
                    <div className={c.sidebarMascot}>
                      <CloverMascot pose="welcome" size={90} />
                      <small>A little more clarity.</small>
                    </div>
                  </aside>
                  <div className={c.dashboard}>
                    <div className={c.dashHeading}>
                      <div>
                        <small>YOUR MONEY, AT A GLANCE</small>
                        <strong>A good day for a fresh start.</strong>
                      </div>
                      <span>PHP</span>
                    </div>
                    <div className={c.dashGrid}>
                      <div className={c.balance}>
                        <small>Bank + wallet balances</small>
                        <strong>
                          ₱55,090<span>.00</span>
                        </strong>
                        <MiniChart />
                        <div>
                          <span>Your bigger picture</span>
                          <b>More perspective. Less guesswork.</b>
                        </div>
                      </div>
                      <div className={c.spending}>
                        <small>Where It Went</small>
                        <div className={c.miniRing}>
                          <span>
                            ₱18,400<small>This month</small>
                          </span>
                        </div>
                        <div>
                          <i /> Food & Dining <b>40%</b>
                        </div>
                        <div>
                          <i /> Shopping <b>27%</b>
                        </div>
                      </div>
                      <div className={c.recent}>
                        <strong>The little things, accounted for.</strong>
                        {[
                          {
                            title: "Mendokoro Ramenba",
                            icon: "food-dining",
                            value: "−₱500",
                            detail: "Food & Dining · Maya",
                          },
                          {
                            title: "Weekend groceries",
                            icon: "shopping",
                            value: "−₱1,280",
                            detail: "Food & Dining · BPI",
                          },
                        ].map((t) => (
                          <div key={t.title}>
                            <img
                              src={`/figma-icons/categories/${t.icon}.svg`}
                              alt=""
                              width={30}
                              height={30}
                            />
                            <span>
                              {t.title}
                              <small>{t.detail}</small>
                            </span>
                            <b>{t.value}</b>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className={c.desktopFoot} />
            </div>
            <div className={c.phone}>
              <div className={c.phoneSide} />
              <div className={c.phoneScreen}>
                <div className={c.status}>
                  <b>9:41</b>
                  <span />
                  <b>••• ▰</b>
                </div>
                <div className={c.phoneHeader}>
                  <span>☰</span>
                  <strong>Accounts</strong>
                  <span>＋</span>
                </div>
                <div className={c.phoneSummary}>
                  <small>Your money, together</small>
                  <strong>₱55,090</strong>
                  <span>Bank + wallet balances</span>
                </div>
                <div className={c.phoneAccounts}>
                  {accountRows.map((a) => (
                    <div key={a.name} style={{ background: a.color }}>
                      <img
                        src={`/assets/banks/philippines/${a.file}`}
                        alt=""
                        width={34}
                        height={34}
                      />
                      <span>
                        {a.name}
                        <small>{a.kind}</small>
                      </span>
                      <strong>{a.amount}</strong>
                    </div>
                  ))}
                </div>
                <div className={c.phoneGoal}>
                  <span>✈</span>
                  <div>
                    Japan with friends
                    <small>Your next adventure is taking shape.</small>
                    <i>
                      <b />
                    </i>
                  </div>
                </div>
                <div className={c.phoneNav}>
                  <span>
                    ⌂<small>Home</small>
                  </span>
                  <span>
                    ⇄<small>Transactions</small>
                  </span>
                  <b>＋</b>
                  <span>
                    <img
                      src="/assets/mascots/velvet-compact.webp"
                      alt=""
                      width={25}
                      height={25}
                    />
                    <small>Ask Clover</small>
                  </span>
                  <span>
                    ●<small>Account</small>
                  </span>
                </div>
              </div>
              <span className={c.phoneButton} />
            </div>
            <div className={c.orbitReceipt}>
              <small>ONE LITTLE RECEIPT</small>
              <strong>MENDOKORO</strong>
              <span>Lunch. A little well deserved.</span>
              <hr />
              <div>
                Total <b>₱500.00</b>
              </div>
              <div className={c.receiptBarcode} />
              <i>Ready to become part of the picture.</i>
            </div>
            <div className={c.orbitInsight}>
              <span>↘</span>
              <div>
                <strong>₱2,800 less</strong>
                <small>spent this month</small>
              </div>
              <svg viewBox="0 0 70 38" aria-hidden="true">
                <path
                  d="M2 5L18 14 29 9 44 25 56 20 68 34"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                />
              </svg>
            </div>
            <div className={c.orbitMascot}>
              <CloverMascot pose="welcome" size={180} />
              <span>Hi, clearer days.</span>
            </div>
            <div className={c.orbitCategory}>
              <img
                src="/figma-icons/categories/food-dining.svg"
                alt=""
                width={32}
                height={32}
              />
              <span>Lunch, sorted.</span>
              <b>✓</b>
            </div>
          </div>
        </div>
        <div className={c.bottomLine}>
          <a href="#story">
            SCROLL INTO A CLEARER PICTURE <span aria-hidden="true">↓</span>
          </a>
          <span>Illustrative product preview</span>
        </div>
      </div>
    </section>
  );
}
