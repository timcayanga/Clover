import * as Location from "expo-location";
import { countryAtReceiptLocation, type ReceiptLocationFix } from "../../shared/receipt-capture-location";

/** Called only by the user's explicit location action. No background subscription. */
export async function requestReceiptLocation(): Promise<ReceiptLocationFix | null> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) return null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        (async () => {
          const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced, mayShowUserSettingsDialog: false });
          if (fix.mocked || Date.now() - fix.timestamp > 60_000) return null;
          const { iso1A2Code } = await import("@rapideditor/country-coder");
          const countryCode = countryAtReceiptLocation(fix.coords.latitude, fix.coords.longitude, fix.coords.accuracy,
            point => iso1A2Code(point, { level: "territory" }));
          return countryCode ? { countryCode, locatedAt: new Date(fix.timestamp).toISOString(), accuracyMeters: Math.ceil(fix.coords.accuracy!) } : null;
        })(),
        new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 4_000); }),
      ]);
    } finally { if (timer) clearTimeout(timer); }
  } catch { return null; }
}
