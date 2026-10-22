/** A country suggestion for one newly captured photo. Never contains coordinates. */
export type ReceiptCaptureLocation = {
  source: "device_location";
  countryCode: string;
  locatedAt: string;
  capturedAt: string;
  accuracyMeters: number;
};

export type ReceiptLocationFix = { countryCode: string; locatedAt: string; accuracyMeters: number };
const TEN_MINUTES = 10 * 60_000;

/** Unknown keys (including coordinates) cannot enter the upload or audit trail. */
export function normalizeReceiptCaptureLocation(value: unknown, now = Date.now()): ReceiptCaptureLocation | null {
  if (!value || typeof value !== "object") return null;
  const hint = value as Record<string, unknown>;
  if (hint.source !== "device_location" || typeof hint.countryCode !== "string" || !/^[A-Z]{2}$/.test(hint.countryCode)) return null;
  if (typeof hint.locatedAt !== "string" || typeof hint.capturedAt !== "string") return null;
  const located = Date.parse(hint.locatedAt), captured = Date.parse(hint.capturedAt);
  if (!Number.isFinite(located) || !Number.isFinite(captured) || captured < located || captured - located > TEN_MINUTES || captured > now + 120_000) return null;
  if (typeof hint.accuracyMeters !== "number" || !Number.isFinite(hint.accuracyMeters) || hint.accuracyMeters <= 0 || hint.accuracyMeters > 5_000) return null;
  return { source: "device_location", countryCode: hint.countryCode, locatedAt: new Date(located).toISOString(), capturedAt: new Date(captured).toISOString(), accuracyMeters: Math.ceil(hint.accuracyMeters) };
}

export function captureReceiptLocation(fix: ReceiptLocationFix | null, now = Date.now()) {
  return fix ? normalizeReceiptCaptureLocation({ ...fix, source: "device_location", capturedAt: new Date(now).toISOString() }, now) : null;
}

/** Current location must not assign a currency to a receipt from an earlier trip. */
export function locationMatchesReceiptDate(hint: ReceiptCaptureLocation, date?: string | null) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date &&
    Math.abs(parsed.getTime() - Date.parse(hint.capturedAt)) <= 36 * 60 * 60_000;
}

/** Resolve locally; decline uncertain fixes and borders rather than trust an IP/VPN. */
export function countryAtReceiptLocation(
  latitude: number, longitude: number, accuracyMeters: number | null,
  lookup: (point: [number, number]) => string | null | undefined,
): string | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 85 || Math.abs(longitude) > 180 ||
      accuracyMeters === null || !Number.isFinite(accuracyMeters) || accuracyMeters <= 0 || accuracyMeters > 5_000) return null;
  // Include a buffer for simplified country boundaries; sample around the entire uncertainty envelope.
  const radius = Math.max(accuracyMeters, 1_000), dy = radius / 111_000;
  const dx = dy / Math.cos(latitude * Math.PI / 180);
  const country = lookup([longitude, latitude]);
  if (!country || !/^[A-Z]{2}$/.test(country)) return null;
  for (let step = 0; step < 8; step++) {
    const angle = step * Math.PI / 4;
    if (lookup([longitude + dx * Math.cos(angle), latitude + dy * Math.sin(angle)]) !== country) return null;
  }
  return country;
}

export function receiptLocationCountryLabel(code: string) {
  try { return new Intl.DisplayNames(["en"], { type: "region" }).of(code) || code; } catch { return code; }
}
