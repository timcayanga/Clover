import { Pressable, Text, View, useWindowDimensions } from "react-native";
import type { AccountRecord } from "./account-editor";
import { accountRowColors } from "../../shared/visual-identity";
import { AccountTypeMark } from "./account-type-mark";
import { Body, Icon, money, useTheme } from "./ui";

export function AccountIdentity({
  account,
  onEdit,
}: {
  account: AccountRecord;
  onEdit: () => void;
}) {
  const { dark } = useTheme();
  const narrow = useWindowDimensions().width < 360;
  const [background, foreground] = accountRowColors(
    account.type,
    account.institution || account.name,
    dark,
  );
  const balance =
    account.displayBalance === undefined
      ? account.balance
      : account.displayBalance;
  const name = (
    <Text
      style={{
        fontFamily: "Poppins-SemiBold",
        fontSize: 16,
        color: foreground,
      }}
    >
      {account.name}
    </Text>
  );
  return (
    <View style={{ gap: 16 }}>
      <View
        style={{
          padding: 20,
          gap: 16,
          borderRadius: 24,
          backgroundColor: background,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            <AccountTypeMark type={account.type} size={40} />
          </View>
          {!narrow ? (
            <View style={{ flex: 1, minWidth: 0 }}>{name}</View>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Edit account"
            onPress={onEdit}
            hitSlop={4}
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              backgroundColor: "#fff",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="create-outline" size={20} color="#18343E" />
          </Pressable>
        </View>
        {narrow ? name : null}
        {account.lastFour ? (
          <Text
            style={{
              fontFamily: "Poppins-Regular",
              fontSize: 13,
              color: foreground,
            }}
          >
            •••• {account.lastFour}
          </Text>
        ) : null}
        <Text
          style={{
            fontFamily: "Poppins-SemiBold",
            fontSize: 22,
            color: foreground,
          }}
        >
          {balance === null ? "Not recorded" : money(balance, account.currency)}
        </Text>
      </View>
      <Body>
        {account.institution || "Manual account"} ·{" "}
        {account.type.replaceAll("_", " ")}
      </Body>
      <Body>
        {account.currency} · {account.source || "Recorded"}
      </Body>
    </View>
  );
}
