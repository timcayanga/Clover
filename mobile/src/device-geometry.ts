export type Rect = { x: number; y: number; width: number; height: number };
export type Fold = Rect & { vertical: boolean; separating: boolean };

/** All coordinates are window-relative logical pixels, never physical pixels. */
export function usablePane(width: number, height: number, folds: Fold[]): Rect {
  let panes: Rect[] = [{ x: 0, y: 0, width, height }];
  for (const fold of folds) {
    if (!fold.separating || fold.width < 0 || fold.height < 0 || ![fold.x, fold.y, fold.width, fold.height].every(Number.isFinite)) continue;
    panes = panes.flatMap(pane => {
      const right = pane.x + pane.width, bottom = pane.y + pane.height;
      if (fold.vertical && fold.x < right && fold.x + fold.width > pane.x && fold.y <= pane.y && fold.y + fold.height >= bottom) {
        const after = Math.min(right, fold.x + fold.width);
        return [{ ...pane, width: Math.max(0, fold.x - pane.x) }, { ...pane, x: after, width: right - after }].filter(part => part.width > 0);
      }
      if (!fold.vertical && fold.y < bottom && fold.y + fold.height > pane.y && fold.x <= pane.x && fold.x + fold.width >= right) {
        const after = Math.min(bottom, fold.y + fold.height);
        return [{ ...pane, height: Math.max(0, fold.y - pane.y) }, { ...pane, y: after, height: bottom - after }].filter(part => part.height > 0);
      }
      return [pane];
    });
  }
  // Compare all resulting panes (including multi-fold displays), preserving a
  // left/top tie-break. An invalid OEM report must not collapse the entire app.
  return panes.reduce((best, pane) => pane.width * pane.height > best.width * best.height ? pane : best, panes[0] ?? { x: 0, y: 0, width, height });
}

export function focusScrollDelta(field: Rect, viewport: Rect, keyboard: Rect | null, margin = 16): number {
  let bottom = viewport.y + viewport.height;
  if (keyboard && keyboard.height > 0 && field.x < keyboard.x + keyboard.width && field.x + field.width > keyboard.x && keyboard.y < bottom && keyboard.y + keyboard.height > viewport.y) {
    // A floating keyboard only obstructs fields in its horizontal span.
    if (field.y + field.height > keyboard.y && field.y < keyboard.y + keyboard.height) bottom = Math.max(viewport.y, keyboard.y);
  }
  const top = viewport.y + margin;
  if (field.y + field.height + margin > bottom) return field.y + field.height + margin - bottom;
  if (field.y < top) return field.y - top;
  return 0;
}

export function supportsDetailPane(width: number, fontScale = 1) {
  // Detail containers stop growing at 1440. A larger physical display cannot
  // make their text readable if the actual panes are still too narrow.
  return Math.min(width, 1440) >= 1000 * Math.max(fontScale, 1);
}
