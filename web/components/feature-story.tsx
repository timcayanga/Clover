"use client";

import Link from "next/link";
import { PublicFooter } from "@/components/public-footer";
import { LandingSectionStatus } from "@/components/landing-section-status";
import { useLandingTableFit } from "@/lib/use-landing-table-fit";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { JourneyActions, JourneyHeader, ProActions, ProComparison } from "@/app/landing-preview/landing-journey";
import type { FeatureStory as Story } from "@/lib/feature-stories";
import { FeatureStoryDemo, FEATURE_CAPTURE_VISUALS } from "./feature-story-demo";
import landing from "@/app/landing-preview/landing-preview.module.css";
import styles from "./feature-story.module.css";
import typography from "./landing-type.module.css";
import { featureChapterPosition, featureChapterProgress } from "@/lib/landing-motion";

export function FeatureStory({ story, authEnabled, initialMarket, countryResolved }: { story: Story; authEnabled: boolean; initialMarket: "ph" | "global"; countryResolved: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  useLandingTableFit(root);
  const frame = useRef<number | null>(null);
  const copyRef = useRef<HTMLElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const focusFinalAction = useRef(false);
  const [position, setPosition] = useState(0);
  const [market, setMarket] = useState(initialMarket);
  const [reducedMotion, setReducedMotion] = useState(false);
  const active = Math.min(story.chapters.length-1,Math.round(position));
  const current = story.chapters[active];
  const final = active === story.chapters.length-1;
  const pricing = current.visual === "pricing";

  useEffect(() => {
    if (!final || !focusFinalAction.current) return;
    focusFinalAction.current = false;
    // The final chapter removes Next; retain the keyboard user's place in the story.
    if (document.activeElement === document.body) {
      copyRef.current?.querySelector<HTMLElement>('a[href],button:not([disabled])')?.focus({ preventScroll: true });
    }
  }, [final]);

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
      setPosition(featureChapterPosition(progress, story.chapters.length));
    };
    const requestUpdate = () => { if(frame.current===null) frame.current=requestAnimationFrame(update); };
    const hashTarget = () => {
      let fragment = location.hash.slice(1);
      try { fragment = decodeURIComponent(fragment); } catch { /* Ignore malformed escapes. */ }
      const index = story.chapters.findIndex(chapter=>chapter.id===fragment);
      const element = root.current;
      if(index>=0 && element) window.scrollTo({top:window.scrollY+element.getBoundingClientRect().top+(element.offsetHeight-innerHeight)*featureChapterProgress(index,story.chapters.length),behavior:"instant"});
      requestUpdate();
    };
    update(); hashTarget();
    addEventListener("scroll",requestUpdate,{passive:true}); addEventListener("resize",requestUpdate); addEventListener("hashchange",hashTarget);
    return () => { removeEventListener("scroll",requestUpdate);removeEventListener("resize",requestUpdate);removeEventListener("hashchange",hashTarget);media.removeEventListener("change",updateMotion);if(frame.current!==null)cancelAnimationFrame(frame.current); };
  }, [story]);

  const goTo = (index: number) => {
    const element=root.current;
    if(!element)return;
    window.scrollTo({top:window.scrollY+element.getBoundingClientRect().top+(element.offsetHeight-innerHeight)*featureChapterProgress(index,story.chapters.length),behavior:reducedMotion?"instant":"smooth"});
  };

  return <><div ref={root} className={`${landing.journey} ${styles.journey} ${typography.standard}`} data-feature-story={story.slug} data-market={market} data-pricing={pricing} style={{height:`${100+story.chapters.length*42}svh`} as CSSProperties}>
    <div className={styles.stage}>
      <JourneyHeader />
      <div className={styles.background} data-feature-background aria-hidden="true">
        {/* Time-based transitions always finish, even when scrolling stops. Never
            repeat the photo beneath this layer at a different crop or scale. */}
        {["hero","end"].map((scene,index)=><picture key={scene} data-feature-scene={scene} className={styles.photograph} style={{opacity:(scene==="end")===final?1:0}}>
          <source media="(max-width: 900px)" srcSet={`/assets/feature-stories/${story.asset}-${scene}${story.asset==="together" && scene==="hero"?"-repaired":""}-mobile.webp`} />
          <img src={`/assets/feature-stories/${story.asset}-${scene}${story.asset==="together" && scene==="hero"?"-repaired":""}.webp`} alt="" draggable={false} fetchPriority={index===0?"high":"low"} decoding={index===0?"sync":"async"} />
        </picture>)}
      </div>
      <div className={styles.wash} aria-hidden="true" />
      <section ref={copyRef} className={`${styles.content} ${pricing?styles.pricingContent:""}`} data-landing-copy data-final={final} aria-live="polite" aria-atomic="true">
        <div className={styles.copy} key={current.id}>
          <h1>{current.title} <em>{current.accent}</em></h1>
          {current.copy && <p className={styles.description}>{current.copy}</p>}
          {current.link && <Link className={styles.contextLink} href={current.link.href}>{current.link.label}</Link>}
          {pricing ? <ProActions market={market} /> : null}
          {(active===0 || final) && (story.slug==="pro" ? <div className={styles.proCta}><Link className="button button-primary button-pill" href="/sign-up?intent=pro&interval=annual">Upgrade to Pro <span aria-hidden="true">→</span></Link><small>You can keep using Clover for free.</small></div> : <JourneyActions authEnabled={authEnabled} final={final} />)}
        </div>
        {pricing && <div className={styles.pricing}><ProComparison market={market} variant="feature" style={{opacity:1}} showActions={false} /></div>}
      </section>
      {current.visual && FEATURE_CAPTURE_VISUALS.includes(current.visual) && <div key={current.visual} className={styles.support} data-visual={current.visual} aria-hidden="true" inert>
        <FeatureStoryDemo visual={current.visual} market={market} />
      </div>}
      <LandingSectionStatus index={active} total={story.chapters.length} label={current.id.replaceAll("-", " ")} />
      <nav className={styles.markers} aria-label="Feature story chapters">
        {story.chapters.map((chapter,index)=><button type="button" key={chapter.id} onClick={()=>goTo(index)} aria-label={`Go to ${chapter.id.replaceAll("-"," ")}`} aria-current={index===active?"step":undefined}><span /></button>)}
        <small>{active+1}/{story.chapters.length}</small>
      </nav>
      {!final && <button ref={nextRef} className={styles.next} type="button" onClick={(event)=>{
        focusFinalAction.current = active === story.chapters.length - 2 && event.detail === 0 && document.activeElement === nextRef.current;
        goTo(active+1);
      }}>Keep scrolling <span aria-hidden="true">↓</span></button>}
    </div>
  </div><PublicFooter /></>;
}
