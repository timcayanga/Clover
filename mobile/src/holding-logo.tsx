import { useState } from "react";
import { Image, View } from "react-native";
import { SvgUri } from "react-native-svg";
import type { PortfolioHolding } from "../../shared/investment-portfolio";
import { investmentIcons } from "./investment-icons";
import { apiBase } from "./api";
export function HoldingLogo({ holding }: { holding: PortfolioHolding }) {
  const [failedPath, setFailedPath] = useState<string | null>(null);
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
      {failedPath !== path && path?.startsWith("/assets/investments/") ? (
        <SvgUri
          uri={`${apiBase()}${path}`}
          width={44}
          height={44}
          onError={() => setFailedPath(path!)}
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
