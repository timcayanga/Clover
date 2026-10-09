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

function PaperTrail() {
  return (
    <div className={s.paperTrail} aria-hidden="true">
      {["Statement", "Receipt", "Notes"].map((label, index) => (
        <div
          className={s.paper}
          key={label}
          style={{ "--sheet": index } as CSSProperties}
        >
          <img src="/clover-mark.svg" width="24" height="24" alt="" />
          <span>{label}</span>
          <i />
          <i />
          <i />
          <i />
        </div>
      ))}
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
          <a href="#breathing-room">Discover Clover</a>
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
          <div className={s.heroArt}>
            <StoryPhoto
              eager
              desktop="landing-story-v3/01-organize"
              mobile="landing-story-v3/01-organize-mobile"
              alt="Friends making travel plans at home while one person brings her receipts and statements together."
            />
          </div>
          <div className={s.heroVeil} aria-hidden="true" />
          <div className={s.heroCopy}>
            <Heading
              hero
              text="Less time piecing your finances together. More room for what matters to you."
            >
              Months of finances.
              <br />
              <em>Organized in minutes.</em>
            </Heading>
            <Action>Start free</Action>
          </div>
          <PaperTrail />
          <a
            className={s.scrollArrow}
            href="#breathing-room"
            aria-label="Explore Clover"
          >
            <Icon kind="chevron" />
          </a>
        </ScrollScene>

        <ScrollScene id="breathing-room" className={s.evening}>
          <div className={s.storyGrid}>
            <Heading text="Connect a bank, upload your records, or add a few words. Clover helps with the sorting. You keep the final say.">
              Your evening.
              <br />
              <em>Back to you.</em>
            </Heading>
            <div className={s.memoryStage}>
              <div className={s.memoryBack} aria-hidden="true" />
              <div className={s.memory}>
                <StoryPhoto
                  desktop="landing-story-v3/07-records-away"
                  mobile="landing-story-v3/07-records-away-mobile"
                  alt="The paperwork put away and the laptop closed at the end of the day."
                />
              </div>
              <PaperTrail />
              <div className={s.quietCheck} aria-hidden="true">
                <img src="/clover-mark.svg" width="34" height="34" alt="" />
                <Icon kind="check" />
              </div>
            </div>
          </div>
        </ScrollScene>

        <ScrollScene id="a-little-clarity" className={s.clarity}>
          <div className={s.storyGrid}>
            <div className={s.memoryStage}>
              <div className={s.clarityOrbit} aria-hidden="true" />
              <div className={s.memory}>
                <StoryPhoto
                  desktop="marketing-photos-v4/understand-desktop"
                  mobile="marketing-photos-v4/understand-mobile"
                  alt="A couple sitting together at home, looking through their finances with a laptop and coffee."
                />
              </div>
              <div className={s.thought}>
                <Mascot pose="compact" size={52} />
                <span>“Could we make room for a trip?”</span>
              </div>
            </div>
            <Heading text="See where your money goes, understand the changes, and talk through your next step with Clover.">
              Less wondering.
              <br />
              <em>More knowing.</em>
            </Heading>
          </div>
        </ScrollScene>

        <ScrollScene id="looking-forward" className={s.possibility}>
          <div className={s.possibilityArt}>
            <StoryPhoto
              desktop="marketing-photos-v4/together-desktop"
              mobile="marketing-photos-v4/together-mobile"
              alt="The same friends at the airport, ready to head out on their trip together."
            />
          </div>
          <div className={s.possibilityVeil} aria-hidden="true" />
          <div className={s.possibilityCopy}>
            <Heading text="A weekend away. A place of your own. Set a goal, make a plan, and share the money side with the people in it.">
              Something to
              <br />
              <em>look forward to.</em>
            </Heading>
          </div>
          <div className={s.postcard} aria-hidden="true">
            <StoryPhoto
              desktop="landing-story-v2/06-life"
              mobile="landing-story-v3/06-life-mobile-clear"
              alt=""
            />
          </div>
        </ScrollScene>

        <ScrollScene id="more-living" className={s.living}>
          <div className={s.livingCopy}>
            <Heading text="Feel clearer about your money. More confident about what comes next.">
              A little clarity.
              <br />
              <em>A little more living.</em>
            </Heading>
            <Action>Find my clarity</Action>
          </div>
          <div className={s.lifeWindow}>
            <StoryPhoto
              desktop="landing-story-v2/06-life"
              mobile="landing-story-v3/06-life-mobile-clear"
              alt="The friends enjoying their trip, walking together beneath the trees."
            />
          </div>
          <div className={s.lifeMascot} aria-hidden="true">
            <Mascot pose="welcome" size={130} />
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
          Lifestyle imagery is illustrative. © {new Date().getFullYear()}{" "}
          Clover.
        </small>
      </footer>
    </div>
  );
}
