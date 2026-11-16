import { countryAtReceiptLocation, type ReceiptLocationFix } from "../../shared/receipt-capture-location";

/** Browser permission is requested only after an explicit click; coordinates stay here. */
export async function requestReceiptLocation(): Promise<ReceiptLocationFix | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  try {
    const fix = await new Promise<GeolocationPosition | null>(resolve => {
      navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { enableHighAccuracy: false, timeout: 4_000, maximumAge: 0 });
    });
    if (!fix || Date.now() - fix.timestamp > 60_000) return null;
    const { iso1A2Code } = await import("@rapideditor/country-coder");
    const countryCode = countryAtReceiptLocation(fix.coords.latitude, fix.coords.longitude, fix.coords.accuracy,
      point => iso1A2Code(point, { level: "territory" }));
    return countryCode ? { countryCode, locatedAt: new Date(fix.timestamp).toISOString(), accuracyMeters: Math.ceil(fix.coords.accuracy) } : null;
  } catch { return null; }
}
