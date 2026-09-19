import { createContext, forwardRef, useContext } from "react";
import {
  StyleSheet,
  Text as NativeText,
  TextInput as NativeTextInput,
  type TextProps,
  type TextInputProps,
} from "react-native";
import { resolveAppFont } from "./app-font";

const FontContext = createContext("Poppins-Regular");

export const Text = forwardRef<NativeText, TextProps>(function AppText(
  { style, children, ...props }, ref,
) {
  const inherited = useContext(FontContext);
  const flattened = StyleSheet.flatten(style) ?? {};
  const fontFamily = resolveAppFont(flattened, inherited);
  const font = { fontFamily, ...(fontFamily.startsWith("Poppins-") ? { fontWeight: "normal" as const } : {}) };
  return (
    <FontContext.Provider value={fontFamily}>
      <NativeText {...props} ref={ref} style={[style, font]}>{children}</NativeText>
    </FontContext.Provider>
  );
});

export const TextInput = forwardRef<NativeTextInput, TextInputProps>(function AppTextInput(
  { style, ...props }, ref,
) {
  const fontFamily = resolveAppFont(StyleSheet.flatten(style) ?? {});
  return <NativeTextInput {...props} ref={ref} style={[style, { fontFamily, ...(fontFamily.startsWith("Poppins-") ? { fontWeight: "normal" as const } : {}) }]} />;
});
