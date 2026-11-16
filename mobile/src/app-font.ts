import type { TextStyle } from "react-native";

/** Only return bundled faces; keep explicit icon/monospace families intact. */
export function resolveAppFont(style: TextStyle, inherited = "Poppins-Regular") {
  if (style.fontFamily) return style.fontFamily;
  if (!style.fontWeight) return inherited;
  const weight = style.fontWeight === "bold" ? 700 : Number(style.fontWeight);
  return weight >= 700 ? "Poppins-Bold" : weight >= 600 ? "Poppins-SemiBold" : weight >= 500 ? "Poppins-Medium" : "Poppins-Regular";
}
