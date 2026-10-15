import { useState } from "react";
import { Image } from "expo-image";
import { SvgUri } from "react-native-svg";
import { View } from "react-native";
import { apiBase } from "./api-base";
import { CategoryMark } from "./ui";
import type { Transaction } from "./types";

export function MerchantLogo({ transaction, size = 24 }: { transaction: Transaction; size?: number }) {
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const path = transaction.merchantLogoUrl;
  const currentNameKey = JSON.stringify([transaction.merchantRaw ?? null, transaction.merchantClean ?? null]);
  const uri = transaction.merchantLogoNameKey === currentNameKey && path?.startsWith("/assets/") && !path.includes("..") ? `${apiBase()}${path}` : null;
  if (!uri || failedUri === uri) return <CategoryMark name={transaction.categoryName} size={size} />;
  return <View style={{ width: size, height: size, borderRadius: 7, overflow: "hidden", backgroundColor: "#fff" }}>
    {path?.endsWith(".svg") ? <SvgUri key={uri} uri={uri} width={size} height={size} onError={() => setFailedUri(uri)} />
      : <Image accessibilityLabel="" source={{ uri }} contentFit="contain" style={{ width: size, height: size }} onError={() => setFailedUri(uri)} />}
  </View>;
}
