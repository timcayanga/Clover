import { createContext, forwardRef, useContext, useRef } from "react";
import {
  StyleSheet,
  useWindowDimensions,
  Text as NativeText,
  TextInput as NativeTextInput,
  type TextProps,
  type TextInputProps,
} from "react-native";
import { FocusVisibility } from "./keyboard-visibility";
import { resolveAppFont } from "./app-font";

const FontContext = createContext("Poppins-Regular");

export const Text = forwardRef<NativeText, TextProps>(function AppText(
  { style, children, ...props }, ref,
) {
  const inherited = useContext(FontContext);
  const { fontScale } = useWindowDimensions();
  const flattened = StyleSheet.flatten(style) ?? {};
  const fontFamily = resolveAppFont(flattened, inherited);
  const font = { fontFamily, ...(fontFamily.startsWith("Poppins-") ? { fontWeight: "normal" as const } : {}) };
  return (
    <FontContext.Provider value={fontFamily}>
      {/* Re-measure native glyphs when Dynamic Type changes while this route stays mounted. */}
      <NativeText key={fontScale} {...props} ref={ref} style={[style, font]}>{children}</NativeText>
    </FontContext.Provider>
  );
});

export const TextInput = forwardRef<NativeTextInput, TextInputProps>(function AppTextInput(
  { style, ...props }, ref,
) {
  const fontFamily = resolveAppFont(StyleSheet.flatten(style) ?? {});
  const localRef = useRef<NativeTextInput | null>(null);
  const focus = useContext(FocusVisibility);
  return <NativeTextInput {...props} ref={node => { localRef.current = node; if (typeof ref === "function") ref(node); else if (ref) ref.current = node; }} onFocus={event => { focus(localRef.current); props.onFocus?.(event); }} onBlur={event => { focus(null); props.onBlur?.(event); }} style={[style, { fontFamily, ...(fontFamily.startsWith("Poppins-") ? { fontWeight: "normal" as const } : {}) }]} />;
});
