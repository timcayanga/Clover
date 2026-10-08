import { useState, type ReactNode } from "react";
import { View } from "react-native";
import Svg, { Rect } from "react-native-svg";
import { walletFinish, walletGeometry } from "../../shared/account-wallet";
import { useTheme } from "./ui";

export function AccountWallet({ children }: { children: ReactNode }) {
  const { dark } = useTheme();
  const finish = walletFinish[dark ? "dark" : "light"];
  const [size, setSize] = useState({ width: 342, height: 87 });
  const inset = walletGeometry.stitchInset;
  return <View onLayout={event => setSize(event.nativeEvent.layout)} style={{ borderRadius: 22, borderWidth: 1, borderColor: finish.edge, backgroundColor: finish.shell, padding: 5, paddingBottom: 16, overflow: "hidden" }}>
    {children}
    <View pointerEvents="none" style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 16, backgroundColor: finish.shell }} />
    <Svg pointerEvents="none" accessible={false} width={size.width} height={size.height} style={{ position: "absolute", top: -1, left: -1 }}>
      <Rect x={inset} y={inset + .35} width={Math.max(0, size.width - inset * 2)} height={Math.max(0, size.height - inset * 2)} rx={18} fill="none" stroke={finish.holes} strokeWidth={2} strokeDasharray="4 4" strokeLinecap="round" opacity={.28} />
      <Rect x={inset} y={inset} width={Math.max(0, size.width - inset * 2)} height={Math.max(0, size.height - inset * 2)} rx={18} fill="none" stroke={finish.thread} strokeWidth={finish.threadWidth} strokeDasharray="4 4" strokeLinecap="round" opacity={finish.threadOpacity} />
    </Svg>
  </View>;
}
