import { router, useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { useSession } from "../../src/session";
import {
  Body,
  Button,
  Card,
  Icon,
  Notice,
  Screen,
  money,
  useTheme,
} from "../../src/ui";
type Totals = { income: number; expense: number };
type HomeData = {
  currency: string;
  balance: number | null;
  month: Totals;
  previousMonth: Totals;
  weekly: Totals & { days: (Totals & { date: string })[] };
  monthly: Totals & { days: (Totals & { date: string })[] };
  upcoming: {
    id: string;
    title: string;
    amount: string | null;
    date: string;
  }[];
};
const hiddenKey = "clover.home.hide-balances";
export default function Home() {
  const { colors, styles } = useTheme();
  const session = useSession();
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState("");
  const [hidden, setHidden] = useState(true);
  const [currency, setCurrency] = useState("PHP");
  useEffect(() => {
    let active = true;
    const read =
      Platform.OS === "web"
        ? Promise.resolve(globalThis.localStorage?.getItem(hiddenKey))
        : SecureStore.getItemAsync(hiddenKey);
    void read
      .then((value) => {
        if (active) setHidden(value === "true");
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const toggleHidden = () => {
    const next = !hidden;
    setHidden(next);
    if (Platform.OS === "web") {
      try {
        globalThis.localStorage?.setItem(hiddenKey, String(next));
      } catch {}
    } else
      void SecureStore.setItemAsync(hiddenKey, String(next)).catch(() => {});
  };
  const load = useCallback(async () => {
    if (session.demo) {
      const totals = session.rows
        .filter((row) => row.currency === currency)
        .reduce(
          (sum, row) => {
            if (row.type !== "transfer")
              sum[row.type] += Math.abs(Number(row.amount));
            return sum;
          },
          { income: 0, expense: 0 },
        );
      return {
        currency,
        balance: null,
        month: totals,
        previousMonth: { income: 0, expense: 0 },
        weekly: { ...totals, days: [] },
        monthly: { ...totals, days: [] },
        upcoming: [],
      } satisfies HomeData;
    }
    return session.request<HomeData>(
      `home?workspaceId=${encodeURIComponent(session.profileId)}&currency=${currency}`,
    );
  }, [
    session.demo,
    session.rows,
    session.profileId,
    session.request,
    currency,
  ]);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setData(null);
      setError("");
      void load()
        .then((value) => {
          if (active) setData(value);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
      return () => {
        active = false;
      };
    }, [load]),
  );
  const amount = (value: number | string | null) =>
    hidden
      ? "••••"
      : value === null
        ? "Unavailable"
        : money(String(value), currency);
  const trend = (current: number, previous: number) =>
    previous === 0
      ? "—"
      : `${current >= previous ? "↑" : "↓"} ${Math.abs(((current - previous) / previous) * 100).toFixed(0)}%`;
  return (
    <Screen>
      <Body>
        {
          session.data?.profiles.find(
            (profile) => profile.id === session.profileId,
          )?.name
        }
      </Body>
      <View style={[styles.row, { justifyContent: "space-between" }]}>
        <Text style={{ color: colors.ink, fontSize: 24, fontWeight: "700" }}>
          Hello{session.data?.firstName ? `, ${session.data.firstName}` : ""}.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Reporting currency ${currency}. Switch currency`}
          style={{ padding: 12 }}
          onPress={() =>
            setCurrency((current) => (current === "PHP" ? "USD" : "PHP"))
          }
        >
          <Text style={{ color: colors.teal }}>{currency} ⌄</Text>
        </Pressable>
      </View>
      {error ? (
        <Notice>{error}</Notice>
      ) : !data ? (
        <Body>Loading Home…</Body>
      ) : (
        <>
          <LinearGradient
            colors={["#03A8C0", "#34D3D0"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              borderRadius: 24,
              padding: 20,
              paddingBottom: 14,
              gap: 14,
            }}
          >
            <View style={styles.row}>
              <Text
                style={{
                  color: "white",
                  fontSize: 20,
                  fontWeight: "600",
                  flex: 1,
                }}
              >
                My Balance
              </Text>
              <Pressable
                onPress={toggleHidden}
                accessibilityRole="button"
                accessibilityLabel={hidden ? "Show balances" : "Hide balances"}
                style={styles.iconButton}
              >
                <Icon
                  name={hidden ? "eye-off-outline" : "eye-outline"}
                  color="white"
                />
              </Pressable>
            </View>
            <Text style={{ color: "white", fontSize: 34, fontWeight: "700" }}>
              {amount(data.balance)}
            </Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              {(["income", "expense"] as const).map((key) => (
                <View
                  key={key}
                  style={{
                    flex: 1,
                    minHeight: 52,
                    backgroundColor: "rgba(255,255,255,.94)",
                    borderRadius: 14,
                    padding: 9,
                    gap: 4,
                  }}
                >
                  <Text style={{ color: "#436572", fontSize: 11 }}>
                    {key === "income" ? "Monthly income" : "Monthly expenses"}
                  </Text>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: 3,
                    }}
                  >
                    <Text style={{ color: "#18343E", fontWeight: "600" }}>
                      {amount(data.month[key])}
                    </Text>
                    <Text
                      accessibilityLabel="Change compared with previous month"
                      style={{ color: "#436572", fontSize: 11 }}
                    >
                      {trend(data.month[key], data.previousMonth[key])}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </LinearGradient>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button
                title="Accounts"
                secondary
                onPress={() => router.navigate("/(tabs)/accounts")}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                title="Recurring"
                secondary
                onPress={() => router.navigate("/(tabs)/recurring")}
              />
            </View>
          </View>
          <Card>
            <Text
              style={{ color: colors.ink, fontSize: 18, fontWeight: "600" }}
            >
              Next steps
            </Text>
            <Button
              title="Review transactions"
              onPress={() => router.navigate("/(tabs)/transactions")}
            />
            <Button
              title="Upload a record"
              secondary
              onPress={() =>
                router.navigate({
                  pathname: "/(tabs)/add",
                  params: { entry: `upload-${Date.now()}` },
                })
              }
            />
          </Card>
          {(
            [
              ["weekly", "This week"],
              ["monthly", "This month"],
            ] as const
          ).map(([key, title]) => (
            <Card key={key}>
              <Text
                style={{ color: colors.ink, fontSize: 18, fontWeight: "600" }}
              >
                {title}
              </Text>
              <Text
                style={{ fontSize: 28, color: colors.ink, fontWeight: "600" }}
              >
                {amount(data[key].expense)}
              </Text>
              <Body>
                Recorded spending · past {key === "weekly" ? 7 : 30} days
              </Body>
              <View style={{ gap: 8 }}>
                {(["income", "expense"] as const).map((kind) => (
                  <View
                    key={kind}
                    style={[styles.row, { justifyContent: "space-between" }]}
                  >
                    <Body>{kind === "income" ? "Income" : "Expenses"}</Body>
                    <Body muted={false}>{amount(data[key][kind])}</Body>
                  </View>
                ))}
              </View>
              <View style={[styles.row, { justifyContent: "space-between" }]}>
                <Body>Net cash flow</Body>
                <Body muted={false}>
                  {amount(data[key].income - data[key].expense)}
                </Body>
              </View>
            </Card>
          ))}
          <Card>
            <Text
              style={{ color: colors.ink, fontSize: 18, fontWeight: "600" }}
            >
              Upcoming payments
            </Text>
            {data.upcoming.length ? (
              data.upcoming.map((item) => (
                <View
                  key={item.id}
                  style={[styles.row, { justifyContent: "space-between" }]}
                >
                  <View style={{ flex: 1 }}>
                    <Body muted={false}>{item.title}</Body>
                    <Body>{item.date.slice(0, 10)}</Body>
                  </View>
                  <Body muted={false}>{amount(item.amount)}</Body>
                </View>
              ))
            ) : (
              <Body>No upcoming payments in this currency.</Body>
            )}
            <Button
              title="View recurring"
              secondary
              onPress={() => router.navigate("/(tabs)/recurring")}
            />
          </Card>
        </>
      )}
    </Screen>
  );
}
