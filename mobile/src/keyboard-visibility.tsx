import { createContext, useCallback, useEffect, useRef } from "react";
import { Keyboard, Platform, type ScrollView, type TextInput } from "react-native";
import { focusScrollDelta, type Rect } from "./device-geometry";

export const FocusVisibility = createContext<(input: TextInput | null) => void>(() => {});

/** Supplement native keyboard insets with focused-field visibility, including
 * floating keyboards. Measure AFTER native layout rather than adding a second inset. */
export function useKeyboardVisibility(bottomOcclusion = 0) {
  const reservedBottom = useRef(bottomOcclusion); reservedBottom.current = bottomOcclusion;
  const scroll = useRef<ScrollView>(null);
  const focused = useRef<TextInput | null>(null);
  const keyboard = useRef<Rect | null>(null);
  const offset = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ensureVisible = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const input = focused.current;
      if (!input || !scroll.current) return;
      scroll.current.getNativeScrollRef()?.measureInWindow((x, y, width, height) => {
        input.measureInWindow((fx, fy, fw, fh) => {
          if (input !== focused.current || !width || !height || !fw || !fh) return;
          const delta = focusScrollDelta({ x: fx, y: fy, width: fw, height: fh }, { x, y, width, height: Math.max(0, height - (keyboard.current ? 0 : reservedBottom.current)) }, keyboard.current);
          if (Math.abs(delta) > 1) scroll.current?.scrollTo({ y: Math.max(0, offset.current + delta), animated: false });
        });
      });
    }, Platform.OS === "web" ? 80 : 120);
  }, []);
  useEffect(() => {
    const subscriptions = [Keyboard.addListener("keyboardDidShow", event => {
      const frame = event.endCoordinates;
      keyboard.current = { x: frame.screenX, y: frame.screenY, width: frame.width, height: frame.height };
      ensureVisible();
    }), Keyboard.addListener("keyboardDidChangeFrame", event => {
      const frame = event.endCoordinates;
      keyboard.current = { x: frame.screenX, y: frame.screenY, width: frame.width, height: frame.height };
      ensureVisible();
    }), Keyboard.addListener("keyboardDidHide", () => { keyboard.current = null; })];
    return () => { subscriptions.forEach(subscription => subscription.remove()); if (timer.current) clearTimeout(timer.current); };
  }, [ensureVisible]);
  const focus = useCallback((input: TextInput | null) => { focused.current = input; if (input) ensureVisible(); }, [ensureVisible]);
  return { scroll, offset, focus, ensureVisible };
}
