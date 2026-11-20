import { useState } from "react";
import { Image, View } from "react-native";
import { SvgUri } from "react-native-svg";
import type { PortfolioHolding } from "../../shared/investment-portfolio";
import { investmentIcons } from "./investment-icons";
import { apiBase } from "./api";
export function HoldingLogo({ holding, size = 44 }: { size?: number; holding: Pick<PortfolioHolding, "logoUrl" | "subtype"> }) {
  const [failedPath, setFailedPath] = useState<string | null>(null);
  const path = holding.logoUrl;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 7,
        overflow: "hidden",
        backgroundColor: "#fff",
        padding: 0,
      }}
    >
      {failedPath !== path && path?.startsWith("/assets/") && !path.includes("..") ? path.endsWith(".svg") ? (
        <SvgUri
          uri={`${apiBase()}${path}`}
          width={size}
          height={size}
          onError={() => setFailedPath(path!)}
        />
      ) : (
        <Image
          source={{ uri: `${apiBase()}${path}` }}
          style={{ width: size, height: size }}
          resizeMode="contain"
          onError={() => setFailedPath(path)}
        />
      ) : (
        <Image
          source={investmentIcons[holding.subtype] ?? investmentIcons.other}
          style={{ width: size, height: size }}
        />
      )}
    </View>
  );
}
