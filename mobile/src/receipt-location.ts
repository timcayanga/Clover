import * as Location from "expo-location";
import { AppState, PermissionsAndroid, Platform } from "react-native";
import { countryAtReceiptLocation, type ReceiptLocationFix } from "../../shared/receipt-capture-location";

/** Called only by the user's explicit location action. No background subscription. */
export async function requestReceiptLocation(): Promise<ReceiptLocationFix | null> {
  try {
    if (AppState.currentState !== "active") return null;
    // Expo's Android helper requests both fine and coarse. Ask for coarse only,
    // including on older installed builds that still declare fine location.
    const granted = Platform.OS === "android"
      ? await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION) === PermissionsAndroid.RESULTS.GRANTED
      : (await Location.requestForegroundPermissionsAsync()).granted;
    if (!granted || AppState.currentState !== "active") return null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        (async () => {
          const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced, mayShowUserSettingsDialog: false });
          if (AppState.currentState !== "active" || fix.mocked || !Number.isFinite(fix.timestamp) || Math.abs(Date.now() - fix.timestamp) > 60_000) return null;
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
