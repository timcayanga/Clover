"use client";

import { connectPlatformDesigns } from "@/lib/connect-platform-designs";
import { mobileStoryPhotos } from "@/lib/mobile-story-photos";
import styles from "./story-background.module.css";

/** Separate photograph and reading fade so responsive layouts never stretch a flattened frame. */
export function StoryBackground({ prefix, count, active, blurred = false }: {
  prefix: string; count: number; active: number; blurred?: boolean;
}) {
  return <div className={styles.background} data-story-background data-blurred={blurred} aria-hidden="true">
    {Array.from({ length: count }, (_, index) => {
      const photo = mobileStoryPhotos[`${prefix}-mobile-${index}`];
      return <picture key={index} className={styles.scene} data-active={active === index}>
        <source media="(max-width: 900px)" srcSet={photo} />
        <img src={connectPlatformDesigns[`${prefix}-desktop-${index}`].background} alt="" draggable={false}
          fetchPriority={index === 0 ? "high" : "auto"} decoding="async" />
      </picture>;
    })}
    <div className={styles.fade} />
  </div>;
}
