"use client";

import Image from "next/image";
import { memo } from "react";
import { LandingTransactionPhone } from "@/app/landing-preview/landing-journey";
import { FinancialAccountCard } from "@/components/financial-account-card";
import { ReportsMoneyOverTimeChart } from "@/components/reports-money-over-time-chart";
import { GoalIllustration } from "@/components/goals-visuals";
import { SplitBillEntityAvatar } from "@/components/split-bill-entity-avatar";
import type { AccountBrand } from "@/lib/account-brand";
import type { FeatureVisual } from "@/lib/feature-stories";
import styles from "./feature-story.module.css";

// Public, inert sample illustrations: no workspace requests, user storage, or mutations.
export const FeatureStoryDemo = memo(function FeatureStoryDemo({ visual, market }: { visual: FeatureVisual; market: "ph" | "global" }) {
  const ph = market === "ph";
  const currency = ph ? "PHP" : "USD";
  const money = (value: number) => new Intl.NumberFormat(ph ? "en-PH" : "en-US", { style: "currency", currency, maximumFractionDigits:0 }).format(ph ? value : value / 10);
  const bank = ph ? "BPI" : "Chase";
  const logo = ph ? "/assets/banks/philippines/bpi.png" : "/assets/banks/uk/chase bank.png";
  const brand: AccountBrand = { label:bank,logoSrc:logo,logoSrcs:[logo],fallbackIconSrc:"/clover-mark.svg",accent:"#03a8c0",background:"linear-gradient(120deg,#e7faf8,#fff)",foreground:"#15353d" };
  if (visual === "transactions") return <LandingTransactionPhone market={market} style={{position:"relative",right:"auto",bottom:"auto",width:"100%"}} />;
  return <div className={styles.demoCard} data-demo={visual}>
    <div className={styles.demoHeader}><Image src="/clover-mark.svg" alt="" width={25} height={25} /><strong>{({accounts:"Accounts",recurring:"Recurring",reports:"Reports",adviser:"Adviser",budget:"Budgeting",goal:"Goals",circles:"Circles",split:"Split Bills",source:"Source record",control:"Your data",pricing:"Pro"} as const)[visual]}</strong><small>Sample</small></div>
    {visual === "accounts" ? <div className={styles.accountSamples}>
      <FinancialAccountCard accountBrand={brand} name={`${bank} Savings`} accountNumber="•••• 1234" amount={money(84250)} amountLabel={currency} showChevron={false} />
      <FinancialAccountCard accountBrand={{...brand,label:"Cash",logoSrc:"/assets/banks/1 generic/cash.png",logoSrcs:["/assets/banks/1 generic/cash.png"]}} name="Cash" amount={money(4250)} amountLabel={currency} showChevron={false} />
    </div> : null}
    {visual === "reports" ? <><p className={styles.demoTitle}>Your money over time</p><ReportsMoneyOverTimeChart currency={currency} points={[84250,83600,82100,85800,84800,91000,88500].map((balance,index)=>({date:`2026-08-${String(index+1).padStart(2,"0")}`,balance:ph?balance:balance/10}))} /></> : null}
    {visual === "adviser" ? <div className={styles.conversation}>
      <p className={styles.question}>Why did I spend more this month?</p>
      <p>Your sample records show a one-off workspace purchase. Review that separately from your usual monthly spending.</p>
      <div className={styles.grounded}>Based on the records you bring into Clover</div>
    </div> : null}
    {visual === "budget" ? <div className={styles.budgetSample}>
      <p className={styles.demoTitle}>Everyday spending</p><small>Monthly spending limit · {currency}</small>
      <strong>{money(8400)} <span>of {money(12000)}</span></strong>
      <div className="budget-card__bar"><span className="budget-card__bar-fill budget-card__bar-fill--safe" style={{width:"70%"}} /></div>
      <div className={styles.grounded}>{money(3600)} remaining · Editable budget</div>
    </div> : null}
    {visual === "goal" ? <GoalIllustration goalKey="save_more" title="Workspace upgrade" subtitle={`${money(12000)} of ${money(24000)} saved`} progress={50} compact /> : null}
    {visual === "recurring" ? <div className={styles.sampleRows}>
      {[[ph?"Globe":"AT&T",money(999),"Monthly"],[ph?"Meralco":"National Grid",money(1920),"Upcoming"],["Salary",money(48000),"Income"]].map(([name,amount,detail])=><div key={name}><span><b>{name}</b><small>{detail}</small></span><strong>{amount}</strong></div>)}
    </div> : null}
    {visual === "circles" || visual === "split" ? <>
      <p className={styles.demoTitle}>Dinner with friends</p>
      <div className={styles.sharedTotal}>{money(2400)} <small>{visual === "split" ? "Shared equally · 4 people" : "One Circle · shared expenses only"}</small></div>
      <div className={styles.sampleRows}>{["Alex","Mia","Kai","Nia"].map(name=><div key={name}><SplitBillEntityAvatar name={name} avatarUrl={null} /><span>{name}</span><strong>{money(600)}</strong></div>)}</div>
      <small>Personal accounts stay private</small>
    </> : null}
    {visual === "source" ? <div className={styles.sourceSample}>
      <div><Image src={logo} alt={bank} width={40} height={40} /><strong>{bank} statement</strong><small>Original file</small></div>
      <span>↓</span><div><strong>{ph?"SM Supermarket":"Whole Foods"}</strong><small>Imported transaction · {currency}</small><b>{money(2480)}</b></div>
    </div> : null}
    {visual === "control" ? <div className={styles.controlSample}>{["Review your records","Correct the details","Export your data","Delete through your account"].map((label,index)=><div key={label}><span>0{index+1}</span><strong>{label}</strong></div>)}</div> : null}
  </div>;
});
