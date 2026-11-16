import type { TokenCache } from '@clerk/expo';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { createPersistentTokenCache } from './persistent-token-cache';
// Keep the existing Clerk keys and accessibility policy so installed sessions
// migrate in place. Browser Clerk continues to own its cookies.
const options = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };
const persistent = createPersistentTokenCache({
  get: async key => Platform.OS === 'web' ? localStorage.getItem(key) : SecureStore.getItemAsync(key, options),
  set: async (key, value) => {
    if (Platform.OS === 'web') localStorage.setItem(key, value);
    else await SecureStore.setItemAsync(key, value, options);
  },
  remove: async key => {
    if (Platform.OS === 'web') localStorage.removeItem(key);
    else await SecureStore.deleteItemAsync(key, options);
  },
});
export const setRememberSession = persistent.setRememberSession;
export const authTokenCache: TokenCache = persistent.cache;
