export type Rect = { x: number; y: number; width: number; height: number };
export type Fold = Rect & { vertical: boolean; separating: boolean };

/** All coordinates are window-relative logical pixels, never physical pixels. */
export function usablePane(width: number, height: number, folds: Fold[]): Rect {
  let pane: Rect = { x: 0, y: 0, width, height };
  for (const fold of folds) {
    if (!fold.separating || fold.width < 0 || fold.height < 0 || ![fold.x, fold.y, fold.width, fold.height].every(Number.isFinite)) continue;
    const right = pane.x + pane.width, bottom = pane.y + pane.height;
    let choices: Rect[] = [];
    if (fold.vertical && fold.x > pane.x && fold.x + fold.width < right && fold.y <= pane.y && fold.y + fold.height >= bottom) {
      choices = [{ ...pane, width: fold.x - pane.x }, { ...pane, x: fold.x + fold.width, width: right - fold.x - fold.width }];
    } else if (!fold.vertical && fold.y > pane.y && fold.y + fold.height < bottom && fold.x <= pane.x && fold.x + fold.width >= right) {
      choices = [{ ...pane, height: fold.y - pane.y }, { ...pane, y: fold.y + fold.height, height: bottom - fold.y - fold.height }];
    }
    // Stable left/top tie-break prevents the task jumping between equal panes.
    if (choices.length) pane = choices[1].width * choices[1].height > choices[0].width * choices[0].height ? choices[1] : choices[0];
  }
  return pane;
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
  return width >= 1000 * Math.min(Math.max(fontScale, 1), 1.6);
}
