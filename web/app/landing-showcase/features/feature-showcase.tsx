"use client";

import { useRef } from "react";
import Link from "next/link";
import { PublicFooter } from "@/components/public-footer";
import { JourneyHeader } from "@/app/landing-preview/landing-journey";
import type { FeatureStory, FeatureVisual } from "@/lib/feature-stories";
import type { PricingMarket } from "@/lib/public-plan-comparison";
import { FEATURE_LINKS } from "@/lib/public-site";
import { useShowcaseMotion } from "../use-showcase-motion";
import { Action, AppScreen, BudgetMoment, CircleCard, ConnectionOptions, ControlCard, Conversation, GoalMoment, Heading, Icon, Mascot, Plans, Receipt, ScrollScene, SpendingStory, SplitCard, StoreAvailability, StoryPhoto, TransactionMoment } from "../showcase";
import s from "../showcase.module.css";
import f from "./feature-showcase.module.css";

function LifePhoto({ shared = false }: { shared?: boolean }) {
  return <div className={f.lifePhoto}><StoryPhoto desktop={`landing-story-v3/${shared ? "05-plan" : "07-private-review"}`} mobile={`landing-story-v3/${shared ? "05-plan-mobile" : "07-private-review-mobile"}`} alt={shared ? "Friends preparing for a trip together." : "Taking a quiet moment to review personal finances."} /></div>;
}
function RecurringCard() {
  return <div className={f.surface}><div className={s.miniHeader}><strong>What’s coming up</strong><span>Recurring</span></div><div className={f.calendar}><span>OCT</span><strong>15</strong><small>A little more prepared.</small></div>{[["Rent", "Oct 15 · Monthly", "₱12,000"], ["Internet", "Oct 18 · Monthly", "₱1,699"], ["Salary", "Oct 30 · Income", "+₱48,000"]].map(([title, date, amount]) => <div className={f.row} key={title}><div><strong>{title}</strong><small>{date}</small></div><b>{amount}</b></div>)}</div>;
}
function PortfolioCard() {
  return <div className={f.surface}><div className={s.miniHeader}><strong>My portfolio</strong><span>Investments</span></div><div className={f.value}><small>Recorded estimated value</small><strong>₱165,000</strong></div><svg className={f.trend} viewBox="0 0 300 100" preserveAspectRatio="none" role="img" aria-label="Illustrative portfolio value rising over six months"><path d="M0 90 45 76 90 80 135 54 180 57 225 30 270 20 300 8V100H0Z" fill="#d1f2e8"/><path d="M0 90 45 76 90 80 135 54 180 57 225 30 270 20 300 8" fill="none" stroke="#03a8c0" strokeWidth="4"/></svg>{[["GoTrade", "Stocks", "₱120,000"], ["ATRAM", "Funds", "₱45,000"]].map(([name, type, value]) => <div className={f.row} key={name}><div><strong>{name}</strong><small>{type}</small></div><b>{value}</b></div>)}</div>;
}
function TrendCard() {
  return <div className={f.surface}><div className={s.miniHeader}><strong>A clearer comparison</strong><span>Reports</span></div><div className={f.value}><small>Food & dining · October</small><strong>₱6,000</strong></div><div className={f.comparison}><div><span>September</span><i style={{width:"75%"}}/><b>₱4,500</b></div><div><span>October</span><i/><b>₱6,000</b></div></div><p>₱1,500 more than last month. A pattern worth a closer look.</p></div>;
}
function ProCard() {
  return <div className={`${f.surface} ${f.proCard}`}><Mascot pose="reports" size={90}/><h3>Room for your bigger picture.</h3>{["40 financial accounts", "5 linked bank accounts", "Higher limits for Ask Clover"].map(text => <div className={f.row} key={text}><Icon kind="check"/><strong>{text}</strong></div>)}</div>;
}
function FeatureArt({ visual, hero = false, slug }: { visual?: FeatureVisual; hero?: boolean; slug: string }) {
  const kind = visual ?? "accounts";
  return <div className={`${f.art} ${hero ? f.heroArt : ""}`} data-feature-art={kind}>
    {kind === "transactions" ? <><div className={f.leftPhone}><AppScreen page="transactions" eager={hero}/></div><div className={f.rightReceipt}><Receipt/></div><div className={f.bottomRow}><TransactionMoment/></div></> : null}
    {kind === "accounts" ? <><div className={f.leftPhone}><AppScreen page="accounts" eager={hero}/></div><div className={f.right}>{slug === "pro" ? <ProCard/> : <ConnectionOptions/>}</div></> : null}
    {kind === "reports" ? <><div className={f.leftReport}><SpendingStory/></div><div className={f.right}><TrendCard/></div></> : null}
    {kind === "adviser" ? <><div className={f.leftMascot}><Mascot pose="chat" size={220}/></div><div className={f.rightChat}><Conversation/></div></> : null}
    {kind === "recurring" ? <><LifePhoto/><div className={f.right}><RecurringCard/></div></> : null}
    {kind === "investments" ? <><div className={f.left}><PortfolioCard/></div><div className={f.rightGoal}><GoalMoment compact/></div></> : null}
    {kind === "budget" ? <><LifePhoto/><div className={f.rightBudget}><BudgetMoment/></div></> : null}
    {kind === "goal" ? <><LifePhoto/><div className={f.rightGoal}><GoalMoment/></div></> : null}
    {kind === "circles" || kind === "split" ? <><LifePhoto shared/><div className={f.leftCircle}><CircleCard/></div><div className={f.rightSplit}><SplitCard/></div></> : null}
    {kind === "source" ? <><div className={f.leftReceipt}><Receipt/></div><div className={f.rightControl}><ControlCard/></div><div className={f.bottomRow}><TransactionMoment/></div></> : null}
    {kind === "control" ? <><LifePhoto/><div className={f.rightControl}><ControlCard/></div></> : null}
  </div>;
}

