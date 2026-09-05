// Plateaus keep the preceding photograph unchanged throughout table chapters,
// including their entry and exit boundaries. Normal scroll owns all transitions.
export function landingScenePosition(position: number) {
  if (position <= 1.5) return 0;
  if (position < 2) return (position - 1.5) * 2;
  if (position <= 6) return position - 1;
  if (position <= 7.5) return 5;
  return 5 + Math.min(1, (position - 7.5) * 2) * 2;
}

export function featurePhotoPosition(position: number, hasPricing: boolean) {
  if (!hasPricing || position <= 2) return position;
  if (position <= 3.5) return 2;
  return 2 + Math.min(1, (position - 3.5) * 2) * 2;
}

// Give every chapter a complete, equal scroll interval, including the final
// content chapter. Photo interpolation must not decide how long copy is shown.
export function featureChapterPosition(progress: number, count: number) {
  return Math.max(0, Math.min(count - 1, progress * count - 0.5));
}

export function featureChapterProgress(index: number, count: number) {
  if (index <= 0) return 0;
  if (index >= count - 1) return 1;
  return (index + 0.5) / count;
}
