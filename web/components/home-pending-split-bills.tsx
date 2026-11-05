"use client";
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatCurrencyAmount } from '@/lib/currency-format';
import { HomeSensitiveAmount } from './home-sensitive-amount';
import type { PendingSplitBill } from '../../shared/home-split-bills';
export function HomePendingSplitBills() {
  const [summary,setSummary]=useState<{count:number;bills:PendingSplitBill[]} | null>(null);
  useEffect(() => {
    const controller=new AbortController();
    void fetch('/api/split-bills?homeSummary=true',{signal:controller.signal,cache:'no-store'})
      .then(async response => {if(!response.ok)throw Error('Unavailable');return response.json();})
      .then(data=>{if(!controller.signal.aborted)setSummary(data.pending);}).catch(()=>{});
    return ()=>controller.abort();
  },[]);
  if(!summary?.count)return null;
  return <section className="dashboard-home__goal-card" aria-label="Pending Split Bills"><p className="eyebrow">Pending Split Bills</p><p>{summary.count} {summary.count===1?'bill':'bills'} to settle</p><div className="dashboard-home__action-list">
    {summary.bills.map(bill=><Link className="dashboard-home__action-row" key={bill.id} href={`/split-bill/${encodeURIComponent(bill.id)}`}><span aria-hidden="true">👥</span><div className="dashboard-home__action-row-copy"><strong>{bill.title}</strong><small><HomeSensitiveAmount value={formatCurrencyAmount(bill.remaining,bill.currency)} currency={bill.currency}/> left to settle</small></div><span aria-hidden="true">›</span></Link>)}
  </div></section>;
}
