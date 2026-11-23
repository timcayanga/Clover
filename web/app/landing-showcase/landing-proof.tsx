"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import banks from "./landing-banks.json";
import "./landing-proof.css";

const reviews = [
  {
    "quote": "Super clean interface too.",
    "url": "https://apps.apple.com/ph/app/id6811711508?see-all=reviews"
  },
  {
    "quote": "An app that's very needed today!!",
    "url": "https://play.google.com/store/apps/details?id=ph.clover.app&reviewId=9ef6f02c-d932-4422-b5c3-62113ff989e5"
  },
  {
    "quote": "Been using it for tracking my receipts 👍 Great tool honestly",
    "url": "https://apps.apple.com/ph/app/id6811711508?see-all=reviews"
  },
  {
    "quote": "I find tracking expenses overwhelming sometimes but Clover makes it so easy to jot down what I’ve spent!",
    "url": "https://apps.apple.com/ph/app/id6811711508?see-all=reviews"
  },
  {
    "quote": "This easily saved me hours of inputting my transactions",
    "url": "https://apps.apple.com/ph/app/id6811711508?see-all=reviews"
  }
];

export function CustomerProof() {
  return <section className="cp-proof" aria-label="Clover in numbers and reviews">
    <div className="cp-voices" aria-label="Five-star Clover reviews"><div className="cp-voice-loop">
      {[false,true].map(copy => <div className="cp-voice-group" key={String(copy)} aria-hidden={copy || undefined} inert={copy || undefined}>
        {reviews.map(({quote,url}) => <figure key={quote}><a href={url} target="_blank" rel="noopener">
          <span aria-label="Five stars">★★★★★</span><blockquote>“{quote}”</blockquote>
        </a></figure>)}
      </div>)}
    </div></div>
    <div className="cp-stats"><div className="cp-stat" title="November 23, 2026. All eligible positive asset-account balances: USD 24,900 and PHP 4,461,396.54. At USD 0.01567 per peso, the total is USD 94,810.08, rounded up to the nearest US$100,000. Historical activity, shared entries, and holdings without a verified separate balance are excluded."><b>~$100K</b><span>Funds tracked (USD)</span></div><div className="cp-stat" title="Estimate as of November 23, 2026: 1,301 customer upload entries plus 38 distinct bank-synced entries. At 62 seconds per entry (Vocash), the estimate is 23.06 hours, rounded up to the next ten. Upload, sync setup and review time have not been deducted."><b>~30 hours</b><span><a href="https://www.vocash.app/blog/voice-vs-manual-expense-tracking-speed-test" target="_blank" rel="noopener" aria-label="Estimated manual entry avoided. Read the Vocash manual expense entry speed test.">Manual entry avoided</a></span></div><div className="cp-stat" title="147,792 supported statement-description variants in the transaction parser."><b>~150K</b><span>Statement patterns supported</span></div></div>
  </section>;
}

const markets: Record<string,string> = {PH:"Philippines",SG:"Singapore",HK:"Hong Kong",MY:"Malaysia",VN:"Vietnam"};
type ActiveBank = {button: HTMLButtonElement; bank: typeof banks[number]; pinned: boolean};

