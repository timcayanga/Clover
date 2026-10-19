"use client";

import { useEffect, useState, type RefObject } from "react";
import { flowChapterTravel, flowPurchaseChoreography, purchaseChoreography, receiptJourneyFrame, merchantFlightFrame, storyTravel, type ReceiptWaypoint } from "./showcase-choreography";

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
      const requested = new URL(location.href).searchParams.get("motion");
      if (requested === "off" || requested === "gentle") {
        updateMode(requested);
      } else if (
        (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData ||
        /(^|-)2g$/.test((navigator as Navigator & { connection?: { effectiveType?: string } }).connection?.effectiveType ?? "") ||
        ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8) <= 4
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
      weights: number[];
      actTops: number[];
      actHeights: number[];
    }[] = [];
    let viewport = innerHeight;
    const purchase = element.querySelector<HTMLElement>("[data-main-purchase]");
    let receiptPoints: ReceiptWaypoint[] = [];
    let receiptScroll: number | undefined;
    let brandFlight: Parameters<typeof merchantFlightFrame>[1] | undefined;
    let brandCaption: {top:number;bottom:number} | undefined;
    let frame = 0;
    let needsMeasure = true;
    let disposed = false;
    let previousY = scrollY;
    let previousTime = performance.now();
    const sceneProgress = new Map<HTMLElement, number>();
    let impulse = 0;
    let closingProgress: number | undefined;
    const flowTravel = new Map<HTMLElement, number>();
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
            weights: [...scene.querySelectorAll<HTMLElement>("[data-story-act]")].map(act => Number(act.dataset.storyWeight ?? 1)),
            actTops: [...scene.querySelectorAll<HTMLElement>("[data-story-act]")].map(act => act.getBoundingClientRect().top + y),
            actHeights: [...scene.querySelectorAll<HTMLElement>("[data-story-act]")].map(act => act.offsetHeight),
          };
        });
        const origin = element.querySelector<HTMLElement>("[data-receipt-origin]");
        const stop = element.querySelector<HTMLElement>("[data-receipt-stop]");
        const destination = element.querySelector<HTMLElement>("[data-receipt-destination]");
        const main = element.querySelector<HTMLElement>("main");
        receiptPoints = [];
        brandFlight = undefined;
        brandCaption = undefined;
        if (purchase && getComputedStyle(purchase).display !== "none" && origin && stop && destination && main) {
          const source = origin.getBoundingClientRect(), middle = stop.getBoundingClientRect(), target = destination.getBoundingClientRect();
          const mainTop = main.getBoundingClientRect().top + y;
          const connectTop = stop.closest<HTMLElement>("[data-story-act]")!.getBoundingClientRect().top + y;
          const reportTop = destination.closest<HTMLElement>("[data-story-act]")!.getBoundingClientRect().top + y;
          const mobile = matchMedia("(max-width:900px), (max-width:1100px) and (min-height:1000px)").matches;
          const sourceWidth = Math.min(source.width, 230), middleWidth = mobile ? 105 : 230;
          const markX = target.left + target.width * .86;
          const markY = target.top + y - mainTop + target.height * .16;
          const point = (at:number,x:number,docY:number,width:number,merge=0,opacity=1,rotate=0) => ({at,x,y:docY-mainTop,width,merge,opacity,rotate});
          receiptPoints = [
            point(0,source.left,source.top+y,sourceWidth,0,1,5),
            point(connectTop*.45,mobile?-sourceWidth*.88:innerWidth*.74,connectTop*.45+110,sourceWidth,0,1,-5),
            point(connectTop-viewport*.35,middle.left,middle.top+y,middleWidth,0,1,-3),
            point(connectTop-viewport*.10,middle.left,middle.top+y,middleWidth,0,1,0),
          ];
          const caption = element.querySelector<HTMLElement>("[data-receipt-caption]")?.getBoundingClientRect();
          brandCaption = mobile && caption ? {top:caption.top+y-mainTop,bottom:caption.bottom+y-mainTop} : undefined;
          brandFlight = {
            start:connectTop-viewport*.08, arrival:reportTop-viewport*.15, end:reportTop+viewport*.06,
            x0:middle.left+middleWidth/2, y0:middle.top+y-mainTop+43*middleWidth/230,
            x1:markX, y1:markY, width:38*middleWidth/230,
          };
        }
        needsMeasure = false;
      }
      const elapsed = Math.min(64, Math.max(1, time - previousTime));
      let settling = false;
      const receiptTarget = !animated || receiptPoints.length === 0 ? 0 : y;
      const receiptPrevious = receiptScroll ?? receiptTarget;
      receiptScroll = animated && mode === "full" ? receiptPrevious + (receiptTarget - receiptPrevious) * (1 - Math.exp(-elapsed / 75)) : receiptTarget;
      if (Math.abs(receiptTarget - receiptScroll) > .05) settling = true;
      const receipt = receiptJourneyFrame(receiptScroll, receiptPoints);
      if (purchase && receipt) {
        purchase.style.setProperty("--receipt-x", `${receipt.x.toFixed(2)}px`);
        purchase.style.setProperty("--receipt-y", `${receipt.y.toFixed(2)}px`);
        write(purchase,"--receipt-scale",receipt.width/230);
        const brand = brandFlight ? merchantFlightFrame(receiptScroll,brandFlight) : null;
        write(purchase,"--receipt-merge",brand?.takeoff ?? 0);
        if (brand) {
          purchase.style.setProperty("--brand-x",`${brand.x.toFixed(2)}px`);
          purchase.style.setProperty("--brand-y",`${brand.y.toFixed(2)}px`);
          write(purchase,"--brand-scale",brand.width/64);
          const captionDistance = brandCaption ? Math.max(brandCaption.top-brand.y,brand.y-brandCaption.bottom,0) : 28;
          const clarity = .14 + .86 * ease(captionDistance/28);
          write(purchase,"--brand-opacity",brand.opacity*clarity);
        }
        write(purchase,"--receipt-opacity",receipt.opacity);
        purchase.style.setProperty("--receipt-rotate", `${receipt.rotate.toFixed(2)}deg`);
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
        const { top, height, pinHeight, pinned, acts, hasPurchase, weights, actTops, actHeights } = geometry[index];
        const flow = scene.dataset.scrollFlow === "true";
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
        // A separate full-viewport passage keeps the closing photos moving
        // gently after their entrance, without moving the caption or buttons.
        if (scene.id === "start-with-clover") {
          const photoTarget = clamp((viewport - relativeTop) / Math.max(1, viewport + height));
          const photoPrevious = closingProgress ?? photoTarget;
          const photoProgress = animated && mode === "full"
            ? photoPrevious + (photoTarget - photoPrevious) * (1 - Math.exp(-elapsed / 110))
            : photoTarget;
          closingProgress = photoProgress;
          if (Math.abs(photoTarget - photoProgress) > .00015) settling = true;
          write(scene, "--photo-progress", animated ? ease(photoProgress) : .5);
        }
        const targetProgress = clamp(
          -relativeTop / Math.max(1, flow ? height : height - pinHeight),
        );
        const previousProgress = sceneProgress.get(scene) ?? targetProgress;
        const raw =
          animated && pinned && mode === "full"
            ? previousProgress +
              (targetProgress - previousProgress) *
                (1 - Math.exp(-elapsed / 85))
            : targetProgress;
        sceneProgress.set(scene, raw);
        if (Math.abs(targetProgress - raw) > 0.00015) settling = true;
        const p =
          animated && (pinned || flow) ? (mode === "gentle" ? 0.7 + raw * 0.3 : raw) : 1;
        if (acts.length) {
          const staticStory = !animated || (!pinned && !flow);
          scene.dataset.storyStatic = String(staticStory);
          const storyProgress = mode === "gentle" ? raw : p;
          const travelTarget = flow
            ? flowChapterTravel(y + viewport * .65, actTops)
            : storyTravel(storyProgress, weights);
          // Let only the purchase settle gently; document scrolling and captions
          // remain directly attached to the user's gesture.
          const previousTravel = flowTravel.get(scene) ?? travelTarget;
          const chapterTravel = flow && animated && mode === "full"
            ? previousTravel + (travelTarget - previousTravel) * (1 - Math.exp(-elapsed / 100))
            : travelTarget;
          flowTravel.set(scene, chapterTravel);
          if (Math.abs(travelTarget - chapterTravel) > .00015) settling = true;
          // Shared purchase choreography crosses the scene boundary without
          // remounting or resetting: receipt → transaction → category insight.
          if (hasPurchase) {
            const flowChoreography = flow ? flowPurchaseChoreography(!animated ? 0 : chapterTravel) : null;
            const choreography = flowChoreography ?? purchaseChoreography(chapterTravel, { trustInterlude: false });
            if (flowChoreography) {
              scene.style.setProperty("--chapter-height", `${actHeights[0]}px`);
              const distance = (actTops[1] ?? actTops[0]) - actTops[0];
              scene.style.setProperty("--handoff-offset", `${(distance * flowChoreography["--handoff-bridge"]).toFixed(2)}px`);
            }
            for (const [property, value] of Object.entries(choreography))
              write(scene, property, value);
          }
          const active = Math.min(
            acts.length - 1,
            Math.floor(chapterTravel),
          );
          acts.forEach((act, actIndex) => {
            const travel = chapterTravel - actIndex;
            const actVisible = String(actTops[actIndex] - y < viewport && actTops[actIndex] + actHeights[actIndex] > y);
            if (act.dataset.visible !== actVisible) act.dataset.visible = actVisible;
            const fade = mode === "gentle" ? 0.1 : 0.3;
            const naturalEnter = (flow || staticStory) && animated ? ease((viewport - (actTops[actIndex] - y)) / (viewport * .65)) : 1;
            write(act, "--natural-enter", naturalEnter);
            write(act, "--act-progress", staticStory || flow ? naturalEnter : ease(travel));
            write(
              act,
              "--act-enter",
              staticStory || flow || actIndex === 0 ? 1 : ease((travel + fade / 2) / fade),
            );
            write(
              act,
              "--act-leave",
              staticStory || flow || actIndex === acts.length - 1
                ? 1
                : ease((1 + fade / 2 - travel) / fade),
            );
            const activeValue = String(staticStory || flow || active === actIndex);
            if (act.dataset.storyActive !== activeValue)
              act.dataset.storyActive = activeValue;
            act.inert = !staticStory && !flow && active !== actIndex;
            const art = act.querySelector<HTMLElement>("[data-story-art]");
            if (art && art.inert !== (!staticStory && !flow && active !== actIndex))
              art.inert = !staticStory && !flow && active !== actIndex;
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
    element.dataset.enhanced = "true";
    schedule();
    document.fonts.ready.then(measure);
    addEventListener("scroll", schedule, { passive: true });
    addEventListener("resize", measure);
    element.addEventListener("pointermove", pointer, { passive: true });
    element.addEventListener("pointerleave", clearPointer);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      disposed = true;
      delete element.dataset.enhanced;
      scenes.forEach(scene => scene.querySelectorAll<HTMLElement>("[data-story-act]").forEach(act => { act.inert = false; }));
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
