"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { CloverMascot } from "@/components/clover-mascot";
import { BloomMark } from "./bloom-mark";
import { CinematicOpening } from "./cinematic-opening";
import s from "./motion-landing.module.css";

const banks = [
  {
    name: "BPI",
    file: "bpi.png",
    type: "Savings",
    amount: "₱48,250",
    color: "#a71229",
  },
  {
    name: "Maya",
    file: "maya.png",
    type: "Wallet",
    amount: "₱6,840",
    color: "#102924",
  },
  {
    name: "UnionBank",
    file: "unionbank.jpg",
    type: "Credit card",
    amount: "₱8,200",
    color: "#d76413",
  },
];
const transactions = [
  {
    name: "Salary",
    detail: "BPI · Income",
    amount: "+₱45,000",
    icon: "income",
    positive: true,
  },
  {
    name: "Mendokoro Ramenba",
    detail: "Maya · Food & Dining",
    amount: "−₱500",
    icon: "food-dining",
  },
  {
    name: "Weekend groceries",
    detail: "BPI · Food & Dining",
    amount: "−₱1,280",
    icon: "food-dining",
  },
];
const questions = [
  {
    question: "Where did my money go?",
    answer:
      "Food & Dining is your largest spending category this month. Here’s how the rest adds up.",
    kind: "chart",
  },
  {
    question: "Help me plan for a trip",
    answer:
      "Let’s make your Japan trip a goal. How much would you like to save, and when are you hoping to go?",
    kind: "goal",
  },
  {
    question: "Add lunch, ₱500",
    answer: "Lunch · ₱500 · Food & Dining. Which account did you pay from?",
    kind: "transaction",
  },
] as const;
const clamp = (value: number) => Math.max(0, Math.min(1, value));

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
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function BankLogo({ file }: { file: string }) {
  return (
    <img
      src={`/assets/banks/philippines/${file}`}
      alt=""
      width={40}
      height={40}
      loading="lazy"
    />
  );
}
function Receipt({ mini = false }: { mini?: boolean }) {
  return (
    <div className={`${s.receipt} ${mini ? s.miniReceipt : ""}`}>
      <span className={s.receiptTop}>A LITTLE EVERYDAY LIFE</span>
      <strong>MENDOKORO</strong>
      <small>Lunch with a friend</small>
      <div>
        <span>Ramen</span>
        <b>₱440.00</b>
      </div>
      <div>
        <span>Drink</span>
        <b>₱60.00</b>
      </div>
      <div className={s.receiptTotal}>
        <span>TOTAL</span>
        <b>₱500.00</b>
      </div>
      <div className={s.barcode} aria-hidden="true" />
      <small>Thank you. See you again.</small>
    </div>
  );
}
function Ledger() {
  return (
    <div className={s.ledger}>
      <div className={s.panelHeading}>
        <span>Transactions</span>
        <img
          src="/assets/mascots/velvet-compact.webp"
          alt=""
          width={32}
          height={32}
        />
      </div>
      <div className={s.ledgerSub}>A little more organized already.</div>
      {transactions.map((t, i) => (
        <div
          className={s.transaction}
          key={t.name}
          style={{ "--i": i } as CSSProperties}
        >
          <img
            src={`/figma-icons/categories/${t.icon}.svg`}
            alt=""
            width={32}
            height={32}
          />
          <div>
            <strong>{t.name}</strong>
            <small>{t.detail}</small>
          </div>
          <b className={t.positive ? s.positive : ""}>{t.amount}</b>
        </div>
      ))}
      <div className={s.ledgerFooter}>
        <span className={s.check}>✓</span> Your records. Ready to explore.
      </div>
    </div>
  );
}
function Donut({
  values = [40, 27, 20, 13],
  small = false,
}: {
  values?: number[];
  small?: boolean;
}) {
  const colors = ["#03a8c0", "#71e6ba", "#a99bd4", "#ebba6b"];
  let offset = 0;
  return (
    <svg
      className={`${s.donut} ${small ? s.smallDonut : ""}`}
      viewBox="0 0 240 240"
      role="img"
      aria-label="Illustrative spending by category"
    >
      <circle
        cx="120"
        cy="120"
        r="88"
        fill="none"
        stroke="#e7f1ee"
        strokeWidth="29"
      />
      {values.map((value, i) => {
        const start = offset;
        offset += value;
        return (
          <circle
            key={i}
            cx="120"
            cy="120"
            r="88"
            fill="none"
            stroke={colors[i]}
            strokeWidth="29"
            pathLength="100"
            strokeDasharray={`${value - 1.2} ${101.2 - value}`}
            strokeDashoffset={-start}
            transform="rotate(-90 120 120)"
          />
        );
      })}
    </svg>
  );
}
function DimensionalDonut({ values }: { values: number[] }) {
  return (
    <div className={s.donutPerspective}>
      <div className={s.donutSolid}>
        {Array.from({ length: 10 }, (_, index) => (
          <div
            className={s.donutDepth}
            key={index}
            aria-hidden="true"
            style={{ "--layer": index } as CSSProperties}
          >
            <Donut values={values} />
          </div>
        ))}
        <div className={s.donutFace}>
          <Donut values={values} />
        </div>
      </div>
    </div>
  );
}

