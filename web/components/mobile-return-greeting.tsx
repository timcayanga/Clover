"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useUser } from "@clerk/nextjs";
import { greetingName } from "../../shared/home-return";

const greeted = new Set<string>();

export function MobileReturnGreeting() {
  const { user } = useUser();
  const userId = user?.id;
  const [phase, setPhase] = useState<"hidden" | "entering" | "leaving">("hidden");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dismiss = useCallback(() => {
    clearTimeout(timer.current);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPhase("hidden");
      return;
    }
    setPhase("leaving");
    timer.current = setTimeout(() => setPhase("hidden"), 330);
  }, []);

  useEffect(() => {
    setPhase("hidden");
    if (!userId || !window.matchMedia("(max-width: 767px)").matches) return;
    let background: number | null = null;
    const show = () => {
      clearTimeout(timer.current);
      setPhase("entering");
      timer.current = setTimeout(dismiss, 750);
    };
    if (!greeted.has(userId)) {
      greeted.add(userId);
      show();
    }
    const change = () => {
      if (document.visibilityState === "hidden") {
        background = Date.now();
        clearTimeout(timer.current);
        setPhase("hidden");
      } else if (background !== null) {
        if (Date.now() - background >= 30000) show();
        background = null;
      }
    };
    document.addEventListener("visibilitychange", change);
    return () => {
      clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", change);
    };
  }, [dismiss, userId]);

  if (!user || phase === "hidden") return null;
  const greeting = greetingName(user.firstName);
  return createPortal(
    <button type="button" className="mobile-return-greeting" data-phase={phase}
      aria-label={`${greeting} Continue to Clover`} onClick={dismiss}>
      {greeting}
    </button>,
    document.body,
  );
}
