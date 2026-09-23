import { Text } from "../../src/app-text";
import { AccountBrandLogo } from "../../src/account-brand-logo";
import { AccountTypeMark } from "../../src/account-type-mark";
import { accountRowColors } from "../../../shared/visual-identity";
import {
  useFocusEffect,
  useLocalSearchParams,
  useNavigation,
} from "expo-router";
import { SummaryCard } from "../../src/plan-ui";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { useSession } from "../../src/session";
import {
  AppHeader,
  Body,
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
  accountDisplayBalance,
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
  const [selected, setSelected] = useState<Account | null>(null);
  const [adding, setAdding] = useState(false);
  const { add, accountId } = useLocalSearchParams<{
    add?: string;
    accountId?: string;
  }>();
  const [openedAccount, setOpenedAccount] = useState("");
  useEffect(() => {
    if (accountId && accountId !== openedAccount) {
      const found = accounts.find((a) => a.id === accountId);
      if (found) {
        setOpenedAccount(accountId);
        setSelected(found);
      }
    }
  }, [accountId, accounts, openedAccount]);
  const navigation = useNavigation();
  useEffect(() => {
    if (add) {
      setSelected(null);
      setAdding(true);
    }
  }, [add]);
  useLayoutEffect(() => {
    // The shared editor owns its header, whether opened here or from Investments.
    navigation.setOptions({ headerShown: !adding && !selected });
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
                id: "BPI Savings",
                name: "BPI Savings",
                institution: "BPI",
                type: "bank",
                currency: "PHP",
                balance: "48230.75",
              },
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
      line_of_credit: "Liabilities",
      wallet: "Wallets",
      cash: "Cash",
      investment: "Investments",
      loan: "Liabilities",
      mortgage: "Liabilities",
      payable: "Liabilities",
      bnpl: "Liabilities",
      receivable: "Tracked assets",
      insurance: "Tracked assets",
      prepaid: "Tracked assets",
      other: "Tracked assets",
    })[type] ?? "Other accounts";
  const groups = new Map<
    string,
    { title: string; currency: string; rows: Account[] }
  >();
  for (const account of accounts.filter((a) =>
    `${a.name} ${a.institution}`.toLowerCase().includes(query.toLowerCase()),
  )) {
    const title = sectionName(account.type),
      key = `${title}:${account.currency}`;
    if (!groups.has(key))
      groups.set(key, { title, currency: account.currency, rows: [] });
    groups.get(key)!.rows.push(account);
  }
  const groupOrder = [
    "Banks & savings",
    "Credit cards",
    "Liabilities",
    "Wallets",
    "Investments",
    "Tracked assets",
    "Cash",
    "Other accounts",
  ];
  const summaries = [...new Set(accounts.map((a) => a.currency))].map(
    (currency) => {
      const rows = accounts.filter((a) => a.currency === currency);
      const values = rows.map((a) => {
        const amount = accountDisplayBalance(a);
        return amount === null
          ? null
          : [
                "credit_card",
                "loan",
                "mortgage",
                "line_of_credit",
                "payable",
                "bnpl",
              ].includes(a.type)
            ? -Math.abs(Number(amount))
            : a.type === "cash"
              ? Math.max(0, Number(amount))
              : Number(amount);
      });
      const known = values.every((v) => v !== null && Number.isFinite(v));
      return {
        currency,
        values: known
          ? [
              values.reduce<number>((s, v) => s + v!, 0),
              rows.reduce(
                (s, a, i) =>
                  s +
                  ([
                    "bank",
                    "bank_account",
                    "savings",
                    "checking",
                    "wallet",
                    "cash",
                  ].includes(a.type)
                    ? Math.max(0, values[i]!)
                    : 0),
                0,
              ),
              values.reduce<number>((s, v) => s + Math.max(0, v!), 0),
              values.reduce<number>((s, v) => s + Math.max(0, -v!), 0),
            ]
          : [null, null, null, null],
      };
    },
  );
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
    <Screen gap={24}>
      {summaries.map((summary) => (
        <View key={summary.currency} style={{ gap: 8 }}>
          {summaries.length > 1 ? <Body>{summary.currency}</Body> : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {["Net worth", "Spendable", "Assets", "Liabilities"].map(
              (title, i) => (
                <View key={title} style={{ width: "48%", flexGrow: 1 }}>
                  <SummaryCard
                    title={title}
                    value={
                      summary.values[i] === null
                        ? "—"
                        : money(String(summary.values[i]), summary.currency)
                    }
                    color={i === 3 ? colors.danger : colors.positive}
                  />
                </View>
              ),
            )}
          </View>
        </View>
      ))}
      <Field
        accessibilityLabel="Search accounts"
        value={query}
        onChangeText={setQuery}
        placeholder="Name or institution"
      />
      {loading ? (
        <Body>Loading accounts…</Body>
      ) : error ? (
        <Notice>{error}</Notice>
      ) : (
        Array.from(groups)
          .sort(
            (a, b) =>
              groupOrder.indexOf(a[1].title) - groupOrder.indexOf(b[1].title),
          )
          .map(([key, group]) => (
            <View key={key} style={{ gap: 12 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <Text
                  style={{
                    fontFamily: "Poppins-SemiBold",
                    fontSize: 16,
                    color: colors.ink,
                  }}
                >
                  {group.title}
                </Text>
                <Text
                  style={{
                    fontFamily: "Poppins-SemiBold",
                    fontSize: 13,
                    color: colors.ink,
                  }}
                >
                  {group.rows.some(
                    (a) =>
                      accountDisplayBalance(a) === null ||
                      !Number.isFinite(Number(accountDisplayBalance(a))),
                  )
                    ? "Balance not recorded"
                    : money(
                        String(
                          group.rows.reduce(
                            (sum, a) => sum + Number(accountDisplayBalance(a)),
                            0,
                          ),
                        ),
                        group.currency,
                      )}
                </Text>
              </View>
              {[...group.rows]
                .sort(
                  (a, b) =>
                    Math.abs(Number(accountDisplayBalance(b))) -
                      Math.abs(Number(accountDisplayBalance(a))) ||
                    a.name.localeCompare(b.name),
                )
                .map((account) => (
                  <Pressable
                    key={account.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${label(account)}`}
                    onPress={() => setSelected(account)}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 10,
                        borderRadius: 14,
                        minHeight: 54,
                        padding: 10,
                        backgroundColor: accountRowColors(
                          account.type,
                          account.institution || account.name,
                          dark,
                        )[0],
                      }}
                    >
                      <AccountBrandLogo account={account} size={32} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          style={{
                            fontFamily: "Poppins-SemiBold",
                            fontSize: 13,
                            color: accountRowColors(
                              account.type,
                              account.institution || account.name,
                              dark,
                            )[1],
                          }}
                        >
                          {account.name}
                        </Text>
                        {account.lastFour ? (
                          <Text
                            style={{
                              fontFamily: "Poppins-Regular",
                              fontSize: 10,
                              color: accountRowColors(
                                account.type,
                                account.institution || account.name,
                                dark,
                              )[1],
                            }}
                          >
                            Account •••• {account.lastFour}
                          </Text>
                        ) : null}
                      </View>
                      <Text
                        style={{
                          maxWidth: "43%",
                          textAlign: "right",
                          fontFamily: "Poppins-SemiBold",
                          fontSize: 14,
                          color: accountRowColors(
                            account.type,
                            account.institution || account.name,
                            dark,
                          )[1],
                        }}
                      >
                        {accountDisplayBalance(account) === null
                          ? "Not recorded"
                          : money(
                              accountDisplayBalance(account)!,
                              account.currency,
                            )}
                      </Text>
                      <Text
                        accessibilityElementsHidden
                        style={{
                          fontSize: 24,
                          color: accountRowColors(
                            account.type,
                            account.institution || account.name,
                            dark,
                          )[1],
                        }}
                      >
                        ›
                      </Text>
                    </View>
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
