import { useState } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { AccountBrandLogo } from "./account-brand-logo";
import { Text } from "./app-text";
import { Pressable, View, useWindowDimensions } from "react-native";
import type { AccountRecord } from "./account-editor";
import { accountCardPalette } from "../../shared/visual-identity";
import { AccountTypeMark } from "./account-type-mark";
import { Body, Icon, money, useTheme } from "./ui";

export function AccountIdentity({
  account,
  onEdit,
}: {
  account: AccountRecord;
  onEdit: () => void;
}) {
  const { colors } = useTheme();
  const narrow = useWindowDimensions().width < 360;
  const palette = accountCardPalette(account);
  const { foreground } = palette;
  const balance =
    account.displayBalance === undefined
      ? account.balance
      : account.displayBalance;
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={{ gap: 16 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          expanded ? "Collapse visual card" : "Open visual card"
        }
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((v) => !v)}
      >
        <LinearGradient
          colors={palette.colors}
          locations={palette.locations}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            minHeight: expanded ? 210 : 180,
            padding: 20,
            borderRadius: 20,
            gap: 20,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <AccountBrandLogo account={account} size={40} />
            <Text
              style={{
                flex: 1,
                color: foreground,
                fontSize: 16,
                fontFamily: "Poppins-SemiBold",
              }}
            >
              {account.institution || account.name}
            </Text>
            <Icon name="chevron-down" size={16} color={foreground} />
          </View>
          <Text style={{ color: foreground, fontSize: 15, letterSpacing: 3 }}>
            •••• •••• •••• {account.lastFour || "••••"}
          </Text>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <Text style={{ flex: 1, color: foreground, fontSize: 12 }}>
              {account.name}
            </Text>
            <Text
              style={{
                color: foreground,
                fontSize: 18,
                fontFamily: "Poppins-SemiBold",
              }}
            >
              {balance === null
                ? "Not recorded"
                : money(balance, account.currency)}
            </Text>
          </View>
          {expanded ? (
            <Text style={{ color: foreground, fontSize: 12 }}>
              {account.type.replaceAll("_", " ")} · {account.currency}
            </Text>
          ) : null}
        </LinearGradient>
      </Pressable>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text
          style={{
            fontFamily: "Poppins-SemiBold",
            fontSize: 16,
            color: colors.ink,
          }}
        >
          {account.name}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Edit account"
          onPress={onEdit}
          style={{
            width: 40,
            height: 40,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="create-outline" size={18} />
        </Pressable>
      </View>
      <Body>
        {account.institution || "Manual account"} ·{" "}
        {account.type.replaceAll("_", " ")}
      </Body>
    </View>
  );
}
