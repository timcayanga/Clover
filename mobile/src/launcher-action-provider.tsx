import { requireOptionalNativeModule } from "expo-modules-core";
import { router, useRootNavigationState } from "expo-router";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Linking, Platform } from "react-native";
import { launcherHref, parseLauncherAction, parseLauncherUrl, type LauncherRequest } from "./launcher-actions";

type QuickActions = {
  consumeAction(): Promise<string | null>;
  addListener(event: "quickAction", listener: () => void): { remove(): void };
};

const quickActions = Platform.OS === "ios" ? requireOptionalNativeModule<QuickActions>("CloverLauncher") : null;

const LauncherContext = createContext<{
  action: LauncherRequest | null;
  consume: (action: LauncherRequest) => void;
}>({ action: null, consume: () => {} });

export function LauncherActionProvider({ children }: { children: ReactNode }) {
  const [action, setAction] = useState<LauncherRequest | null>(null);

  useEffect(() => {
    if (Platform.OS === "web") return;
    let mounted = true;
    let receivedLink = false;
    const link = Linking.addEventListener("url", ({ url }) => {
      const next = parseLauncherUrl(url);
      if (next) {
        receivedLink = true;
        setAction(next);
      }
    });
    void Linking.getInitialURL().then(url => {
      const next = parseLauncherUrl(url);
      if (mounted && !receivedLink && next) setAction(next);
    }).catch(() => {});
    const consume = () => {
      void quickActions?.consumeAction().then(value => {
        const next = value ? parseLauncherAction(value) : null;
        if (mounted && next) setAction({ action: next });
      }).catch(() => {});
    };
    const quickAction = quickActions?.addListener("quickAction", consume);
    consume();
    return () => {
      mounted = false;
      link.remove();
      quickAction?.remove();
    };
  }, []);

  const consume = useCallback((handled: LauncherRequest) => {
    setAction(current => current === handled ? null : current);
  }, []);

  return <LauncherContext.Provider value={{ action, consume }}>
    {children}
  </LauncherContext.Provider>;
}

export function useLauncherAction(appReady: boolean, workspace: string) {
  const navigationKey = useRootNavigationState()?.key;
  const { action, consume } = useContext(LauncherContext);
  useEffect(() => {
    if (!appReady || !navigationKey || !action) return;
    consume(action);
    router.push(launcherHref(action, workspace));
  }, [appReady, navigationKey, action, consume, workspace]);
  return Boolean(action);
}
