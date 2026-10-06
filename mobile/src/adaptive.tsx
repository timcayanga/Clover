import { Children, useState, type ReactNode } from "react";
import { View, useWindowDimensions, type StyleProp, type ViewStyle } from "react-native";
import { adaptiveColumns, adaptiveLayout } from "./adaptive-layout";

export function useAdaptiveLayout() {
  const window = useWindowDimensions();
  return { ...window, ...adaptiveLayout(window.width, window.height, window.fontScale) };
}

/** Measures its container so sheets, split windows and nested cards reflow too.
 * Keep the same child tree when resizing to preserve inputs and focus. */
export function AdaptiveGrid({ children, minItemWidth = 300, maxColumns = 3, gap = 16, style }: {
  children: ReactNode; minItemWidth?: number; maxColumns?: number; gap?: number; style?: StyleProp<ViewStyle>;
}) {
  const [width, setWidth] = useState(0);
  const { fontScale } = useWindowDimensions();
  const columns = adaptiveColumns(width, minItemWidth, maxColumns, gap, fontScale);
  const itemWidth = width > 0 ? Math.max(1, (width - gap * (columns - 1)) / columns) : undefined;
  return <View onLayout={event => setWidth(event.nativeEvent.layout.width)} style={[{ flexDirection: "row", flexWrap: "wrap", gap, minWidth: 0 }, style]}>
    {Children.toArray(children).map((child, index) => <View key={(child as { key?: string }).key ?? index} style={{ width: itemWidth ?? "100%", minWidth: 0 }}>{child}</View>)}
  </View>;
}
