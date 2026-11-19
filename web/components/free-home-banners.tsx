"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { HOME_BANNER_INTERVAL_MS, nextHomeBanner, type VisibleHomeBanner } from "../../shared/home-banners";
import { getNavigationIconSrc } from "@/lib/navigation-icons";
import { capturePostHogClientEvent } from "./posthog-analytics";
import styles from "./free-home-banners.module.css";

export function HomeBannerCard({ banner, preview = false, active = true }: { banner: VisibleHomeBanner; preview?: boolean; active?: boolean }) {
  const content = <>
    {banner.imageUrl ? <img className={styles.artwork} src={banner.imageUrl} alt="" /> : null}
    <span className={styles.wave} aria-hidden="true" />
    <span className={styles.copy}><strong>{banner.title}</strong><span>{banner.body}</span><span className={styles.cta}>{banner.ctaLabel} <span aria-hidden="true">→</span></span></span>
    {!banner.imageUrl ? <img className={styles.icon} src={getNavigationIconSrc(banner.icon)} width={68} height={68} alt="" /> : null}
  </>;
  const className = `${styles.card} ${banner.theme === "mint" ? styles.mint : styles.teal}`;
  return preview ? <div className={className}>{content}</div> : <Link className={className} href={banner.href} tabIndex={active ? 0 : -1} onClick={() => capturePostHogClientEvent("home_banner_clicked", { banner_id: banner.id, banner_kind: banner.kind, destination: banner.href.split("?")[0], placement: "home_below_quick_add" })}>{content}</Link>;
}

export function FreeHomeBanners() {
  const [banners, setBanners] = useState<VisibleHomeBanner[]>([]), [page, setPage] = useState(0);
  const [eligibleViewport, setEligibleViewport] = useState(false), [visible, setVisible] = useState(true), [reduceMotion, setReduceMotion] = useState(false);
  const [paused, setPaused] = useState(false), [interacting, setInteracting] = useState(false), [focused, setFocused] = useState(false), [hovered, setHovered] = useState(false);
  const track = useRef<HTMLDivElement>(null);
  const pageRef = useRef(page); pageRef.current = page;
  useEffect(() => { const finish = () => setInteracting(false); window.addEventListener("pointerup", finish); window.addEventListener("pointercancel", finish); return () => { window.removeEventListener("pointerup", finish); window.removeEventListener("pointercancel", finish); }; }, []);
  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 1100px)"), motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => { setEligibleViewport(mobile.matches); setReduceMotion(motion.matches); setVisible(document.visibilityState === "visible"); };
    update(); mobile.addEventListener("change", update); motion.addEventListener("change", update); document.addEventListener("visibilitychange", update);
    return () => { mobile.removeEventListener("change", update); motion.removeEventListener("change", update); document.removeEventListener("visibilitychange", update); };
  }, []);
  useEffect(() => {
    if (!eligibleViewport) { setBanners([]); return; }
    let controller: AbortController | null = null;
    const load = () => {
      controller?.abort(); controller = new AbortController(); const current = controller;
      void fetch("/api/home-banners", { cache: "no-store", signal: current.signal }).then(async response => response.ok ? response.json() : { banners: [] }).then(data => {
        if (!current.signal.aborted) { setBanners(Array.isArray(data.banners) ? data.banners : []); setPage(0); track.current?.scrollTo({ left: 0, behavior: "instant" }); }
      }).catch(() => { if (!current.signal.aborted) setBanners([]); });
    };
    load(); window.addEventListener("focus", load);
    return () => { controller?.abort(); window.removeEventListener("focus", load); };
  }, [eligibleViewport]);
  const go = useCallback((index: number) => {
    const element = track.current;
    if (!element) return;
    setPage(index); element.scrollTo({ left: index * element.clientWidth, behavior: reduceMotion ? "instant" : "smooth" });
  }, [reduceMotion]);
  useEffect(() => {
    if (banners.length < 2 || !visible || paused || reduceMotion || interacting || focused || hovered) return;
    const timer = window.setTimeout(() => go(nextHomeBanner(page, banners.length)), HOME_BANNER_INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [banners, visible, paused, reduceMotion, interacting, focused, hovered, page, go]);
  useEffect(() => {
    if (!track.current || !window.ResizeObserver) return;
    const element = track.current, observer = new ResizeObserver(() => element.scrollTo({ left: pageRef.current * element.clientWidth, behavior: "instant" }));
    observer.observe(element); return () => observer.disconnect();
  }, [banners.length]);
  if (!eligibleViewport || !banners.length) return null;
  return <section className={styles.carousel} aria-label="Clover offers" aria-roledescription="carousel" onPointerEnter={event => { if (event.pointerType === "mouse") setHovered(true); }} onPointerLeave={event => { if (event.pointerType === "mouse") setHovered(false); }} onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}>
    <div ref={track} className={styles.track} onPointerDown={() => setInteracting(true)} onPointerUp={() => setInteracting(false)} onPointerCancel={() => setInteracting(false)} onLostPointerCapture={() => setInteracting(false)} onScroll={event => setPage(Math.max(0, Math.min(banners.length - 1, Math.round(event.currentTarget.scrollLeft / Math.max(1, event.currentTarget.clientWidth)))))}>
      {banners.map((banner, index) => <div className={styles.slide} key={banner.id} role="group" aria-roledescription="slide" aria-label={`${index + 1} of ${banners.length}`}><HomeBannerCard banner={banner} active={index === page} /></div>)}
    </div>
    {banners.length > 1 ? <div className={styles.controls}><div className={styles.dots}>{banners.map((banner, index) => <button type="button" key={banner.id} aria-label={`Show offer ${index + 1}: ${banner.title}`} aria-current={page === index ? "true" : undefined} onClick={() => go(index)}><span /></button>)}</div><button type="button" className={styles.pause} aria-label={paused || reduceMotion ? "Play rotating offers" : "Pause rotating offers"} disabled={reduceMotion} onClick={() => setPaused(value => !value)}>{paused || reduceMotion ? "▶" : "II"}</button></div> : null}
  </section>;
}
