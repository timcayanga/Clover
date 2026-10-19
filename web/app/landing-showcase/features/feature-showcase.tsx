"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { PublicFooter } from "@/components/public-footer";
import { JourneyActions, JourneyHeader } from "@/app/landing-preview/landing-journey";
import type { FeatureStory, FeatureVisual } from "@/lib/feature-stories";
import type { PricingMarket } from "@/lib/public-plan-comparison";
import { FEATURE_LINKS } from "@/lib/public-site";
import { useShowcaseMotion } from "../use-showcase-motion";
import { AppScreen, BudgetMoment, CircleCard, ConnectionOptions, ControlCard, Conversation, GoalMoment, Heading, Icon, Plans, Receipt, ScrollScene, SpendingStory, SplitCard, StoreAvailability, StoryPhoto } from "../showcase";
import s from "../showcase.module.css";
import f from "./feature-showcase.module.css";

function LifePhoto({ shared = false, adviser = false, eager = false, variant }: { shared?: boolean; adviser?: boolean; eager?: boolean; variant?: "budget" | "goal" }) {
  if (adviser) return <div className={`${f.lifePhoto} ${f.adviserPhoto}`}><img src="/assets/marketing-photos-v4/adviser-desktop.webp" alt="A woman asking Clover about her finances on her phone." width={1672} height={941} loading={eager?"eager":"lazy"} fetchPriority={eager?"high":"auto"}/></div>;
  if (variant) return <div className={`${f.lifePhoto} ${f.planningPhoto}`}><img src={`/assets/marketing-photos-v4/${variant==="goal"?"plan":"manage"}-desktop.webp`} alt={variant==="goal"?"Planning a savings goal at home.":"Reviewing everyday spending at home."} width={1672} height={941} loading={eager?"eager":"lazy"} fetchPriority={eager?"high":"auto"}/></div>;
  return <div className={f.lifePhoto}><StoryPhoto desktop={`landing-story-v3/${shared ? "05-plan" : "07-private-review"}`} mobile={`landing-story-v3/${shared ? "05-plan-mobile" : "07-private-review"}`} alt={shared ? "Friends making plans together." : "Reviewing personal finances at home."} eager={eager}/></div>;
}
function RecurringCard() {
  const rows = [
    { title:"Rent", date:"Nov 15 · Monthly", amount:"₱12,000", icon:"/figma-icons/categories/housing.svg" },
    { title:"Globe", date:"Nov 18 · Monthly", amount:"₱1,699", icon:"/assets/logo-library/company logos/telecommunications/globe/icon.png" },
    { title:"Netflix", date:"Nov 20 · Monthly", amount:"₱549", icon:"/assets/logo-library/company logos/subscriptions/netflix/icon.png" },
    { title:"Salary", date:"Nov 30 · Income", amount:"+₱48,000", icon:"/figma-icons/categories/income.svg" },
  ];
  return <div className={f.surface}><div className={s.miniHeader}><strong>What’s coming up</strong><span>Recurring</span></div><div className={f.calendar}><span>NOVEMBER</span><strong>15</strong><small>Rent · ₱12,000</small></div>{rows.map(row=><div className={f.row} key={row.title}><img src={row.icon} alt="" width={30} height={30} loading="lazy"/><div><strong>{row.title}</strong><small>{row.date}</small></div><b>{row.amount}</b></div>)}</div>;
}
function PortfolioCard() {
  return <div className={f.surface}><div className={s.miniHeader}><strong>My portfolio</strong><span>Investments</span></div><div className={f.value}><small>Estimated value</small><strong>₱165,000</strong></div><svg className={f.trend} viewBox="0 0 300 100" preserveAspectRatio="none" role="img" aria-label="Illustrative portfolio value rising over six months"><path d="M0 90 45 76 90 80 135 54 180 57 225 30 270 20 300 8V100H0Z" fill="#d1f2e8"/><path d="M0 90 45 76 90 80 135 54 180 57 225 30 270 20 300 8" fill="none" stroke="#03a8c0" strokeWidth="4"/></svg>{[["GoTrade","gotrade","Stocks","₱120,000"],["ATRAM","atram","Funds","₱45,000"]].map(([name,logo,type,value])=><div className={f.row} key={name}><img src={`/assets/banks/philippines/${logo}.png`} alt="" width={30} height={30} loading="lazy"/><div><strong>{name}</strong><small>{type}</small></div><b>{value}</b></div>)}</div>;
}
function AllocationCard() {
  return <div className={f.surface}><div className={s.miniHeader}><strong>Your investment mix</strong><span>Investments</span></div><div className={f.allocation} role="img" aria-label="Sample allocation: stocks 72.7 percent, funds 27.3 percent"><span>₱165,000</span></div><div className={f.row}><strong>Stocks</strong><b>72.7%</b></div><div className={f.row}><strong>Funds</strong><b>27.3%</b></div></div>;
}
function TrendCard() {
  return <div className={f.surface}><div className={s.miniHeader}><strong>Food & dining</strong><span>Reports</span></div><div className={f.value}><small>October</small><strong>₱6,000</strong></div><div className={f.comparison}><div><span>September</span><i style={{width:"75%"}}/><b>₱4,500</b></div><div><span>October</span><i/><b>₱6,000</b></div></div><p>₱1,500 more than last month.</p></div>;
}
function ProCard() {
  return <div className={`${f.surface} ${f.proCard}`}><div className={s.miniHeader}><strong>Clover Pro</strong><span>More room</span></div><h3>Room for your bigger picture.</h3>{["40 financial accounts","5 linked bank accounts","Higher limits for Ask Clover"].map(text=><div className={f.row} key={text}><Icon kind="check"/><strong>{text}</strong></div>)}</div>;
}
function SourceCard() {
  return <div className={f.surface}><div className={s.miniHeader}><strong>From your receipt</strong><span>Source records</span></div>{[["Merchant","Starbucks"],["Date","Oct 5, 2026"],["Amount","₱190.00"],["Category","Food & dining"]].map(([name,value])=><div className={f.row} key={name}><span>{name}</span><b>{value}</b></div>)}<div className={f.sourceLink}><Icon kind="check"/><span>Linked to the original receipt</span></div></div>;
}
function ReviewCard() {
  const [decision,setDecision]=useState<"keep"|"delete"|null>(null);
  return <div className={f.surface}><div className={s.miniHeader}><strong>Review details</strong><span>Example</span></div><div className={f.row}><img src="/assets/logo-library/company logos/food/starbucks/icon.png" alt="" width={30} height={30}/><div><strong>Starbucks</strong><small>Oct 5 · BPI</small></div><b>−₱190.00</b></div><p>Check the merchant name against your receipt, then choose what to keep.</p>{decision ? <div className={f.demoResult} role="status"><Icon kind="check"/><span>{decision==="keep"?"Example transaction kept.":"Example transaction deleted."}</span><button type="button" onClick={()=>setDecision(null)}>Try again</button></div> : <div className={f.reviewActions}><button type="button" onClick={()=>setDecision("keep")}>Keep transaction</button><button type="button" onClick={()=>setDecision("delete")}>Delete</button></div>}</div>;
}
function FeatureArt({visual,hero=false,slug}:{visual?:FeatureVisual;hero?:boolean;slug:string}) {
  const kind=visual??"accounts";
  return <div className={`${f.art} ${hero?f.heroArt:""}`} data-feature-art={kind} data-pro={slug==="pro"||undefined} data-review={slug==="security"&&kind==="transactions"||undefined}>
    {kind==="transactions" && (slug==="security" ? <><div className={f.leftReceipt}><Receipt/></div><div className={f.right}><ReviewCard/></div></> : <><div className={f.leftPhone}><AppScreen page="transactions" eager={hero}/></div><div className={f.rightReceipt}><Receipt/></div></>)}
    {kind==="accounts" && <><div className={f.leftPhone}><AppScreen page="accounts" eager={hero}/></div><div className={f.right}>{slug==="pro"?<ProCard/>:<ConnectionOptions/>}</div></>}
    {kind==="reports" && <><div className={f.leftReport}><SpendingStory/></div><div className={`${f.right} ${f.secondaryReport}`}><TrendCard/></div></>}
    {kind==="adviser" && <><LifePhoto adviser eager={hero}/><div className={f.rightChat}><Conversation/></div></>}
    {kind==="recurring" && <><LifePhoto eager={hero}/><div className={f.right}><RecurringCard/></div></>}
    {kind==="investments" && <><div className={f.left}><PortfolioCard/></div><div className={f.rightInvestment}><AllocationCard/></div></>}
    {kind==="budget" && <><LifePhoto eager={hero} variant="budget"/><div className={f.rightBudget}><BudgetMoment/></div></>}
    {kind==="goal" && <><LifePhoto eager={hero} variant="goal"/><div className={f.rightGoal}><GoalMoment/></div></>}
    {kind==="circles" && <><LifePhoto shared eager={hero}/><div className={f.rightCircle}><CircleCard/></div></>}
    {kind==="split" && <><LifePhoto shared eager={hero}/><div className={f.rightSplit}><SplitCard/></div></>}
    {kind==="source" && <><div className={f.leftReceipt}><Receipt/></div><div className={f.right}><SourceCard/></div></>}
    {kind==="control" && <><LifePhoto eager={hero}/><div className={`${f.rightControl} ${f.controlList}`}><ControlCard/></div></>}
  </div>;
}
function Signup({authEnabled}:{authEnabled:boolean}) {
  return <div className={`${s.signupAction} ${f.signup}`}><JourneyActions authEnabled={authEnabled} final/><Link href="/sign-in">Log in</Link></div>;
}
export function FeatureShowcase({story,initialMarket,authEnabled=false}:{story:FeatureStory;initialMarket:PricingMarket;authEnabled?:boolean}) {
  const root=useRef<HTMLDivElement>(null);
  const {mode,reduced}=useShowcaseMotion(root);
  const first=story.chapters[0];
  const chapters=story.chapters.slice(1,-1).filter(chapter=>chapter.visual!=="pricing");
  const final=story.chapters[story.chapters.length-1];
  return <div ref={root} className={`${s.site} ${f.feature}`} data-motion={reduced?"off":mode} data-reduced={reduced}>
    <a href="#feature-main" className={s.skip}>Skip to content</a>
    <div className={s.productionHeader}><JourneyHeader featureBasePath="/landing-showcase/features" homeHref="/landing-showcase"/></div>
    <main id="feature-main">
      <ScrollScene id="overview" className={`${s.hero} ${f.hero}`} flow><div className={s.storyGrid}><div className={`${s.copy} ${f.copy}`}><Heading hero text={first.copy??""}>{first.title}<br/><em>{first.accent}</em></Heading><Signup authEnabled={authEnabled}/><StoreAvailability variant="white"/></div><FeatureArt hero visual={first.visual} slug={story.slug}/></div></ScrollScene>
      <ScrollScene id="feature-story" className={`${s.journey} ${f.journey}`} flow><div className={`${s.journeyWorld} ${f.world}`}>{chapters.map(chapter=><article key={chapter.id} className={s.journeyBeat} data-story-act id={chapter.id}><div className={`${s.journeyCopy} ${f.chapterCopy}`}><Heading text={chapter.copy??""}>{chapter.title}<br/><em>{chapter.accent}</em></Heading>{chapter.link&&<Link className={f.contextLink} href={chapter.link.href.startsWith("/features/")?`/landing-showcase${chapter.link.href}`:chapter.link.href}>{chapter.link.label}</Link>}</div><div className={s.journeyArt} data-story-art><FeatureArt visual={chapter.visual} slug={story.slug}/></div></article>)}</div></ScrollScene>
      {story.slug==="pro"&&<section className={`${s.plans} ${f.plans}`} id="plans" data-scroll-scene><Heading text="Start free. Choose more room when you need it.">Choose what works <em>for you.</em></Heading><Plans initialMarket={initialMarket}/></section>}
      <section className={f.closing} data-scroll-scene><Heading text="Your next clearer step starts here.">{final.title} <em>{final.accent}</em></Heading><Signup authEnabled={authEnabled}/><StoreAvailability variant="white"/><div className={f.related}>{FEATURE_LINKS.filter(link=>!link.href.endsWith(story.slug)).map(link=><Link key={link.href} href={`/landing-showcase${link.href}`}><strong>{link.label}</strong><small>{link.products}</small><Icon/></Link>)}</div></section>
    </main>
    <PublicFooter includeTikTok storeVariant="white" mobileShowcase/>
  </div>;
}
