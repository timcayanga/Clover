"use client";

import { useEffect, useState, type RefObject } from "react";
import { purchaseChoreography } from "./showcase-choreography";

export type MotionMode = "full" | "gentle" | "off";
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const ease = (value: number) => {
  const p = clamp(value);
  return p * p * p * (p * (p * 6 - 15) + 10);
};

/** Scroll work uses compositor-friendly transforms plus a brief settling pass. Geometry is measured on layout changes, not
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
      if (
        (navigator as Navigator & { connection?: { saveData?: boolean } })
          .connection?.saveData
      )
        updateMode("gentle");
    } catch {
      /* Connection preferences are optional. */
    }
    return () => media.removeEventListener("change", change);
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
      acts: HTMLElement[];
      hasPurchase: boolean;
    }[] = [];
    let viewport = innerHeight;
    let frame = 0;
    let needsMeasure = true;
    let disposed = false;
    let previousY = scrollY;
    let previousTime = performance.now();
    const sceneProgress = new Map<HTMLElement, number>();
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
            acts: [...scene.querySelectorAll<HTMLElement>("[data-story-act]")],
            hasPurchase: Boolean(scene.querySelector("[data-purchase-throughline]")),
          };
        });
        needsMeasure = false;
      }
      const elapsed = Math.min(64, Math.max(1, time - previousTime));
      let settling = false;
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
        const { top, height, pinHeight, pinned, acts, hasPurchase } = geometry[index];
        const relativeTop = top - y;
        const visible = String(
          relativeTop < viewport && relativeTop + height > 0,
        );
        if (scene.dataset.visible !== visible) scene.dataset.visible = visible;
        // Natural-flow chapters must initialize offscreen: their relative
        // layout supplies the height that would otherwise remain zero.
        if (
          animated &&
          pinned &&
          (relativeTop + height < -viewport || relativeTop > viewport * 2)
        )
          return;
        const targetProgress = clamp(
          -relativeTop / Math.max(1, height - pinHeight),
        );
        const previousProgress = sceneProgress.get(scene) ?? targetProgress;
        const raw =
          animated && pinned && mode === "full"
            ? previousProgress +
              (targetProgress - previousProgress) *
                (1 - Math.exp(-elapsed / 65))
            : targetProgress;
        sceneProgress.set(scene, raw);
        if (Math.abs(targetProgress - raw) > 0.00015) settling = true;
        const p =
          animated && pinned ? (mode === "gentle" ? 0.7 + raw * 0.3 : raw) : 1;
        if (acts.length) {
          const staticStory = !animated || !pinned;
          scene.dataset.storyStatic = String(staticStory);
          const storyProgress = mode === "gentle" ? raw : p;
          // Shared purchase choreography crosses the scene boundary without
          // remounting or resetting: receipt → transaction → category insight.
          if (hasPurchase) {
            for (const [property, value] of Object.entries(
              purchaseChoreography(storyProgress * acts.length),
            )) write(scene, property, value);
          }
          const active = Math.min(
            acts.length - 1,
            Math.floor(storyProgress * acts.length),
          );
          acts.forEach((act, actIndex) => {
            const travel = storyProgress * acts.length - actIndex;
            const fade = mode === "gentle" ? 0.1 : 0.3;
            write(act, "--act-progress", staticStory ? 1 : ease(travel));
            write(
              act,
              "--act-enter",
              staticStory || actIndex === 0 ? 1 : ease(travel / fade),
            );
            write(
              act,
              "--act-leave",
              staticStory || actIndex === acts.length - 1
                ? 1
                : ease((1 - travel) / fade),
            );
            const activeValue = String(staticStory || active === actIndex);
            if (act.dataset.storyActive !== activeValue)
              act.dataset.storyActive = activeValue;
            const art = act.querySelector<HTMLElement>("[data-story-art]");
            if (art && art.inert !== (!staticStory && active !== actIndex))
              art.inert = !staticStory && active !== actIndex;
          });
        }
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
      previousY = y;
      previousTime = time;
      if (impulse || settling) frame = requestAnimationFrame(draw);
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

  return { mode, reduced };
}
