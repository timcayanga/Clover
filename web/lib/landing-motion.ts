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
