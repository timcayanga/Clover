import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { requireOptionalNativeModule } from "expo";
import { Platform, View, useWindowDimensions } from "react-native";
import { usablePane, type Fold, type Rect } from "./device-geometry";
const PaneContext = createContext<Rect | null>(null);
const FoldContext = createContext<Fold[]>([]);
export const useWindowPane = () => useContext(PaneContext);
type WindowModule = { addListener: (name: "layoutChanged", callback: (event: { folds: Fold[] }) => void) => { remove: () => void } };
const nativeWindow = Platform.OS === "android" ? requireOptionalNativeModule<WindowModule>("CloverWindow") : null;

export function WindowPaneProvider({ children }: { children: ReactNode }) {
  const [folds, setFolds] = useState<Fold[]>([]);
  useEffect(() => {
    const listener = nativeWindow?.addListener("layoutChanged", event => setFolds(event.folds));
    return () => listener?.remove();
  }, []);
  return <FoldContext.Provider value={folds}>{children}</FoldContext.Provider>;
}

/** Keep one stable navigation tree inside an unobstructed pane. Resizing does
 * not remount routes, discard drafts, or restart uploads. Also wrap native modals. */
export function WindowPane({ children }: { children: ReactNode }) {
  const window = useWindowDimensions();
  const folds = useContext(FoldContext);
  const pane = usablePane(window.width, window.height, folds);
  return <View style={{ flex: 1, paddingLeft: pane.x, paddingTop: pane.y, paddingRight: Math.max(0, window.width - pane.x - pane.width), paddingBottom: Math.max(0, window.height - pane.y - pane.height) }}>
    <PaneContext.Provider value={pane}><View style={{ flex: 1, minWidth: 0, minHeight: 0 }}>{children}</View></PaneContext.Provider>
  </View>;
}
