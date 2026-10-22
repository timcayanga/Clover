import { View, Image } from "react-native";
import { Text } from "./app-text";
import {
  type AccountCardPalette,
  accountCardPalette,
} from "../../shared/visual-identity";
import { apiBase } from "./api-base";
export function PaymentOptionMark({
  provider,
  label,
  selected = false,
  identity,
}: {
  provider: string;
  label: string;
  selected?: boolean;
  identity?: {
    provider: string;
    brandLogoUrl?: string | null;
    brandPalette?: AccountCardPalette;
  };
}) {
  const palette = accountCardPalette({
    type: "bank",
    institution: provider,
    brandPalette: identity?.brandPalette,
  });
  const known: Record<string, string> = {
    gcash: "gcash.png",
    maya: "maya.png",
    bpi: "bpi.png",
    bdo: "bdo.png",
    metrobank: "metrobank.png",
    rcbc: "rcbc.png",
    unionbank: "unionbank.jpg",
    gotyme: "gotyme.png",
    wise: "wise.png",
    paypal: "paypal.png",
  };
  const key = provider.toLowerCase().replace(/[^a-z]/g, "");
  const file = known[key];
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        padding: 12,
        borderRadius: 12,
        backgroundColor: palette.colors[0],
      }}
    >
      <Image
        source={{
          uri: identity?.brandLogoUrl?.startsWith("/")
            ? `${apiBase()}${identity.brandLogoUrl}`
            : `${apiBase()}/assets/banks/${file ? `philippines/${file}` : "bank.png"}`,
        }}
        style={{ width: 32, height: 32, borderRadius: 8 }}
        resizeMode="contain"
      />
      <Text
        style={{
          flex: 1,
          color: palette.foreground,
          fontFamily: "Poppins-Medium",
        }}
      >
        {label} · {provider}
      </Text>
      {selected ? <Text style={{ color: palette.foreground }}>✓</Text> : null}
    </View>
  );
}
