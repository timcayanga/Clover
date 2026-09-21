"use client";

import { storyPhotoOpacity } from "@/lib/landing-motion";
import { desktopStoryPhoto } from "@/lib/desktop-story-photos";
import { mobileStoryPhotos } from "@/lib/mobile-story-photos";
import styles from "./story-background.module.css";

/** Separate photograph and reading fade so responsive layouts never stretch a flattened frame. */
export function StoryBackground({ prefix, count, active, position = active, blurred = false, reservePhone = false }: {
  prefix: string; count: number; active: number; position?: number; blurred?: boolean; reservePhone?: boolean;
}) {
  return <div className={styles.background} data-story-background data-blurred={blurred} data-phone={reservePhone} aria-hidden="true">
    {Array.from({ length: count }, (_, index) => {
      const photo = mobileStoryPhotos[`${prefix}-mobile-${index}`];
      return <picture key={index} className={styles.scene} data-active={active === index} style={{ opacity: storyPhotoOpacity(index, position) }}>
        <source media="(max-width: 900px)" srcSet={photo} />
        <img src={desktopStoryPhoto(prefix, index, count)} alt="" draggable={false}
          fetchPriority={index === 0 ? "high" : "auto"} decoding="async" />
      </picture>;
    })}
    <div className={styles.fade} />
  </div>;
}
