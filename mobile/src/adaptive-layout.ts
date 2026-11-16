/** Layout follows the current app window, never the device model or orientation. */
export function adaptiveLayout(width: number, height: number, fontScale = 1) {
  const windowWidth = Math.max(1, width);
  const compact = windowWidth < 600;
  return {
    size: compact ? "compact" : windowWidth < 840 ? "medium" : "expanded",
    compact,
    short: height < 500,
    gutter: compact ? 16 : 24,
    pageMaxWidth: 1120,
    readingMaxWidth: 760,
    formMaxWidth: 680,
    dockMaxWidth: 640,
    dockHeight: fontScale > 1.3 ? 82 : 72,
  } as const;
}

/** Respect readable text size when deciding how many columns fit. */
export function adaptiveColumns(width: number, minItemWidth: number, maxColumns: number, gap = 16, fontScale = 1) {
  return Math.max(1, Math.min(maxColumns, Math.floor((width + gap) / (minItemWidth * Math.max(1, fontScale) + gap))));
}

export function planCardLayout(width: number, fontScale = 1) {
  const columns = adaptiveColumns(width, 280, 3, 16, fontScale);
  return { columns, width: columns > 1 ? (width - (columns - 1) * 16) / columns : Math.max(1, Math.min(420, width - (width > 300 ? 20 : 0))) };
}
