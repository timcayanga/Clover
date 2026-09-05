"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { JourneyActions, JourneyHeader, ProActions, ProComparison } from "@/app/landing-preview/landing-journey";
import type { FeatureStory as Story } from "@/lib/feature-stories";
import { FeatureStoryDemo } from "./feature-story-demo";
import landing from "@/app/landing-preview/landing-preview.module.css";
import styles from "./feature-story.module.css";
import typography from "./landing-type.module.css";
import { featurePhotoPosition } from "@/lib/landing-motion";

export function FeatureStory({ story, authEnabled, initialMarket, countryResolved }: { story: Story; authEnabled: boolean; initialMarket: "ph" | "global"; countryResolved: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);
  const [position, setPosition] = useState(0);
  const [market, setMarket] = useState(initialMarket);
  const [reducedMotion, setReducedMotion] = useState(false);
  const active = Math.min(story.chapters.length-1,Math.round(position));
  const current = story.chapters[active];
  const final = active === story.chapters.length-1;
  const pricing = current.visual === "pricing";

  useEffect(() => {
    if (countryResolved || initialMarket === "ph") return;
    if (navigator.languages.some(locale=>/(?:^|-)PH$/i.test(locale)||/^fil(?:-|$)/i.test(locale)) || Intl.DateTimeFormat().resolvedOptions().timeZone === "Asia/Manila") setMarket("ph");
  }, [countryResolved, initialMarket]);

  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setReducedMotion(media.matches);
    updateMotion(); media.addEventListener("change", updateMotion);
    const update = () => {
      frame.current = null;
      const element = root.current;
      if (!element) return;
      const progress = Math.max(0,Math.min(1,-element.getBoundingClientRect().top/Math.max(1,element.offsetHeight-innerHeight)));
      setPosition(progress*(story.chapters.length-1));
    };
    const requestUpdate = () => { if(frame.current===null) frame.current=requestAnimationFrame(update); };
    const hashTarget = () => {
      const index = story.chapters.findIndex(chapter=>`#${chapter.id}`===location.hash);
      const element = root.current;
      if(index>=0 && element) window.scrollTo({top:window.scrollY+element.getBoundingClientRect().top+(element.offsetHeight-innerHeight)*index/(story.chapters.length-1),behavior:"instant"});
      requestUpdate();
    };
    update(); hashTarget();
    addEventListener("scroll",requestUpdate,{passive:true}); addEventListener("resize",requestUpdate); addEventListener("hashchange",hashTarget);
    return () => { removeEventListener("scroll",requestUpdate);removeEventListener("resize",requestUpdate);removeEventListener("hashchange",hashTarget);media.removeEventListener("change",updateMotion);if(frame.current!==null)cancelAnimationFrame(frame.current); };
  }, [story]);

  const goTo = (index: number) => {
    const element=root.current;
    if(!element)return;
    window.scrollTo({top:window.scrollY+element.getBoundingClientRect().top+(element.offsetHeight-innerHeight)*index/(story.chapters.length-1),behavior:reducedMotion?"instant":"smooth"});
  };
  const photoPosition = featurePhotoPosition(position, story.slug === "pro");
  const endReveal = Math.max(0,Math.min(1,(photoPosition-2.25)/1.25));
  const photographMotion = reducedMotion ? undefined : `scale(${1+photoPosition*.008}) translate3d(${-photoPosition*.3}%,0,0)`;

  return <div ref={root} className={`${landing.journey} ${styles.journey} ${typography.standard}`} data-feature-story={story.slug} data-market={market} data-pricing={pricing} style={{height:`${100+(story.chapters.length-1)*35}svh`} as CSSProperties}>
    <div className={styles.stage}>
      <JourneyHeader />
      <div className={styles.background} aria-hidden="true" style={{transform:photographMotion}}>
        {["hero","end"].map((scene,index)=><picture key={scene} className={styles.photograph} style={{opacity:index===0?1:endReveal}}>
          <source media="(max-width: 900px)" srcSet={`/assets/feature-stories/${story.asset}-${scene}-mobile.webp`} />
          <img src={`/assets/feature-stories/${story.asset}-${scene}.webp`} alt="" draggable={false} fetchPriority={index===0?"high":"low"} decoding={index===0?"sync":"async"} />
        </picture>)}
      </div>
      <div className={styles.wash} aria-hidden="true" />
      <section className={`${styles.content} ${pricing?styles.pricingContent:""}`} data-landing-copy data-final={final} aria-live="polite" aria-atomic="true">
        <div className={styles.copy} key={current.id}>
          <h1>{current.title} <em>{current.accent}</em></h1>
          {current.copy && <p className={styles.description}>{current.copy}</p>}
          {current.link && <Link className={styles.contextLink} href={current.link.href}>{current.link.label}</Link>}
          {pricing ? <ProActions /> : null}
          {(active===0 || final) && (story.slug==="pro" ? <div className={styles.proCta}><Link className="button button-primary button-pill" href="/sign-up?intent=pro&interval=annual">Upgrade to Pro <span aria-hidden="true">→</span></Link><small>You can keep using Clover for free.</small></div> : <JourneyActions authEnabled={authEnabled} final={final} />)}
        </div>
        {pricing && <div className={styles.pricing}><ProComparison market={market} style={{opacity:1}} showActions={false} /></div>}
      </section>
      {current.visual === "transactions" && <div key={current.visual} className={styles.support} data-visual={current.visual} aria-hidden="true" inert>
        <FeatureStoryDemo visual={current.visual} market={market} />
      </div>}
      <nav className={styles.markers} aria-label="Feature story chapters">
        {story.chapters.map((chapter,index)=><button type="button" key={chapter.id} onClick={()=>goTo(index)} aria-label={`Go to ${chapter.id.replaceAll("-"," ")}`} aria-current={index===active?"step":undefined}><span /></button>)}
        <small>{active+1}/{story.chapters.length}</small>
      </nav>
      {!final && <button className={styles.next} type="button" onClick={()=>goTo(active+1)}>Keep scrolling <span aria-hidden="true">↓</span></button>}
    </div>
  </div>;
}
