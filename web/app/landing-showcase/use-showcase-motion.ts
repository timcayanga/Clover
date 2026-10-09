"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";

export type MotionMode = "full" | "gentle" | "off";
const preferenceKey = "clover-showcase-motion";
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const ease = (value: number) => {
  const p = clamp(value);
  return p * p * (3 - 2 * p);
};

/** Scroll work is transform-only. Geometry is measured on layout changes, not
 * on every scroll frame; no continuous JavaScript loop runs while idle. */
export function useShowcaseMotion(root: RefObject<HTMLDivElement | null>) {
  const [mode, updateMode] = useState<MotionMode>("full");
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(media.matches);
    change();
    media.addEventListener("change", change);
    try {
      const saved = localStorage.getItem(preferenceKey);
      if (saved === "full" || saved === "gentle" || saved === "off") {
        updateMode(saved);
      } else if (
        (navigator as Navigator & { connection?: { saveData?: boolean } })
          .connection?.saveData
      ) {
        updateMode("gentle");
      }
    } catch {
      /* Storage is optional, including in private browsers. */
    }
    return () => media.removeEventListener("change", change);
  }, []);
  const setMode = useCallback((value: MotionMode) => {
    updateMode(value);
    try {
      localStorage.setItem(preferenceKey, value);
    } catch {
      /* Optional preference. */
    }
  }, []);
  const animated = mode !== "off" && !reduced;

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const scenes = [
      ...element.querySelectorAll<HTMLElement>("[data-scroll-scene]"),
    ];
    const finePointer = matchMedia("(hover: hover) and (pointer: fine)");
    let geometry: {
      top: number;
      height: number;
      pinHeight: number;
      pinned: boolean;
    }[] = [];
    let viewport = innerHeight;
    let maxScroll = 1;
    let frame = 0;
    let needsMeasure = true;
    let disposed = false;
    let previousY = scrollY;
    let previousTime = performance.now();
    let impulse = 0;
    let pointerX = 0;
    let pointerY = 0;
    const write = (node: HTMLElement, property: string, value: number) => {
      const next = value.toFixed(4);
      if (node.style.getPropertyValue(property) !== next)
        node.style.setProperty(property, next);
    };
    const draw = (time: number) => {
      frame = 0;
      if (document.hidden) return;
      const y = scrollY;
      if (needsMeasure) {
        viewport = innerHeight;
        geometry = scenes.map((scene) => {
          const box = scene.getBoundingClientRect();
          const pin = scene.firstElementChild as HTMLElement;
          const pinned = getComputedStyle(pin).position === "sticky";
          return {
            top: box.top + y,
            height: box.height,
            pinHeight: pin.offsetHeight,
            pinned,
          };
        });
        maxScroll = Math.max(
          1,
          document.documentElement.scrollHeight - viewport,
        );
        needsMeasure = false;
      }
      const delta = y - previousY;
      // A small reversible inertia on ornaments; never shake headings or amounts.
      const target = Math.max(
        -1,
        Math.min(1, delta / Math.max(16, time - previousTime) / 2),
      );
      impulse =
        mode === "full" && animated ? impulse * 0.78 + target * 0.22 : 0;
      if (Math.abs(impulse) < 0.002) impulse = 0;
      scenes.forEach((scene, index) => {
        const { top, height, pinHeight, pinned } = geometry[index];
        const relativeTop = top - y;
        const visible = String(
          relativeTop < viewport && relativeTop + height > 0,
        );
        if (scene.dataset.visible !== visible) scene.dataset.visible = visible;
        if (relativeTop + height < -viewport || relativeTop > viewport * 2)
          return;
        const raw = clamp(-relativeTop / Math.max(1, height - pinHeight));
        const p =
          animated && pinned ? (mode === "gentle" ? 0.7 + raw * 0.3 : raw) : 1;
        write(scene, "--p", p);
        write(scene, "--a", ease((p - 0.03) / 0.68));
        write(scene, "--b", ease((p - 0.18) / 0.57));
        write(scene, "--c", ease((p - 0.4) / 0.36));
        write(
          scene,
          "--enter",
          animated ? ease((viewport - relativeTop) / (viewport * 0.75)) : 1,
        );
        write(
          scene,
          "--leave",
          animated && pinned && mode === "full" ? ease((raw - 0.88) / 0.22) : 0,
        );
        write(scene, "--impulse", impulse);
        write(scene, "--pointer-x", animated && mode === "full" ? pointerX : 0);
        write(scene, "--pointer-y", animated && mode === "full" ? pointerY : 0);
      });
      write(element, "--page-travel", clamp(y / maxScroll));
      previousY = y;
      previousTime = time;
      if (impulse) frame = requestAnimationFrame(draw);
    };
    const schedule = () => {
      if (!disposed && !frame && !document.hidden)
        frame = requestAnimationFrame(draw);
    };
    const measure = () => {
      needsMeasure = true;
      schedule();
    };
    const pointer = (event: PointerEvent) => {
      if (
        !animated ||
        mode !== "full" ||
        !finePointer.matches ||
        event.pointerType !== "mouse"
      )
        return;
      pointerX = (event.clientX / innerWidth - 0.5) * 2;
      pointerY = (event.clientY / viewport - 0.5) * 2;
      schedule();
    };
    const clearPointer = () => {
      pointerX = 0;
      pointerY = 0;
      schedule();
    };
    const visibility = () => {
      element.dataset.awake = String(!document.hidden);
      if (document.hidden) {
        cancelAnimationFrame(frame);
        frame = 0;
      } else {
        previousY = scrollY;
        impulse = 0;
        measure();
      }
    };
    const resize = new ResizeObserver(measure);
    resize.observe(element);
    scenes.forEach((scene) => resize.observe(scene));
    element.dataset.awake = "true";
    schedule();
    document.fonts.ready.then(measure);
    addEventListener("scroll", schedule, { passive: true });
    addEventListener("resize", measure);
    element.addEventListener("pointermove", pointer, { passive: true });
    element.addEventListener("pointerleave", clearPointer);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      removeEventListener("scroll", schedule);
      removeEventListener("resize", measure);
      element.removeEventListener("pointermove", pointer);
      element.removeEventListener("pointerleave", clearPointer);
      document.removeEventListener("visibilitychange", visibility);
      resize.disconnect();
    };
  }, [animated, mode, root]);

  const navigateScene = useCallback(
    (direction: -1 | 0 | 1) => {
      const scenes = [
        ...(root.current?.querySelectorAll<HTMLElement>(
          "[data-scroll-scene]",
        ) ?? []),
      ];
      if (!scenes.length) return;
      const positions = scenes.map(
        (scene) => scene.getBoundingClientRect().top + scrollY,
      );
      let current = 0;
      positions.forEach((top, index) => {
        if (top <= scrollY + innerHeight * 0.4) current = index;
      });
      const target = Math.max(
        0,
        Math.min(scenes.length - 1, current + direction),
      );
      scrollTo({
        top: positions[target],
        behavior: animated ? "smooth" : "instant",
      });
    },
    [animated, root],
  );
  return { mode, setMode, reduced, navigateScene };
}