export function BankShowcase() {
  const rail = useRef<HTMLDivElement>(null);
  const tooltip = useRef<HTMLDivElement>(null);
  const [active,setActive] = useState<ActiveBank|null>(null);
  const drag = useRef<{start:number; left:number; moved:boolean}|null>(null);
  const skipClick = useRef(false);

  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    const width = () => el.firstElementChild?.getBoundingClientRect().width || 0;
    el.scrollLeft = width();
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    let visible=false, frame=0, last=0, x=el.scrollLeft;
    const tick = (now:number) => {
      const w=width();
      if (w && !media.matches && !document.hidden && !drag.current && !el.matches(":hover,:focus-within") && !tooltip.current) {
        if (Math.abs(x-el.scrollLeft)>1) x=el.scrollLeft;
        x+=Math.min(now-last,50)*0.034;
        if(x>2*w) x-=w;
        el.scrollLeft=x;
      }
      last=now;
      if(visible) frame=requestAnimationFrame(tick);
    };
    const observer=new IntersectionObserver(([entry])=>{
      visible=entry.isIntersecting;
      cancelAnimationFrame(frame);
      if(visible) frame=requestAnimationFrame(tick);
    });
    observer.observe(el);
    return ()=>{observer.disconnect();cancelAnimationFrame(frame)};
  },[]);

  useEffect(()=>{
    if(!active || !tooltip.current) return;
    const tip=tooltip.current;
    const place=()=>{
      const b=active.button.getBoundingClientRect();
      const h=tip.offsetHeight,w=tip.offsetWidth;
      if(b.bottom<0||b.top>innerHeight||b.right<0||b.left>innerWidth){setActive(null);return;}
      const below=innerHeight-b.bottom>=h+14||b.top<h+14;
      tip.style.top=Math.max(6,Math.min(innerHeight-h-6,below?b.bottom+8:b.top-h-8))+"px";
      tip.style.left=Math.max(8,Math.min(innerWidth-w-8,b.left+(b.width-w)/2))+"px";
    };
    const dismiss=(e:PointerEvent)=>{if(e.target instanceof Node && !rail.current?.contains(e.target)&&!tip.contains(e.target))setActive(null)};
    const escape=(e:KeyboardEvent)=>{if(e.key==="Escape")setActive(null)};
    place();
    window.addEventListener("scroll",place,true);window.addEventListener("resize",place);
    document.addEventListener("pointerdown",dismiss);document.addEventListener("keydown",escape);
    return ()=>{window.removeEventListener("scroll",place,true);window.removeEventListener("resize",place);document.removeEventListener("pointerdown",dismiss);document.removeEventListener("keydown",escape)};
  },[active]);

  return <div className="cp-banks"><div className="cp-scroll" role="region" aria-label="Browse bank connections" ref={rail} tabIndex={0}
    onKeyDown={e=>{if(e.key==="ArrowLeft"||e.key==="ArrowRight"){e.preventDefault();setActive(null);e.currentTarget.scrollLeft+=e.key==="ArrowRight"?144:-144}}}
    onPointerDown={e=>{skipClick.current=false;if(e.pointerType==="mouse"&&e.button===0)drag.current={start:e.clientX,left:e.currentTarget.scrollLeft,moved:false}}}
    onPointerMove={e=>{const d=drag.current;if(!d)return;if(!e.buttons){drag.current=null;return;}const delta=e.clientX-d.start;if(Math.abs(delta)>5&&!d.moved){d.moved=true;skipClick.current=true;e.currentTarget.setPointerCapture(e.pointerId);setActive(null)}if(d.moved)e.currentTarget.scrollLeft=d.left-delta}}
    onPointerUp={()=>{drag.current=null}} onPointerCancel={()=>{drag.current=null}}
    onPointerLeave={()=>{if(!drag.current?.moved)drag.current=null}}
  >
    {[0,1,2].map(copy=><div className="cp-group" key={copy}>
      {banks.map(bank=><button key={bank.name} type="button" className={"cp-bank"+(active?.button.dataset.key===copy+bank.name?" cp-selected":"")}
        data-key={copy+bank.name} aria-label={bank.name} tabIndex={copy===1?0:-1}
        aria-describedby={active?.button.dataset.key===copy+bank.name?"cp-bank-info":undefined}
        onPointerEnter={e=>{if(e.pointerType==="mouse"&&!active?.pinned&&!drag.current)setActive({button:e.currentTarget,bank,pinned:false})}}
        onPointerLeave={e=>{if(!active?.pinned&&!e.currentTarget.matches(":focus-visible"))setActive(null)}}
        onFocus={e=>setActive({button:e.currentTarget,bank,pinned:false})} onBlur={()=>setActive(null)}
        onClick={e=>{if(!skipClick.current)setActive(active?.button===e.currentTarget&&active.pinned?null:{button:e.currentTarget,bank,pinned:true})}}>
        <img src={"/landing-banks/"+bank.image} alt="" draggable={false} loading="lazy" />
      </button>)}
    </div>)}
  </div>{active&&createPortal(<div className="cp-tooltip" ref={tooltip} role="tooltip" id="cp-bank-info"><strong>{active.bank.name}</strong>
    {Object.entries(active.bank.markets).map(([code,modes])=><div key={code} className="cp-market">
      <span className="cp-flag" role="img" aria-label={markets[code]} title={markets[code]} style={{backgroundImage:`url("/assets/countries/${markets[code].toLowerCase()}.png")`}}/>
      {Array.from(modes||"").map(mode=><span key={mode} className={"cp-chip "+(mode==="P"?"cp-personal":"cp-business")}>{mode==="P"?"Personal":"Business"}</span>)}
    </div>)}</div>,document.body)}</div>;
}
