import type { TokenCache } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
const preferenceKey = "clover-remember-session";
const transient = new Map<string, string>();
const seen = new Set<string>();
let remember: boolean | undefined;
async function remembered() {
  if (remember === undefined)
    remember =
      (Platform.OS === "web"
        ? localStorage.getItem(preferenceKey)
        : await SecureStore.getItemAsync(preferenceKey)) !== "false";
  return remember;
}
export async function setRememberSession(value: boolean) {
  if (Platform.OS === "web") localStorage.setItem(preferenceKey, String(value));
  else await SecureStore.setItemAsync(preferenceKey, String(value));
  remember = value;
  if (!value) for (const key of seen) await tokenCache?.clearToken?.(key);
}
export const authTokenCache: TokenCache = {
  async getToken(key) {
    seen.add(key);
    return (await remembered())
      ? tokenCache?.getToken(key)
      : (transient.get(key) ?? null);
  },
  async saveToken(key, token) {
    seen.add(key);
    transient.set(key, token);
    if (await remembered()) await tokenCache?.saveToken(key, token);
    else await tokenCache?.clearToken?.(key);
  },
  async clearToken(key) {
    transient.delete(key);
    await tokenCache?.clearToken?.(key);
  },
};
