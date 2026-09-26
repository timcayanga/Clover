import { useState } from "react";
import { View } from "react-native";
import { Image } from "expo-image";
import { AccountTypeMark } from "./account-type-mark";
import { apiBase } from "./api-base";
import type { AccountRecord } from "./account-editor";
export function AccountBrandLogo({
  account,
  size = 32,
}: {
  account: AccountRecord;
  size?: number;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const path = account.brandLogoUrl?.includes("/assets/account-types/") ? null : account.brandLogoUrl;
  const uri = path?.startsWith("/")
    ? `${apiBase()}${path}`
    : path?.startsWith("https:")
      ? path
      : null;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {uri && failed !== uri ? (
        <Image
          accessibilityLabel={`${account.institution || account.name} logo`}
          source={{ uri }}
          style={{ width: size, height: size }}
          contentFit="contain"
          onError={() => setFailed(uri)}
        />
      ) : (
        <AccountTypeMark type={account.type} size={size} />
      )}
    </View>
  );
}
