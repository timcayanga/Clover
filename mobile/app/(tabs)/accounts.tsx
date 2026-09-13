import {
  useFocusEffect,
  useLocalSearchParams,
  useNavigation,
} from "expo-router";
import { SummaryCard } from "../../src/plan-ui";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSession } from "../../src/session";
import {
  AppHeader,
  Body,
  Button,
  Card,
  Field,
  Heading,
  Icon,
  Notice,
  Screen,
  money,
  useTheme,
} from "../../src/ui";
import {
  AccountEditor,
  type AccountRecord as Account,
} from "../../src/account-editor";
export default function Accounts() {
  const session = useSession();
  return <AccountsContent key={session.profileId} />;
}
function AccountsContent() {
  const { colors, styles, dark } = useTheme();
  const session = useSession();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [query, setQuery] = useState("");
  const [currency, setCurrency] = useState("");
  const [filters, setFilters] = useState(false);
  const [selected, setSelected] = useState<Account | null>(null);
  const [adding, setAdding] = useState(false);
  const { add } = useLocalSearchParams<{ add?: string }>();
  const navigation = useNavigation();
  useEffect(() => {
    if (add) {
      setSelected(null);
      setAdding(true);
    }
  }, [add]);
  useEffect(() => {
    const title = adding
      ? "Add Account"
      : selected
        ? selected.type === "investment"
          ? "Asset Details"
          : "Account Details"
        : "Accounts";
    navigation.setOptions({
      title,
      header: () => (
        <AppHeader
          title={title}
          onClose={
            adding || selected
              ? () => {
                  setAdding(false);
                  setSelected(null);
                }
              : undefined
          }
        />
      ),
    });
  }, [adding, selected, navigation]);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      setError("");
      setSelected(null);
      const load = session.demo
        ? Promise.resolve({
            accounts: [
              {
                id: "sample",
                name: "Sample cash",
                institution: null,
                type: "cash",
                currency: "PHP",
                balance: "5000",
              },
            ],
          })
        : session.request<{ accounts: Account[] }>(
            `accounts?workspaceId=${encodeURIComponent(session.profileId)}`,
          );
      void load
        .then((data) => {
          if (active) setAccounts(data.accounts);
        })
        .catch((e) => {
          if (active) setError(e.message);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }, [session.demo, session.profileId, session.request, revision]),
  );
  const label = (account: Account) =>
    [account.name, account.lastFour].filter(Boolean).join(" ");
  const amountLabel = (account: Account) =>
    ["credit_card", "loan", "mortgage", "liability"].includes(account.type)
      ? "Outstanding balance"
      : account.type === "investment"
        ? "Recorded value"
        : "Balance";
  const sectionName = (type: string) =>
    ({
      bank: "Banks & savings",
      bank_account: "Banks & savings",
      savings: "Banks & savings",
      checking: "Banks & savings",
      credit_card: "Credit cards",
      line_of_credit: "Credit cards",
      wallet: "Wallets",
      cash: "Cash",
      investment: "Investments",
      loan: "Loans & mortgages",
      mortgage: "Loans & mortgages",
    })[type] ?? "Other accounts";
  const groups = new Map<
    string,
    { title: string; currency: string; rows: Account[] }
  >();
  for (const account of accounts.filter(
    (a) =>
      (!currency || a.currency === currency) &&
      `${a.name} ${a.institution}`.toLowerCase().includes(query.toLowerCase()),
  )) {
    const title = sectionName(account.type),
      key = `${title}:${account.currency}`;
    if (!groups.has(key))
      groups.set(key, { title, currency: account.currency, rows: [] });
    groups.get(key)!.rows.push(account);
  }
  if (selected || adding)
    return (
      <AccountEditor
        initial={selected}
        onClose={() => {
          setSelected(null);
          setAdding(false);
        }}
        onSaved={(record) => {
          if (session.demo)
            setAccounts((list) =>
              record
                ? [...list.filter((a) => a.id !== record.id), record]
                : list.filter((a) => a.id !== selected?.id),
            );
          else setRevision((v) => v + 1);
          setSelected(null);
          setAdding(false);
        }}
      />
    );
  return (
    <Screen>
      <Field
        label="Search accounts"
        value={query}
        onChangeText={setQuery}
        placeholder="Name or institution"
      />
      <Button
        title="Filters"
        secondary
        onPress={() => setFilters((value) => !value)}
      />
      {filters ? (
        <Card>
          <Body>Currency</Body>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {["", ...new Set(accounts.map((account) => account.currency))].map(
              (value) => (
                <Button
                  key={value}
                  title={value || "All"}
                  secondary={currency !== value}
                  onPress={() => setCurrency(value)}
                />
              ),
            )}
          </View>
        </Card>
      ) : null}
      {loading ? (
        <Body>Loading accounts…</Body>
      ) : error ? (
        <Notice>{error}</Notice>
      ) : (
        Array.from(groups, ([key, group]) => (
          <View key={key} style={{ gap: 12 }}>
            <SummaryCard title={group.title} value={group.rows.some(a=>a.balance===null || !Number.isFinite(Number(a.balance))) ? "Balance not recorded" : money(String(group.rows.reduce((sum,a)=>sum+Number(a.balance),0)),group.currency)} detail={`${group.rows.length} accounts · ${group.currency}`}/>
            {group.rows.map((account) => (
              <Pressable
                key={account.id}
                accessibilityRole="button"
                accessibilityLabel={`Open ${label(account)}`}
                onPress={() => setSelected(account)}
              >
                <LinearGradient
                  colors={
                    dark ? ["#193A43", "#15252D"] : ["#DEF6F4", "#FFFFFF"]
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{
                    borderRadius: 22,
                    borderWidth: 1,
                    borderColor: colors.line,
                    padding: 20,
                    gap: 12,
                  }}
                >
                  <View style={styles.row}>
                    <Icon name="card-outline" size={36} />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          color: colors.ink,
                          fontSize: 18,
                          fontWeight: "600",
                        }}
                      >
                        {label(account)}
                      </Text>
                      <Body>
                        {account.institution ||
                          account.type.replaceAll("_", " ")}
                      </Body>
                    </View>
                  </View>
                  <Body>{amountLabel(account)}</Body>
                  <Text
                    style={{
                      color: colors.ink,
                      fontSize: 28,
                      fontWeight: "600",
                    }}
                  >
                    {account.balance === null
                      ? "Not recorded"
                      : money(account.balance, account.currency)}
                  </Text>
                  <Body>{account.currency} · View account ›</Body>
                </LinearGradient>
              </Pressable>
            ))}
          </View>
        ))
      )}
      {!loading && !error && !accounts.length ? (
        <Notice>No accounts yet. Use Add account above to get started.</Notice>
      ) : null}
    </Screen>
  );
}
