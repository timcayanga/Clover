export const MOBILE_LAYOUT_MAX_WIDTH = 1100;
export const DESKTOP_LAYOUT_MIN_WIDTH = MOBILE_LAYOUT_MAX_WIDTH + 1;
export const MOBILE_LAYOUT_MEDIA_QUERY = `(max-width: ${MOBILE_LAYOUT_MAX_WIDTH}px)`;

export type CloverViewportLayout = "mobile" | "desktop";

export const getCloverViewportLayout = (viewportWidth: number): CloverViewportLayout =>
  viewportWidth <= MOBILE_LAYOUT_MAX_WIDTH ? "mobile" : "desktop";
