"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";

// Kept above route layouts so it sees forward and back navigation even when
// CloverShell remounts. Query edits and data refreshes aren't screen changes.
export function MobileScreenTransition() {
  const pathname = usePathname();
  const previous = useRef<{ path: string | null; index?: number } | null>(null);

  const recentPaths = useRef<(string | null)[]>([]);
  const pop = useRef(false);

  useEffect(() => {
    const onPop = () => { pop.current = true; };
    window.addEventListener("popstate", onPop, true);
    return () => window.removeEventListener("popstate", onPop, true);
  }, []);

  useLayoutEffect(() => {
    const history = (window as Window & { navigation?: { currentEntry?: { index: number } } }).navigation;
    const index = history?.currentEntry?.index;
    const prior = previous.current;
    previous.current = { path: pathname, index };
    const fromHistory = pop.current;
    pop.current = false;
    if (!prior || prior.path === pathname) return;
    const visited = recentPaths.current;
    const back = index !== undefined && prior.index !== undefined && index >= 0 && prior.index >= 0
      ? index < prior.index
      : (fromHistory && visited.at(-1) === pathname) || Boolean(pathname && prior.path?.startsWith(pathname + "/"));
    if (back) visited.pop();
    else {
      visited.push(prior.path);
      if (visited.length > 50) visited.shift();
    }
    if (!window.matchMedia("(max-width: 1100px) and (prefers-reduced-motion: no-preference)").matches) return;
    const screen = document.querySelector(".content > .content-body");
    if (!screen?.animate) return;
    const animation = screen.animate(
      [{ transform: `translateX(${back ? -28 : 28}px)` }, { transform: "translateX(0)" }],
      { duration: 220, easing: "cubic-bezier(0.22, 0.8, 0.28, 1)" },
    );
    return () => animation.cancel();
  }, [pathname]);

  return null;
}
