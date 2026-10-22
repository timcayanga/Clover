import assert from "node:assert/strict";
import { iso1A2Code } from "@rapideditor/country-coder";
import { captureReceiptLocation, countryAtReceiptLocation, locationMatchesReceiptDate, normalizeReceiptCaptureLocation } from "../../shared/receipt-capture-location";
import { applyReceiptDefaultCurrency } from "../lib/receipt-intake";
import { uploadInParts } from "../../mobile/src/offline/resumable-upload";

async function main() {
  const now = Date.now(), today = new Date(now).toISOString().slice(0, 10);
  const fix = { countryCode: "ID", locatedAt: new Date(now - 1_000).toISOString(), accuracyMeters: 200 };
  const hint = captureReceiptLocation(fix, now)!;
  assert.ok(hint);
  const raw = { currency: null, transaction_date: today, confidence_score: .98,
    parser_evidence: { reason: "Receipt image", source_text: "Coffee House\nTOTAL 125000" } };
  const before = JSON.stringify(raw);
  const result = applyReceiptDefaultCurrency(raw, "PHP", "", hint);
  assert.equal(result.currency, "IDR", "Ambiguous Indonesian photo uses the opted-in capture country");
  assert.equal(result.currency_resolution?.source, "device_location");
  assert.equal(result.currency_resolution?.requiresReview, false);
  assert.equal(result.currency_resolution?.confidence, .7, "Location is a suggestion, not printed evidence");
  assert.equal(result.parser_evidence.source_text, raw.parser_evidence.source_text);
  assert.equal(result.confidence_score, raw.confidence_score);
  assert.equal(JSON.stringify(raw), before, "Raw extraction is immutable");
  assert.equal(applyReceiptDefaultCurrency({ ...raw, currency: "USD" }, "PHP", "", hint).currency, "USD");
  assert.equal(applyReceiptDefaultCurrency(raw, "USD", "Singapore 238839", hint).currency, "SGD", "Printed country precedes current location");
  assert.equal(applyReceiptDefaultCurrency(raw, "PHP", "Philippines\nUnited States", hint).currency, "PHP", "Conflicting printed regions cannot be resolved by current GPS");
  assert.equal(applyReceiptDefaultCurrency(raw, "PHP").currency, "PHP", "Denial and unavailability retain existing behavior");
  assert.equal(applyReceiptDefaultCurrency({ ...raw, transaction_date: "2020-01-01" }, "PHP", "", hint).currency, "PHP", "An older receipt cannot inherit today's country");
  assert.equal(applyReceiptDefaultCurrency({ ...raw, transaction_date: null }, "PHP", "", hint).currency, "PHP");
  assert.equal(applyReceiptDefaultCurrency({ ...raw, transaction_date: "2026-02-30" }, "PHP", "", hint).currency, "PHP");
  assert.equal(applyReceiptDefaultCurrency(result, "PHP", "", hint).parser_evidence.reason, result.parser_evidence.reason, "Recovery doesn't duplicate explanations");
  assert.equal(applyReceiptDefaultCurrency({ ...result, currency: "EUR" }, "PHP", "", hint).currency, "EUR", "A corrected currency is never replaced");
  assert.equal(captureReceiptLocation({ ...fix, locatedAt: new Date(now - 601_000).toISOString() }, now), null);
  for (const bad of [null, {}, { ...hint, source: "ip" }, { ...hint, accuracyMeters: 5001 }, { ...hint, accuracyMeters: -1 }, { ...hint, accuracyMeters: NaN }, { ...hint, capturedAt: "bad" }, { ...hint, countryCode: "Indonesia" }, { ...hint, capturedAt: new Date(now + 300_000).toISOString() }]) {
    assert.equal(normalizeReceiptCaptureLocation(bad, now), null);
  }
  assert.deepEqual(normalizeReceiptCaptureLocation({ ...hint, latitude: -6.2, longitude: 106.8, vpnCountry: "US", currency: "USD" }, now), hint, "Precise coordinates and arbitrary financial values are stripped");
  assert.ok(locationMatchesReceiptDate(hint, today));
  assert.equal(locationMatchesReceiptDate(hint, "2020-01-01"), false);
  const lookup = (point: [number, number]) => iso1A2Code(point, { level: "territory" });
  for (const [lat, lon, code] of [[-6.2, 106.82, "ID"], [-8.65, 115.22, "ID"], [14.55, 121.02, "PH"], [51.51, -.12, "GB"], [40.75, -73.98, "US"]] as const) {
    assert.equal(countryAtReceiptLocation(lat, lon, 200, lookup), code);
  }
  assert.equal(countryAtReceiptLocation(14, 120, 6000, lookup), null);
  assert.equal(countryAtReceiptLocation(NaN, 120, 20, lookup), null);
  assert.equal(countryAtReceiptLocation(0, 0, 20, lookup), null, "Ocean fixes cannot establish a country");
  assert.equal(countryAtReceiptLocation(1.45, 103.77, 3000, lookup), null, "Uncertainty across the Singapore/Malaysia border must fall back");
  const bodies: Record<string, unknown>[] = [];
  await uploadInParts(async <T>(path: string, options?: RequestInit) => {
    const body = JSON.parse(String(options?.body ?? "{}")); bodies.push(body);
    return (path.includes("/start") ? { parts: [], state: "uploading" } : {}) as T;
  }, { id: "fictional-photo", workspaceId: "fictional-profile", name: "receipt.jpg", mimeType: "image/jpeg", size: 3,
    createdAt: new Date(now).toISOString(), state: "queued", receiptCaptureLocation: hint }, "AAAA", {
    signal: new AbortController().signal, progress: async () => {},
  });
  assert.deepEqual(bodies.at(-1)?.receiptCaptureLocation, hint, "Offline transport forwards the capture context at completion");
  assert.ok(!JSON.stringify(bodies).includes("latitude"));
  console.log("PASS receipt location: offline country lookup, currency precedence, old receipts, consent fallback, borders, provenance and retry transport.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
