import { useState } from "react";
import { Image, View } from "react-native";
import { SvgUri } from "react-native-svg";
import type { PortfolioHolding } from "../../shared/investment-portfolio";
import { investmentIcons } from "./investment-icons";
import { apiBase } from "./api";
export function HoldingLogo({ holding }: { holding: PortfolioHolding }) {
  const [failed, setFailed] = useState(false);
  const path = holding.logoUrl;
  return (
    <View
      style={{
        width: 44,
        height: 44,
        borderRadius: 12,
        overflow: "hidden",
        backgroundColor: "#fff",
        padding: 0,
      }}
    >
      {!failed && path?.startsWith("/assets/investments/") ? (
        <SvgUri
          uri={`${apiBase()}${path}`}
          width={44}
          height={44}
          onError={() => setFailed(true)}
        />
      ) : (
        <Image
          source={investmentIcons[holding.subtype] ?? investmentIcons.other}
          style={{ width: 44, height: 44 }}
        />
      )}
    </View>
  );
}
