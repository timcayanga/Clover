import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import Script from "next/script";
import { LandingCloverBloom } from "@/components/landing-clover-bloom";
import { LandingCtaActions } from "@/components/landing-cta-actions";
import { LandingNav } from "@/components/landing-nav";
import { LandingStoryReveal } from "@/components/landing-story-reveal";
import { MarketingFooter } from "@/components/marketing-footer";

export const metadata: Metadata = {
  title: "More life. Less money admin. | Clover",
  description:
    "See how Clover turns the financial records you already have into organized transactions, clearer decisions, and more time for life.",
};

const lifeMoments = [
  {
    name: "Mia",
    image: "/assets/profiles/avatar_2.png",
    accent: "sun",
    kicker: "Planning ahead",
    title: "Japan is becoming a real plan.",
    copy: "Clover turned a holiday idea into a goal Mia can comfortably work toward each month.",
    badge: "Japan trip · 68%",
  },
  {
    name: "Alex & Sam",
    image: "/assets/profiles/avatar_4.png",
    accent: "coral",
    kicker: "Out with friends",
    title: "Dinner settled. No awkward follow-up.",
    copy: "The receipt became a shared expense, with every item and payment kept in one place.",
    badge: "4 friends · settled",
  },
  {
    name: "Dani",
    image: "/assets/profiles/avatar_7.png",
    accent: "violet",
    kicker: "Working independently",
    title: "A variable month finally makes sense.",
    copy: "Income, subscriptions, and everyday spending come together in one calm financial picture.",
    badge: "Cash flow · clear",
  },
] as const;

const fileTypes = [
  ["Statement", "12 months", "📄"],
  ["Receipt", "Lunch today", "🧾"],
  ["Screenshot", "Card activity", "📱"],
  ["Spreadsheet", "Old records", "▦"],
] as const;

function PersonAvatar({ src, alt, priority = false }: { src: string; alt: string; priority?: boolean }) {
  return <Image src={src} alt={alt} width={160} height={160} priority={priority} />;
}

function LandingActions({ authEnabled }: { authEnabled: boolean }) {
  if (authEnabled) {
    return <LandingCtaActions authEnabled />;
  }

  return (
    <>
      <Link className="button button-primary button-pill" href="/sign-up" prefetch={false}>Organize my finances for free</Link>
      <Link className="button button-secondary button-pill" href="/sign-in" prefetch={false}>Log in</Link>
    </>
  );
}

