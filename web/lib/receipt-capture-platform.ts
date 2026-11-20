/** Mobile browser capture controls; desktop file pickers remain available everywhere. */
export function supportsReceiptCapture(browser?: { userAgent: string; platform?: string; maxTouchPoints?: number } | null): boolean {
  const device = browser === undefined ? (typeof navigator === "undefined" ? null : navigator) : browser;
  return Boolean(device && (/Android|iPhone|iPad|iPod/i.test(device.userAgent) ||
    (device.platform === "MacIntel" && (device.maxTouchPoints ?? 0) > 1)));
}