export function FeatureShowcase({ story, initialMarket }: { story: FeatureStory; initialMarket: PricingMarket }) {
  const root = useRef<HTMLDivElement>(null);
  const { mode, reduced } = useShowcaseMotion(root);
  const first = story.chapters[0];
  const chapters = story.chapters.slice(1, -1).filter(chapter => chapter.visual !== "pricing");
  const final = story.chapters[story.chapters.length - 1];
  return <div ref={root} className={`${s.site} ${f.feature}`} data-motion={reduced ? "off" : mode} data-reduced={reduced}>
    <a href="#feature-main" className={s.skip}>Skip to content</a>
    <div className={s.productionHeader}><JourneyHeader featureBasePath="/landing-showcase/features" homeHref="/landing-showcase"/></div>
    <main id="feature-main">
      <ScrollScene id="overview" className={`${s.hero} ${f.hero}`}><div className={s.storyGrid}><div className={s.copy}><Heading hero text={first.copy ?? ""}>{first.title}<br/><em>{first.accent}</em></Heading><Action/><StoreAvailability variant="white"/></div><FeatureArt hero visual={first.visual} slug={story.slug}/></div><a className={s.scrollArrow} href="#feature-story" aria-label={`Explore ${story.title}`}><Icon kind="chevron"/></a></ScrollScene>
      <ScrollScene id="feature-story" className={`${s.journey} ${f.journey}`}><div className={s.journeyWorld}>{chapters.map(chapter => <article key={chapter.id} className={s.journeyBeat} data-story-act id={chapter.id}><div className={s.journeyCopy}><Heading text={chapter.copy ?? ""}>{chapter.title}<br/><em>{chapter.accent}</em></Heading>{chapter.link ? <Link className={f.contextLink} href={chapter.link.href.startsWith("/features/") ? `/landing-showcase${chapter.link.href}` : chapter.link.href}>{chapter.link.label}</Link> : null}</div><div className={s.journeyArt} data-story-art><FeatureArt visual={chapter.visual} slug={story.slug}/></div></article>)}</div></ScrollScene>
      {story.slug === "pro" ? <section className={s.plans} id="plans"><Heading text="Start free. Choose more room when you need it.">Choose what works <em>for you.</em></Heading><Plans initialMarket={initialMarket}/></section> : null}
      <section className={f.closing}><Heading text="Your next clearer step starts here.">{final.title} <em>{final.accent}</em></Heading><Action/><div className={f.related}>{FEATURE_LINKS.filter(link => !link.href.endsWith(story.slug)).map(link => <Link key={link.href} href={`/landing-showcase${link.href}`}><strong>{link.label}</strong><small>{link.products}</small><Icon/></Link>)}</div></section>
    </main>
    <PublicFooter includeTikTok storeVariant="white" />
  </div>;
}
