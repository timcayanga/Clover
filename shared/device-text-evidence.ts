/** OCR is source evidence supplied by the client, never confirmed financial data. */
export type DeviceTextEvidence = {
  version: 1;
  source: "apple_vision" | "google_mlkit";
  text: string;
  pagesRead: number;
  totalPages: number;
  complete: boolean;
  durationMs: number;
};

export const DEVICE_TEXT_MAX_CHARACTERS = 40_000;

/** Reject malformed evidence; a valid original can still use server extraction. */
export function normalizeDeviceTextEvidence(value: unknown): DeviceTextEvidence | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (item.version !== 1 || !["apple_vision", "google_mlkit"].includes(String(item.source)) ||
      typeof item.text !== "string" || item.text.length > DEVICE_TEXT_MAX_CHARACTERS ||
      typeof item.complete !== "boolean" ||
      !Number.isSafeInteger(item.pagesRead) || !Number.isSafeInteger(item.totalPages) ||
      Number(item.pagesRead) < 1 || Number(item.pagesRead) > Number(item.totalPages) ||
      Number(item.totalPages) > 5 ||
      !Number.isFinite(item.durationMs) || Number(item.durationMs) < 0 || Number(item.durationMs) > 120_000) return null;
  const text = item.text.replace(/\u0000/g, "").trim();
  if (!text) return null;
  return {
    version: 1,
    source: item.source as DeviceTextEvidence["source"],
    text,
    pagesRead: Number(item.pagesRead),
    totalPages: Number(item.totalPages),
    complete: item.complete && item.pagesRead === item.totalPages,
    durationMs: Math.round(Number(item.durationMs)),
  };
}