function AccountCard({
  bank,
  index,
}: {
  bank: (typeof banks)[number];
  index: number;
}) {
  return (
    <div
      className={s.bankCard}
      style={{ "--bank": bank.color, "--i": index } as CSSProperties}
    >
      <div>
        <BankLogo file={bank.file} />
        <span>
          {bank.name}
          <small>{bank.type}</small>
        </span>
        <span className={s.cardSignal}>◔</span>
      </div>
      <strong>{bank.amount}</strong>
      <div className={s.cardBottom}>
        <span>•••• {index === 0 ? "3012" : index === 1 ? "2608" : "8037"}</span>
        <span>Clover</span>
      </div>
    </div>
  );
}

export function MotionLanding() {
  const root = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [month, setMonth] = useState<"September" | "October">("October");
  const [question, setQuestion] = useState(0);
  const motion = !paused && !reduced;

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const scenes = [
      ...node.querySelectorAll<HTMLElement>("[data-scroll-scene]"),
    ];
    const reveals = [...node.querySelectorAll<HTMLElement>("[data-reveal]")];
    const fans = [...node.querySelectorAll<HTMLElement>("[data-fan]")];
    const depths = [...node.querySelectorAll<HTMLElement>("[data-depth]")];
    node.dataset.enhanced = "true";
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.setAttribute("data-visible", "true");
            observer.unobserve(entry.target);
          }
        }),
      { threshold: 0.12 },
    );
    reveals.forEach((el) => observer.observe(el));
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    let pointerFrame = 0;
    let tilted: HTMLElement | null = null;
    const resetTilt = () => {
      tilted?.style.setProperty("--mx", "0");
      tilted?.style.setProperty("--my", "0");
      tilted = null;
    };
    const movePointer = (event: PointerEvent) => {
      if (!motion || !finePointer.matches) return;
      const target =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>("[data-tilt]")
          : null;
      if (target !== tilted) resetTilt();
      tilted = target;
      cancelAnimationFrame(pointerFrame);
      if (!target) return;
      const { clientX, clientY } = event;
      pointerFrame = requestAnimationFrame(() => {
        const rect = target.getBoundingClientRect();
        target.style.setProperty(
          "--mx",
          String((clientX - rect.left) / rect.width - 0.5),
        );
        target.style.setProperty(
          "--my",
          String((clientY - rect.top) / rect.height - 0.5),
        );
      });
    };
    node.addEventListener("pointermove", movePointer, { passive: true });
    node.addEventListener("pointerleave", resetTilt);
    let frame = 0;
    const draw = () => {
      frame = 0;
      const height = window.innerHeight;
      scenes.forEach((scene) => {
        const rect = scene.getBoundingClientRect();
        const p = motion
          ? clamp(-rect.top / Math.max(1, rect.height - height))
          : 1;
        scene.style.setProperty("--p", String(p));
        scene.style.setProperty("--intro", String(clamp(p / 0.3)));
        scene.style.setProperty("--focus", String(clamp((p - 0.3) / 0.24)));
        scene.style.setProperty("--gather", String(clamp(p / 0.52)));
        scene.style.setProperty(
          "--organized",
          String(clamp((p - 0.34) / 0.22)),
        );
        scene.dataset.step = p < 0.48 ? "before" : "after";
        const intro = scene.querySelector<HTMLElement>("[data-hero-intro]");
        if (intro) intro.inert = motion && p > 0.25;
      });
      fans.forEach((fan) => {
        const top = fan.getBoundingClientRect().top;
        fan.style.setProperty(
          "--spread",
          String(motion ? clamp((height * 0.92 - top) / (height * 0.5)) : 1),
        );
      });
      depths.forEach((el) => {
        const rect = el.getBoundingClientRect();
        el.style.setProperty(
          "--depth",
          String(
            motion ? clamp((height - rect.top) / (height + rect.height)) : 0.5,
          ),
        );
      });
      const scrollable = document.documentElement.scrollHeight - height;
      node.style.setProperty(
        "--read",
        String(clamp(window.scrollY / Math.max(1, scrollable))),
      );
    };
    const queue = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };
    draw();
    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    return () => {
      observer.disconnect();
      node.removeEventListener("pointermove", movePointer);
      node.removeEventListener("pointerleave", resetTilt);
      cancelAnimationFrame(pointerFrame);
      resetTilt();
      window.removeEventListener("scroll", queue);
      window.removeEventListener("resize", queue);
      cancelAnimationFrame(frame);
    };
  }, [motion]);

  return (
    <div ref={root} className={s.page} data-motion={motion ? "on" : "off"}>
      <a className={s.skip} href="#story">
        Skip to the story
      </a>
      <header className={s.nav}>
        <Link href="/" className={s.brand} aria-label="Clover home">
          <img src="/clover-mark.svg" alt="" width={31} height={31} />
          <img
            src="/clover-name-teal.svg"
            alt="Clover"
            width={105}
            height={32}
          />
        </Link>
        <nav aria-label="Explore Clover">
          <a href="#story">The story</a>
          <a href="#clarity">The possibilities</a>
          <Link href="/pricing">Plans</Link>
        </nav>
        <div className={s.navActions}>
          <button
            className={s.motionControl}
            onClick={() => setPaused((v) => !v)}
            aria-label={
              reduced
                ? "Motion reduced by device setting"
                : motion
                  ? "Pause motion"
                  : "Resume motion"
            }
            aria-pressed={!motion}
            disabled={reduced}
            title={
              reduced
                ? "Reduced motion follows your device setting"
                : motion
                  ? "Pause motion"
                  : "Resume motion"
            }
          >
            {motion ? (
              <span aria-hidden="true">Ⅱ</span>
            ) : (
              <span aria-hidden="true">▷</span>
            )}
          </button>
          <Link href="/sign-up" className={s.navCta}>
            Start free <Arrow />
          </Link>
        </div>
        <div className={s.readProgress} aria-hidden="true" />
      </header>
      <main id="main-content">
        <CinematicOpening />

        <section
          id="story"
          className={s.paperStory}
          data-scroll-scene
          aria-label="From scattered records to organized transactions"
        >
          <div className={s.storySticky}>
            <div className={s.chapterNumber}>
              01 <span>BRING IT TOGETHER</span>
            </div>
            <div className={s.storyCopy}>
              <div className={s.beforeCopy}>
                <h2>
                  Life happens. <br />
                  <em>
                    Paperwork <br />
                    piles up.
                  </em>
                </h2>
                <p>
                  A receipt here. A statement there.
                  <br />
                  Your money shouldn’t be a puzzle.
                </p>
              </div>
              <div className={s.afterCopy}>
                <h2>
                  Bring the pieces.
                  <br />
                  <em>
                    Clover helps
                    <br />
                    connect them.
                  </em>
                </h2>
                <p>
                  Upload statements, receipts, or spreadsheets. Review the
                  details, then see your transactions fall into place.
                </p>
              </div>
            </div>
            <div className={s.collectStage}>
              <div className={s.collectGlow} />
              <div className={s.paperA}>
                <Receipt />
              </div>
              <div className={s.paperB}>
                <div className={s.statement}>
                  <BankLogo file="bpi.png" />
                  <small>ACCOUNT STATEMENT</small>
                  <h3>A month of life.</h3>
                  <div>
                    Payroll <b>+₱45,000</b>
                  </div>
                  <div>
                    Groceries <b>−₱1,280</b>
                  </div>
                  <div>
                    Electricity <b>−₱2,450</b>
                  </div>
                  <div>
                    Sunday coffee <b>−₱180</b>
                  </div>
                  <span className={s.paperLines} />
                </div>
              </div>
              <div className={s.paperC}>
                <span className={s.fileTile}>CSV</span>
                <strong>Your old spreadsheet</strong>
                <small>There’s a place for it here.</small>
              </div>
              <div className={s.collectSymbol}>
                <img src="/clover-mark.svg" alt="" width={110} height={110} />
                <span className={s.scanOrbit} />
              </div>
              <div className={s.organizedLedger}>
                <Ledger />
                <div className={s.reviewNote}>
                  <span>✦</span> Clover suggests. You stay in control.
                </div>
              </div>
              <div className={s.collectCaption}>
                <span>STATEMENTS</span>
                <i /> <span>RECEIPTS</span>
                <i /> <span>SPREADSHEETS</span>
              </div>
            </div>
            <div className={s.sceneTimeline}>
              <span>Scattered</span>
              <div>
                <i />
              </div>
              <span>Organized</span>
            </div>
          </div>
        </section>

        <section
          className={s.accountsSection}
          id="together"
          data-reveal
          data-depth
        >
          <div className={s.sectionIntro}>
            <span className={s.eyebrow}>02 / ONE FINANCIAL PICTURE</span>
            <h2>
              Different accounts.
              <br />
              <em>
                One less thing
                <br className={s.mobileBreak} /> to juggle.
              </em>
            </h2>
            <p>
              Banks, wallets, credit cards, cash, and investments.
              <br />
              See how they fit into your life.
            </p>
          </div>
          <div className={s.accountFan} data-fan data-tilt>
            {banks.map((bank, index) => (
              <AccountCard key={bank.name} bank={bank} index={index} />
            ))}
            <div className={s.fanOrbit} />
          </div>
          <div className={s.entryWays}>
            <div>
              <span>↗</span>
              <strong>Connect</strong>
              <p>Link a supported bank.</p>
            </div>
            <div>
              <span>↑</span>
              <strong>Upload</strong>
              <p>Start with files you have.</p>
            </div>
            <div>
              <span>✎</span>
              <strong>Add manually</strong>
              <p>Make it your own.</p>
            </div>
          </div>
          <p className={s.finePrint}>
            Bank connections depend on your region, institution, and plan.
            Illustrative balances.
          </p>
        </section>

        <section
          id="clarity"
          className={s.insightSection}
          data-reveal
          data-depth
        >
          <div className={s.insightCopy}>
            <span className={s.eyebrow}>03 / MAKE SENSE OF IT</span>
            <h2>
              Less
              <br />
              <span className={s.outline}>“where’d it go?”</span>
              <br />
              <em>More “now I see.”</em>
            </h2>
            <p>
              Find the patterns behind your spending. Compare months, explore
              categories, and understand what changed.
            </p>
            <Link href="/features/understand-your-money" className={s.textLink}>
              Explore your bigger picture <Arrow />
            </Link>
          </div>
          <div className={s.reportScene} data-tilt>
            <div className={s.reportCard}>
              <div className={s.panelHeading}>
                <span>Where It Went</span>
                <span className={s.sampleTag}>SAMPLE</span>
              </div>
              <div className={s.monthToggle} aria-label="Example report month">
                {(["September", "October"] as const).map((m) => (
                  <button
                    key={m}
                    aria-pressed={month === m}
                    onClick={() => setMonth(m)}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <div className={s.chartWrap}>
                <DimensionalDonut
                  values={
                    month === "October" ? [40, 27, 20, 13] : [49, 21, 18, 12]
                  }
                />
                <div className={s.chartCenter}>
                  <small>Total spending</small>
                  <strong>{month === "October" ? "₱18,400" : "₱21,200"}</strong>
                </div>
              </div>
              <div className={s.reportLegend}>
                {[
                  "Food & Dining",
                  "Shopping",
                  "Bills & Utilities",
                  "Everything else",
                ].map((name, i) => (
                  <div key={name}>
                    <i
                      style={{
                        background: [
                          "#03a8c0",
                          "#71e6ba",
                          "#a99bd4",
                          "#ebba6b",
                        ][i],
                      }}
                    />
                    <span>{name}</span>
                    <b>
                      {
                        (month === "October"
                          ? [40, 27, 20, 13]
                          : [49, 21, 18, 12])[i]
                      }
                      %
                    </b>
                  </div>
                ))}
              </div>
            </div>
            <div className={s.insightNote} key={month}>
              <span>↘</span>
              <div>
                <strong>
                  {month === "October"
                    ? "₱2,800 less this month"
                    : "A starting point for next month"}
                </strong>
                <small>
                  {month === "October"
                    ? "Small changes. A clearer picture."
                    : "Your patterns become easier to see."}
                </small>
              </div>
            </div>
            <span className={s.tryHint}>Try switching months ↗</span>
          </div>
        </section>

        <section className={s.askSection} id="ask" data-reveal>
          <div className={s.askAura} aria-hidden="true" />
          <div className={s.askCopy}>
            <span className={s.eyebrow}>04 / A FRIENDLIER WAY FORWARD</span>
            <h2>
              Your questions.
              <br />
              <em>
                A little Clover
                <br />
                perspective.
              </em>
            </h2>
            <p>
              Ask about your spending. Talk through a goal. Or add a transaction
              in your own words.
            </p>
            <div className={s.askMascot}>
              <CloverMascot pose="chat" size={300} />
              <span>Hi. Let’s figure it out.</span>
            </div>
          </div>
          <div className={s.chatPreview}>
            <div className={s.chatHeading}>
              <img
                src="/assets/mascots/velvet-compact.webp"
                alt=""
                width={42}
                height={42}
              />
              <div>
                <strong>Ask Clover</strong>
                <small>A clearer next step starts here</small>
              </div>
              <span>✦</span>
            </div>
            <div className={s.chatBody} key={question} aria-live="polite">
              <div className={s.userBubble}>{questions[question].question}</div>
              <div className={s.cloverMessage}>
                <img
                  src="/assets/mascots/velvet-compact.webp"
                  alt=""
                  width={29}
                  height={29}
                />
                <div>
                  <strong>Clover</strong>
                  <p>{questions[question].answer}</p>
                  {questions[question].kind === "chart" ? (
                    <div className={s.chatChart}>
                      <Donut small />
                      <div>
                        <strong>October spending</strong>
                        <span>Food & Dining · 40%</span>
                        <span>Shopping · 27%</span>
                        <span>Bills & more · 33%</span>
                      </div>
                    </div>
                  ) : questions[question].kind === "goal" ? (
                    <div className={s.chatGoal}>
                      <span>✈</span>
                      <strong>Japan, here you come.</strong>
                      <small>One goal. A plan you can build on.</small>
                    </div>
                  ) : (
                    <div className={s.chatTransaction}>
                      <img
                        src="/figma-icons/categories/food-dining.svg"
                        alt=""
                        width={32}
                        height={32}
                      />
                      <div>
                        <strong>Lunch</strong>
                        <small>Food & Dining</small>
                      </div>
                      <b>₱500</b>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className={s.questionChoices}>
              <small>TRY A QUESTION</small>
              {questions.map((q, i) => (
                <button
                  key={q.question}
                  aria-pressed={question === i}
                  onClick={() => setQuestion(i)}
                >
                  {q.question}
                  <Arrow />
                </button>
              ))}
            </div>
            <span className={s.chatFootnote}>
              Illustrative conversation. Your answers use your own records.
            </span>
          </div>
        </section>

        <section className={s.lifeSection} data-reveal>
          <div className={s.sectionIntro}>
            <span className={s.eyebrow}>
              05 / MONEY IS ONLY PART OF THE STORY
            </span>
            <h2>
              Make room
              <br />
              for <em>what matters.</em>
            </h2>
          </div>
          <div className={s.lifeGrid}>
            <div className={s.goalScene}>
              <div className={s.goalArt}>
                <span className={s.goalOrbit} />
                <CloverMascot pose="savings" size={220} />
                <span className={s.floatingCoin}>₱</span>
                <span className={s.floatingStar}>✦</span>
              </div>
              <div className={s.goalPreview}>
                <span>THE NEXT ADVENTURE</span>
                <strong>Japan with friends</strong>
                <div>
                  <i />
                </div>
                <small>
                  ₱32,000 of ₱50,000 <b>64%</b>
                </small>
              </div>
              <h3>Something to look forward to.</h3>
              <p>
                Turn “someday” into a savings goal. Track your progress
                alongside everyday spending.
              </p>
            </div>
            <div className={s.togetherScene}>
              <div className={s.peopleOrbit}>
                <span>J</span>
                <span>A</span>
                <span>M</span>
                <img src="/clover-mark.svg" alt="" width={70} height={70} />
                <svg viewBox="0 0 350 220" aria-hidden="true">
                  <path d="M70 55Q175 180 285 60M70 55Q35 180 180 190M285 60Q305 175 180 190" />
                </svg>
              </div>
              <div className={s.splitPreview}>
                <strong>Weekend dinner</strong>
                <div>
                  <span>Alex paid</span>
                  <b>₱1,800</b>
                </div>
                <div>
                  <span>Your share</span>
                  <b>₱600</b>
                </div>
                <small>Shared clearly. Enjoyed together.</small>
              </div>
              <h3>Good company. Clear money.</h3>
              <p>
                Split a bill with friends, or make a Circle for your household’s
                shared expenses, budgets, and goals.
              </p>
            </div>
          </div>
        </section>

        <section className={s.trustSection} data-reveal>
          <span className={s.eyebrow}>YOUR MONEY STORY STAYS YOURS</span>
          <div>
            <h3>You have the final say.</h3>
            <p>Review suggested details and correct them.</p>
          </div>
          <div>
            <h3>Take your data with you.</h3>
            <p>Export your records when you need them.</p>
          </div>
          <div>
            <h3>You stay in control.</h3>
            <p>Clover doesn’t move money on your behalf.</p>
          </div>
        </section>

        <section className={s.finale} id="start" data-reveal data-depth>
          <div className={s.finaleHalo} />
          <div className={s.bloom}>
            <div className={s.bloomSolid}>
              {Array.from({ length: 12 }, (_, index) => (
                <img
                  src="/clover-mark.svg"
                  alt=""
                  aria-hidden="true"
                  key={index}
                  style={{ "--layer": index } as CSSProperties}
                  width={124}
                  height={124}
                />
              ))}
              <BloomMark />
            </div>
          </div>
          <span className={s.eyebrow}>YOUR NEXT CHAPTER</span>
          <h2>
            A little clarity.
            <br />
            <em>A lot more possibility.</em>
          </h2>
          <p>
            Start where you are.
            <br />
            Clover will help you take it from there.
          </p>
          <Link href="/sign-up" className={s.darkCta}>
            Start with Clover. It’s free. <Arrow />
          </Link>
          <div className={s.finalLinks}>
            <Link href="/pricing">Find your plan</Link>
            <Link href="/sign-in">Already with Clover? Sign in</Link>
          </div>
          <span className={s.finaleWord} aria-hidden="true">
            clover
          </span>
        </section>
      </main>
      <footer className={s.footer}>
        <Link href="/" className={s.brand} aria-label="Clover home">
          <img src="/clover-mark.svg" alt="" width={25} height={25} />
          <img
            src="/clover-name-teal.svg"
            alt="Clover"
            width={89}
            height={28}
          />
        </Link>
        <span>Money looks better from here.</span>
        <nav aria-label="Footer">
          <Link href="/help">Help</Link>
          <Link href="/privacy-policy">Privacy</Link>
          <Link href="/terms-of-service">Terms</Link>
          <Link href="/contact-us">Contact</Link>
        </nav>
        <small>Design preview · Illustrative data and interactions</small>
      </footer>
    </div>
  );
}