export default function ScrollableLandingPreviewPage() {
  const authEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? process.env.CLERK_PUBLISHABLE_KEY);

  return (
    <main id="main-content" tabIndex={-1} className="scroll-landing">
      <Script id="scroll-landing-force-light-theme" strategy="beforeInteractive">
        {`
          try {
            if (window.location.pathname === "/landing-preview") {
              document.documentElement.dataset.theme = "light";
              document.documentElement.style.colorScheme = "light";
            }
          } catch (error) {}
        `}
      </Script>

      <LandingNav />

      <section className="scroll-landing__hero" aria-labelledby="scroll-landing-title">
        <div className="scroll-landing__hero-glow scroll-landing__hero-glow--one" aria-hidden="true" />
        <div className="scroll-landing__hero-glow scroll-landing__hero-glow--two" aria-hidden="true" />

        <div className="scroll-landing__hero-copy">
          <p className="scroll-landing__eyebrow"><span aria-hidden="true">✦</span> Money clarity that keeps up with life</p>
          <h1 id="scroll-landing-title">
            More life.
            <span>Less money admin.</span>
          </h1>
          <p className="scroll-landing__hero-lede">
            Upload the financial records you already have. Clover organizes the details, explains what changed, and helps you take the next step—so money takes up less space in your day.
          </p>
          <div className="scroll-landing__hero-actions">
            <LandingActions authEnabled={authEnabled} />
          </div>
          <div className="scroll-landing__hero-proof" aria-label="Clover benefits">
            <span><b aria-hidden="true">✓</b> Start free</span>
            <span><b aria-hidden="true">✓</b> No manual rebuilding</span>
            <span><b aria-hidden="true">✓</b> You stay in control</span>
          </div>
        </div>

        <div className="scroll-life-stage" aria-label="Everyday moments made easier with Clover">
          <div className="scroll-life-stage__sun" aria-hidden="true" />
          <div className="scroll-life-stage__people">
            <div className="scroll-life-stage__person scroll-life-stage__person--back">
              <PersonAvatar src="/assets/profiles/avatar_4.png" alt="Illustrated Clover user" priority />
            </div>
            <div className="scroll-life-stage__person scroll-life-stage__person--front">
              <PersonAvatar src="/assets/profiles/avatar_2.png" alt="Illustrated Clover user" priority />
            </div>
            <div className="scroll-life-stage__person scroll-life-stage__person--side">
              <PersonAvatar src="/assets/profiles/avatar_7.png" alt="Illustrated Clover user" priority />
            </div>
          </div>
          <div className="scroll-life-stage__card scroll-life-stage__card--receipt">
            <span aria-hidden="true">🧾</span>
            <div><small>Lunch with friends</small><strong>Split and settled</strong></div>
            <b>✓</b>
          </div>
          <div className="scroll-life-stage__card scroll-life-stage__card--goal">
            <span aria-hidden="true">✈️</span>
            <div><small>Japan trip</small><strong>68% on the way</strong></div>
          </div>
          <div className="scroll-life-stage__card scroll-life-stage__card--insight">
            <span aria-hidden="true">↗</span>
            <div><small>This month</small><strong>Dining is down 12%</strong></div>
          </div>
          <div className="scroll-life-stage__caption">Clover handles the details in the background.</div>
        </div>
      </section>

      <section className="scroll-landing__ticker" aria-label="What Clover works with">
        <div className="scroll-landing__ticker-track">
          {[...fileTypes, ...fileTypes].map(([title, detail, icon], index) => (
            <div className="scroll-landing__file-chip" key={`${title}-${index}`} aria-hidden={index >= fileTypes.length}>
              <span>{icon}</span>
              <div><strong>{title}</strong><small>{detail}</small></div>
              <b>→</b>
            </div>
          ))}
        </div>
      </section>

      <LandingStoryReveal as="section" className="scroll-landing__intro">
        <p className="scroll-landing__eyebrow">Your records already tell the story</p>
        <h2>Start with what you have.<br /><span>Get back what you need.</span></h2>
        <p>Statements, receipts, screenshots, and spreadsheets become one organized view of your money—without weeks of manual entry.</p>
        <div className="scroll-landing__steps" aria-label="How Clover works">
          {[
            ["01", "Upload", "Bring the records already sitting on your phone or computer."],
            ["02", "Organize", "Clover cleans names, finds accounts, and structures transactions."],
            ["03", "Understand", "See the patterns, changes, and decisions hidden in the details."],
            ["04", "Improve", "Take one useful next step without rebuilding everything again."],
          ].map(([number, title, copy]) => (
            <article key={number}>
              <span>{number}</span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </LandingStoryReveal>

      <LandingStoryReveal as="section" className="scroll-landing__product-story scroll-landing__product-story--aqua">
        <div className="scroll-landing__product-copy">
          <p className="scroll-landing__eyebrow">From scattered to sorted</p>
          <h2>Your financial history,<br /><span>ready when life asks for it.</span></h2>
          <p>Search clean transactions, see every account in context, and review anything Clover is unsure about. The raw record stays traceable, while your everyday view stays useful.</p>
          <ul>
            <li><span aria-hidden="true">✓</span> Merchant names that make sense</li>
            <li><span aria-hidden="true">✓</span> Categories that improve with your feedback</li>
            <li><span aria-hidden="true">✓</span> Multiple currencies in one financial picture</li>
          </ul>
        </div>
        <div className="scroll-landing__product-frame scroll-landing__product-frame--tilted">
          <Image
            src="/assets/landing page/Organize months of money.png"
            alt="Organized Clover transactions and accounts"
            width={1536}
            height={1024}
            sizes="(max-width: 900px) 92vw, 48vw"
          />
          <div className="scroll-landing__mini-note scroll-landing__mini-note--clean"><span>✨</span><b>Ready to understand</b><small>Months organized in one place</small></div>
        </div>
      </LandingStoryReveal>

      <LandingStoryReveal as="section" className="scroll-landing__people-section">
        <div className="scroll-landing__section-heading">
          <p className="scroll-landing__eyebrow">Built around real life</p>
          <h2>Different money stories.<br /><span>The same feeling of relief.</span></h2>
        </div>
        <div className="scroll-landing__people-grid">
          {lifeMoments.map((moment) => (
            <article className={`scroll-person-card scroll-person-card--${moment.accent}`} key={moment.name}>
              <div className="scroll-person-card__portrait">
                <PersonAvatar src={moment.image} alt={`Illustration of ${moment.name}`} />
                <span>{moment.badge}</span>
              </div>
              <div className="scroll-person-card__copy">
                <small>{moment.kicker}</small>
                <h3>{moment.title}</h3>
                <p>{moment.copy}</p>
                <strong>{moment.name}</strong>
              </div>
            </article>
          ))}
        </div>
      </LandingStoryReveal>

      <LandingStoryReveal as="section" className="scroll-landing__adviser-story">
        <div className="scroll-landing__adviser-copy">
          <p className="scroll-landing__eyebrow">Planning that starts with a conversation</p>
          <h2>Ask in your own words.<br /><span>Leave with a real plan.</span></h2>
          <p>Adviser understands the page you are on and the financial picture you choose to share. It asks useful follow-ups, then turns the conversation into something you can open, edit, and act on.</p>
        </div>
        <div className="scroll-chat" aria-label="Example conversation with Clover Adviser">
          <div className="scroll-chat__topbar">
            <Image src="/clover-mark.svg" alt="" width={34} height={34} aria-hidden="true" />
            <div><strong>Adviser</strong><small>Planning with you</small></div>
            <span>•••</span>
          </div>
          <div className="scroll-chat__thread">
            <p className="scroll-chat__bubble scroll-chat__bubble--user">Help me save for a trip to Japan next spring.</p>
            <p className="scroll-chat__bubble scroll-chat__bubble--clover">Love that plan. How many people are travelling, and what would feel comfortable to set aside each month?</p>
            <p className="scroll-chat__bubble scroll-chat__bubble--user">Just me. Around ₱12,000 a month.</p>
            <div className="scroll-chat__plan-card">
              <div className="scroll-chat__plan-icon">✈️</div>
              <div><small>Suggested goal</small><strong>Japan in spring</strong><span>₱12,000 monthly · comfortably paced</span></div>
              <b>Open →</b>
            </div>
            <p className="scroll-chat__bubble scroll-chat__bubble--clover">Here is a starting plan based on your timeline. We can change the amount or date together anytime.</p>
          </div>
        </div>
      </LandingStoryReveal>

      <LandingStoryReveal as="section" className="scroll-landing__product-story scroll-landing__product-story--coral">
        <div className="scroll-landing__product-copy">
          <p className="scroll-landing__eyebrow">Money together, without the tension</p>
          <h2>Enjoy the moment.<br /><span>Clover remembers who owes what.</span></h2>
          <p>Turn a transaction or receipt into a shared expense. Split by item or equally, track payments, and keep commitments visible for friends, couples, families, or housemates.</p>
          <div className="scroll-landing__avatar-line" aria-label="A shared Clover Circle">
            {[3, 5, 8, 9].map((avatar) => (
              <Image key={avatar} src={`/assets/profiles/avatar_${avatar}.png`} alt="Circle member" width={72} height={72} />
            ))}
            <span>4 people · everyone settled</span>
          </div>
        </div>
        <div className="scroll-landing__product-frame">
          <Image
            src="/assets/landing page/Give every group one place to stay aligned.png"
            alt="A shared Circle in Clover"
            width={1536}
            height={1024}
            sizes="(max-width: 900px) 92vw, 48vw"
          />
          <div className="scroll-landing__mini-note scroll-landing__mini-note--settled"><span>🤝</span><b>All settled</b><small>No awkward reminders needed</small></div>
        </div>
      </LandingStoryReveal>

      <LandingStoryReveal as="section" className="scroll-landing__balance-story">
        <div className="scroll-landing__balance-art" aria-hidden="true">
          <span className="scroll-landing__orbit scroll-landing__orbit--one" />
          <span className="scroll-landing__orbit scroll-landing__orbit--two" />
          <div className="scroll-landing__balance-person"><PersonAvatar src="/assets/profiles/avatar_10.png" alt="" /></div>
          <div className="scroll-landing__balance-card scroll-landing__balance-card--goal"><small>Emergency fund</small><strong>82%</strong><span><i /></span></div>
          <div className="scroll-landing__balance-card scroll-landing__balance-card--report"><small>Last 30 days</small><strong>₱8,420 saved</strong><b>↗</b></div>
          <div className="scroll-landing__balance-card scroll-landing__balance-card--quiet"><small>Subscriptions reviewed</small><strong>2 fewer things to think about</strong></div>
        </div>
        <div className="scroll-landing__balance-copy">
          <p className="scroll-landing__eyebrow">Clarity that creates breathing room</p>
          <h2>Your money should support your life—<span>not interrupt it.</span></h2>
          <p>Reports, recurring payments, budgets, goals, and investments stay connected. You can understand today and plan tomorrow without maintaining five separate systems.</p>
          <div className="scroll-landing__life-tags">
            {['A calmer Sunday', 'A trip with a plan', 'A bill remembered', 'A goal moving forward'].map((tag) => <span key={tag}>{tag}</span>)}
          </div>
        </div>
      </LandingStoryReveal>

      <LandingStoryReveal as="section" className="scroll-landing__trust-story">
        <div className="scroll-landing__trust-copy">
          <p className="scroll-landing__eyebrow">Private by design</p>
          <h2>Your financial life stays <span>yours.</span></h2>
          <p>You decide what to upload, what to confirm, and what to remove. Clover keeps imported records traceable, never silently overwrites confirmed financial data, and does not sell your personal information.</p>
          <div className="scroll-landing__trust-points">
            <span><b>✓</b> Review before confirming</span>
            <span><b>✓</b> Correct anything</span>
            <span><b>✓</b> Delete your data</span>
          </div>
        </div>
        <div className="scroll-landing__trust-visual">
          <Image src="/assets/landing page/security.png" alt="Clover privacy and security controls" width={612} height={408} sizes="(max-width: 900px) 92vw, 45vw" />
        </div>
      </LandingStoryReveal>

      <LandingStoryReveal as="section" className="scroll-landing__closing">
        <div className="scroll-landing__closing-people" aria-hidden="true">
          {[2, 4, 7, 3, 9].map((avatar) => (
            <div key={avatar}>
              <PersonAvatar src={`/assets/profiles/avatar_${avatar}.png`} alt="" />
            </div>
          ))}
        </div>
        <LandingCloverBloom />
        <p className="scroll-landing__eyebrow">Bring the files. Keep the life.</p>
        <h2>Spend less time managing money.<br /><span>Spend more time using it well.</span></h2>
        <p>Start with the records you already have. Clover will help you find the clearer next step.</p>
        <div className="scroll-landing__closing-actions">
          <LandingActions authEnabled={authEnabled} />
        </div>
      </LandingStoryReveal>

      <MarketingFooter />
    </main>
  );
}
