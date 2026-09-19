import { Text } from "./app-text";
import { Image, Pressable, View, useWindowDimensions } from "react-native";
import type { AccountRecord } from "./account-editor";
import { investmentIcons } from "./investment-icons";
import { Body, Icon, money, useTheme } from "./ui";
import { SummaryCard } from "./plan-ui";

// Unknown values must stay unknown, rather than appearing as a zero-value asset.
function amount(value: string | null | undefined) {
  if (value == null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Shared read-only holding view; all edits use AccountEditor's existing flow. */
export function AssetSnapshot({
  account,
  onEdit,
}: {
  account: AccountRecord;
  onEdit: () => void;
}) {
  const { colors, dark } = useTheme();
  const narrow = useWindowDimensions().width < 360;
  const subtype = (account.investmentSubtype || "other").replaceAll("_", " ");
  const value = amount(
    account.displayBalance === undefined ? account.balance : account.displayBalance,
  );
  const cost =
    amount(account.investmentCostBasis) ?? amount(account.investmentPrincipal);
  const gain = value !== null && cost !== null ? value - cost : null;
  const formatted = (number: number | null) =>
    number === null ? "Not recorded" : money(String(number), account.currency);
  const fields: [string, string | null | undefined][] = [
    ["Holding name", account.name],
    ["Institution", account.institution],
    ["Investment type", subtype],
    ["Currency", account.currency],
    ["Symbol", account.investmentSymbol],
    ["Units", account.investmentQuantity],
    [
      "Deposit amount",
      account.investmentPrincipal == null
        ? null
        : formatted(amount(account.investmentPrincipal)),
    ],
    ["Start date", account.investmentStartDate?.slice(0, 10)],
    ["Maturity date", account.investmentMaturityDate?.slice(0, 10)],
    [
      "Interest rate",
      account.investmentInterestRate
        ? `${account.investmentInterestRate}%`
        : null,
    ],
    [
      "Maturity value",
      account.investmentMaturityValue == null
        ? null
        : formatted(amount(account.investmentMaturityValue)),
    ],
  ];
  return (
    <View style={{ gap: 20 }}>
      <View
        style={{
          padding: 20,
          borderRadius: 24,
          gap: 16,
          backgroundColor: dark ? "#203B61" : "#E2ECFF",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            gap: 12,
            alignItems: "flex-start",
            justifyContent: "space-between",
          }}
        >
          <Image
            source={
              investmentIcons[account.investmentSubtype || "other"] ??
              investmentIcons.other
            }
            accessibilityLabel={`${subtype} asset`}
            resizeMode="contain"
            style={{ width: 44, height: 44, borderRadius: 12 }}
          />
          <View
            style={{ flex: 1, minWidth: 0, display: narrow ? "none" : "flex" }}
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
            {account.lastFour ? (
              <Body>Account •••• {account.lastFour}</Body>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Edit asset"
            onPress={onEdit}
            hitSlop={4}
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              backgroundColor: "#FFF",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="create-outline" size={20} color="#18343E" />
          </Pressable>
        </View>
        {narrow ? (
          <View style={{ gap: 4 }}>
            <Text
              style={{
                fontFamily: "Poppins-SemiBold",
                fontSize: 16,
                color: colors.ink,
              }}
            >
              {account.name}
            </Text>
            {account.lastFour ? (
              <Body>Account •••• {account.lastFour}</Body>
            ) : null}
          </View>
        ) : null}
        <Text
          style={{
            fontFamily: "Poppins-SemiBold",
            fontSize: 22,
            color: colors.ink,
          }}
        >
          {formatted(value)}
        </Text>
      </View>
      <Text
        accessibilityRole="header"
        style={{
          fontFamily: "Poppins-SemiBold",
          fontSize: 16,
          color: "#7A879C",
        }}
      >
        Portfolio snapshot
      </Text>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <SummaryCard title="Current value" value={formatted(value)} />
        <SummaryCard title="Cost basis" value={formatted(cost)} />
      </View>
      <View style={{ flexDirection: "row" }}>
        <SummaryCard
          title="Gain / loss"
          value={formatted(gain)}
          color={
            gain === null || gain === 0
              ? colors.ink
              : gain > 0
                ? colors.positive
                : colors.danger
          }
        />
      </View>
      {fields
        .filter(
          ([label, field]) =>
            [
              "Holding name",
              "Institution",
              "Investment type",
              "Currency",
            ].includes(label) ||
            (field != null && field !== ""),
        )
        .map(([label, field]) => (
          <View key={label} style={{ gap: 6 }}>
            <Body>{label}</Body>
            <View
              style={{
                borderWidth: 1,
                borderColor: colors.line,
                borderRadius: 12,
                padding: 12,
                backgroundColor: colors.white,
              }}
            >
              <Body muted={false}>{field || "Not recorded"}</Body>
            </View>
          </View>
        ))}
    </View>
  );
}
