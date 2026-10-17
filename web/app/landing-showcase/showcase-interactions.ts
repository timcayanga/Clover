/** A deliberate horizontal swipe changes a plan; vertical scrolling and short taps do not. */
export function planSwipeDirection(dx: number, dy: number): -1 | 0 | 1 {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.abs(dx) < 45 || Math.abs(dx) <= Math.abs(dy) * 1.2) return 0;
  return dx < 0 ? 1 : -1;
}
