"use client";
import { useEffect, useRef, useState, type RefObject } from "react";
import s from "./showcase.module.css";

export function BrandStage({
  animated,
  progress,
}: {
  animated: boolean;
  progress: RefObject<number>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(false);
    if (!animated || !host.current) return;
    const controller = new AbortController();
    let dispose: (() => void) | undefined;
    const connection = (
      navigator as Navigator & { connection?: { saveData?: boolean } }
    ).connection;
    if (connection?.saveData) return;
    void import("./clover-scene")
      .then(({ mountCloverScene }) =>
        mountCloverScene(
          host.current!,
          controller.signal,
          () => progress.current,
          () => {
            if (!controller.signal.aborted) setReady(true);
          },
          () => {
            if (!controller.signal.aborted) setReady(false);
          },
        ),
      )
      .then((cleanup) => {
        if (controller.signal.aborted) cleanup();
        else dispose = cleanup;
      })
      .catch(() => {
        if (!controller.signal.aborted) setReady(false);
      });
    return () => {
      controller.abort();
      dispose?.();
    };
  }, [animated, progress]);
  return (
    <div className={s.brandStage} data-renderer={ready ? "webgl" : "fallback"}>
      <div className={s.brandShadow} />
      <img
        className={s.brandFallback}
        data-hidden={ready}
        src="/clover-mark.svg"
        alt=""
        width={320}
        height={320}
      />
      <div ref={host} className={s.canvasHost} />
    </div>
  );
}
