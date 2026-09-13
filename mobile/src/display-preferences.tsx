import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
export type Appearance = "system" | "light" | "dark";
const key = "clover.appearance.v1";
const Context = createContext<{
  appearance: Appearance;
  setAppearance: (value: Appearance) => Promise<void>;
}>({ appearance: "system", setAppearance: async () => {} });
export function DisplayPreferences({ children }: { children: ReactNode }) {
  const [appearance, set] = useState<Appearance>("system");
  useEffect(() => {
    let active = true;
    void (async () => {
      const value =
        Platform.OS === "web"
          ? localStorage.getItem(key)
          : await SecureStore.getItemAsync(key);
      if (
        active &&
        (value === "system" || value === "light" || value === "dark")
      )
        set(value);
    })().catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const setAppearance = async (value: Appearance) => {
    if (Platform.OS === "web") localStorage.setItem(key, value);
    else await SecureStore.setItemAsync(key, value);
    set(value);
  };
  return (
    <Context.Provider value={{ appearance, setAppearance }}>
      {children}
    </Context.Provider>
  );
}
export const useDisplayPreferences = () => useContext(Context);
