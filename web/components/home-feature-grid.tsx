"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { FEATURE_NAVIGATION } from "@/lib/feature-navigation";
import { getNavigationIconSrc } from "@/lib/navigation-icons";

type Category = (typeof FEATURE_NAVIGATION)[number]["label"];
const HISTORY_KEY = "cloverHomeFeatureCategory";

export function HomeFeatureGrid() {
  const [category, setCategory] = useState<Category | null>(null);
  // Retain the outgoing panel during the reverse transition.
  const [lastCategory, setLastCategory] = useState<Category>("Money");
  const categoryButtons = useRef(new Map<Category, HTMLButtonElement>());
  const backButton = useRef<HTMLButtonElement>(null);
  const moveFocus = useRef(false);
  const group = FEATURE_NAVIGATION.find((item) => item.label === (category ?? lastCategory))!;

  useEffect(() => {
    // Keep selection on this history entry only: returning from a feature restores
    // its category, while a newly opened Home starts with the category directory.
    const saved = window.history.state?.[HISTORY_KEY];
    if (FEATURE_NAVIGATION.some((item) => item.label === saved)) {
      setCategory(saved);
      setLastCategory(saved);
    }
  }, []);

  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    (category ? backButton.current : categoryButtons.current.get(lastCategory))?.focus({ preventScroll: true });
  }, [category, lastCategory]);

  function selectCategory(next: Category | null) {
    moveFocus.current = true;
    if (next) setLastCategory(next);
    setCategory(next);
    window.history.replaceState({ ...window.history.state, [HISTORY_KEY]: next }, "");
  }

  return (
    <nav className="home-feature-grid" aria-label="Explore Clover features">
      <div className={`home-feature-grid__track${category ? " home-feature-grid__track--open" : ""}`}>
        <div className="home-feature-grid__panel" inert={category !== null} aria-hidden={category !== null}>
          {FEATURE_NAVIGATION.map((item) => (
            <button
              key={item.label}
              type="button"
              ref={(node) => { if (node) categoryButtons.current.set(item.label, node); else categoryButtons.current.delete(item.label); }}
              className="home-feature-grid__item"
              aria-expanded={category === item.label}
              aria-controls="home-feature-category"
              onClick={() => selectCategory(item.label)}
            >
              <img src={getNavigationIconSrc(item.icon)} alt="" width={48} height={48} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
        <div id="home-feature-category" className="home-feature-grid__panel" aria-label={`${group.label} features`} inert={category === null} aria-hidden={category === null}>
          <button ref={backButton} type="button" className="home-feature-grid__item" aria-label="Back to feature categories" onClick={() => selectCategory(null)}>
            <span className="home-feature-grid__back" aria-hidden="true">
              <svg viewBox="0 0 24 24" width={24} height={24} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="m12 5-7 7 7 7M5 12h14" /></svg>
            </span>
            <span>Back</span>
          </button>
          {group.items.map((item) => (
            <Link key={item.href} href={item.href} prefetch={false} className="home-feature-grid__item">
              <img src={getNavigationIconSrc(item.key === "split-bill" ? "splitBills" : item.key)} alt="" width={48} height={48} />
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
