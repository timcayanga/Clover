import { type ReactNode } from "react";
import { View } from "react-native";
import { useAdaptiveLayout } from "./adaptive";
import { supportsDetailPane } from "./device-geometry";
export function useDetailPane() {
  const { width, fontScale } = useAdaptiveLayout();
  return supportsDetailPane(width, fontScale);
}
/** Both panes retain their identity during resize, so drafts and selection survive. */
export function AdaptiveDetail({ list, detail, selected, detailOnlyOnCompact = false }: {
  list: ReactNode; detail: ReactNode; selected: boolean; detailOnlyOnCompact?: boolean;
}) {
  const wide = useDetailPane();
  return <View style={{ flex: 1, flexDirection: "row", minHeight: 0, width: "100%", maxWidth: 1440, alignSelf: "center" }}>
    <View style={{ flex: 1, minWidth: 0, display: !wide && selected && detailOnlyOnCompact ? "none" : "flex" }}>{list}</View>
    <View style={{ flex: 1, minWidth: 0, display: wide || (selected && detailOnlyOnCompact) ? "flex" : "none" }}>{detail}</View>
  </View>;
}
