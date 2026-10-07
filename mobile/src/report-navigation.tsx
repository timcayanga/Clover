import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
  type RefObject,
} from "react";
import { AccessibilityInfo, ScrollView, View } from "react-native";
import { ChoiceField } from "./transaction-entry";
import { useAccessibilityPreferences } from "./accessibility-preferences";
type Entry = { id: string; title: string; ref: RefObject<View | null> };
const CurrencyContext = createContext("");
export function ReportCurrencyScope({
  currency,
  children,
}: {
  currency: string;
  children: ReactNode;
}) {
  return (
    <CurrencyContext.Provider value={currency}>
      {children}
    </CurrencyContext.Provider>
  );
}
const Context = createContext<{
  register: (e: Entry) => () => void;
  entries: Entry[];
  jump: (id: string) => void;
} | null>(null);
export function ReportNavigation({
  children,
  controller,
}: {
  children: ReactNode;
  controller: { ref: RefObject<ScrollView | null>; offset: RefObject<number> };
}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const { reduceMotion } = useAccessibilityPreferences();
  const register = useCallback((entry: Entry) => {
    setEntries((previous) => [
      ...previous.filter((e) => e.id !== entry.id),
      entry,
    ]);
    return () =>
      setEntries((previous) => previous.filter((e) => e.id !== entry.id));
  }, []);
  function jump(id: string) {
    const entry = entries.find((e) => e.id === id);
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        entry?.ref.current?.measureInWindow((_x, y) => {
          controller.ref.current
            ?.getNativeScrollRef()
            ?.measureInWindow((_sx, sy) => {
              controller.ref.current?.scrollTo({
                y: Math.max(0, controller.offset.current + y - sy - 12),
                animated: !reduceMotion,
              });
              AccessibilityInfo.announceForAccessibility(entry.title);
            });
        }),
      ),
    );
  }
  return (
    <Context.Provider value={{ register, entries, jump }}>
      {children}
    </Context.Provider>
  );
}
export function ReportJumpTarget({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const currency = useContext(CurrencyContext);
  const context = useContext(Context),
    register = context?.register;
  const ref = useRef<View>(null),
    id = useRef(Math.random().toString(36).slice(2));
  useEffect(
    () =>
      register?.({
        id: id.current,
        title: currency ? `${currency} · ${title}` : title,
        ref,
      }),
    [register, title, currency],
  );
  return (
    <View ref={ref} collapsable={false}>
      {children}
    </View>
  );
}
export function ReportDirectory() {
  const context = useContext(Context);
  if (!context?.entries.length) return null;
  return (
    <ChoiceField
      label="Jump to a report"
      value=""
      onChange={context.jump}
      options={context.entries.map((e) => ({ value: e.id, label: e.title }))}
    />
  );
}
