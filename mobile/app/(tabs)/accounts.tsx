import { EntryOverlay } from "../../src/entry-overlay";
import { Text } from "../../src/app-text";
import { AccountBrandLogo } from "../../src/account-brand-logo";
import { AccountTypeMark } from "../../src/account-type-mark";
import { accountCardPalette } from "../../../shared/visual-identity";
import {
  router,
  useFocusEffect,
  useLocalSearchParams,
  useNavigation,
} from "expo-router";
import { SummaryCard } from "../../src/plan-ui";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { useSession } from "../../src/session";
import {
  AppHeader,
  AddNavigationMark,
  Body,
  Card,
  Button,
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
  const [currencyFilter, setCurrencyFilter] = useState("");
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [expandedAccount, setExpandedAccount] = useState<string | null>(null);
  const [selected, setSelected] = useState<Account | null>(null);
  const [adding, setAdding] = useState(false);
  const [pendingBanks,setPendingBanks]=useState<{id:string;name:string}[]>([]);
  useEffect(()=>{
    const controller=new AbortController();
    if(session.demo||adding){setPendingBanks([]);return;}
    void session.request<{pending:{id:string;name:string}[]}>(`finverse/connections?workspaceId=${encodeURIComponent(session.profileId)}`,{signal:controller.signal}).then(data=>{if(!controller.signal.aborted)setPendingBanks(data.pending);}).catch(()=>{});
    return()=>controller.abort();
  },[session.profileId,session.demo,adding]);
  const { add, accountId, finverseConnection, finverseWorkspace } =
    useLocalSearchParams<{
      add?: string;
      finverseConnection?: string;
      finverseWorkspace?: string;
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
    if (
      finverseWorkspace &&
      finverseWorkspace !== session.profileId &&
      session.data?.profiles.some((p) => p.id === finverseWorkspace)
    ) {
      session.setProfileId(finverseWorkspace);
      return;
    }
    if (add || finverseConnection) {
      setSelected(null);
      setAdding(true);
    }
  }, [add, finverseConnection, finverseWorkspace, session.profileId]);
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
  const ownedCurrencies = [...new Set(accounts.map(account => account.currency))];
  const displayedCurrency = ownedCurrencies.includes(currencyFilter) ? currencyFilter : ownedCurrencies.includes(session.data?.defaultCurrency ?? "") ? session.data!.defaultCurrency : ownedCurrencies[0];
  useLayoutEffect(() => {
    navigation.setOptions({ header: () => <AppHeader title="Accounts" trailing={<>
      <Pressable accessibilityRole="button" accessibilityLabel={`Select account currency: ${displayedCurrency ?? "none"}`} onPress={() => setCurrencyOpen(true)} style={styles.iconButton}><Icon line name="globe-outline" size={24} /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Add account" onPress={() => setAdding(true)} style={styles.iconButton}><AddNavigationMark size={32} /></Pressable>
    </>} /> });
  }, [navigation, displayedCurrency, styles.iconButton]);

  const groups = new Map<
    string,
    { title: string; currency: string; rows: Account[] }
  >();
  for (const account of accounts.filter(account => account.currency === displayedCurrency)) {
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
  const accountEditor = selected || adding ? (
      <AccountEditor
        defaultCurrency={session.data?.defaultCurrency ?? "PHP"}
        callbackConnection={finverseConnection}
        initial={selected}
        onClose={() => {
          router.setParams({
            add: undefined,
            finverseConnection: undefined,
            finverseWorkspace: undefined,
            finverse: undefined,
          });
          setSelected(null);
          setAdding(false);
        }}
        onSaved={(record) => {
          router.setParams({
            add: undefined,
            finverseConnection: undefined,
            finverseWorkspace: undefined,
            finverse: undefined,
          });
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
  ) : null;
  if (selected) return accountEditor;
  return (
    <Screen gap={24}>
      {adding ? <EntryOverlay onClose={() => setAdding(false)}>{accountEditor}</EntryOverlay> : null}
      {pendingBanks.map(connection=><Button key={connection.id} secondary icon="alert-circle" title={`Select accounts · ${connection.name}`} onPress={()=>router.push({pathname:"/accounts",params:{finverseConnection:connection.id,finverseWorkspace:session.profileId}})}/>)}
      <Modal visible={currencyOpen} transparent animationType="fade" onRequestClose={() => setCurrencyOpen(false)}>
        <View style={{ flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#0007" }}>
          <Pressable accessibilityLabel="Close currency selector" onPress={() => setCurrencyOpen(false)} style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0 }} />
          <View accessibilityViewIsModal style={{ backgroundColor: colors.white, borderRadius: 20, padding: 20, gap: 12 }}>
            <Heading>Account currency</Heading>
            <ScrollView style={{ maxHeight: 360 }}>
            {ownedCurrencies.length ? ownedCurrencies.map(code => <Pressable key={code} accessibilityRole="button" accessibilityLabel={code} accessibilityState={{ selected: displayedCurrency === code }} onPress={() => { setCurrencyFilter(code); setCurrencyOpen(false); }} style={{ minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}><Text style={{ color: colors.ink }}>{code}</Text>{displayedCurrency === code ? <Icon line name="checkmark" /> : null}</Pressable>) : <Body>Add an account to see its currency here.</Body>}
            </ScrollView>
            <Button secondary title="Close" onPress={() => setCurrencyOpen(false)} />
          </View>
        </View>
      </Modal>
      {summaries.filter(summary => summary.currency === displayedCurrency).map((summary) => (
        <View key={summary.currency} style={{ gap: 8 }}>
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
                  gap: 6,
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
                .map((account) => {
                  const palette = accountCardPalette(account);
                  const { foreground } = palette;
                  const expanded = expandedAccount === account.id;
                  const balance = accountDisplayBalance(account);
                  return (
                    <View key={account.id}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={
                          expanded
                            ? `Open ${label(account)} details`
                            : `Show ${label(account)} card`
                        }
                        accessibilityState={{ expanded }}
                        onPress={() =>
                          expanded
                            ? setSelected(account)
                            : setExpandedAccount(account.id)
                        }
                      >
                        <LinearGradient
                          colors={expanded ? palette.colors : [palette.colors[0], palette.colors[0]]}
                          locations={expanded ? palette.locations : undefined}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={{
                            borderRadius: expanded ? 28 : 14,
                            minHeight: expanded ? 190 : 60,
                            padding: expanded ? 24 : 10,
                            gap: 16,
                          }}
                        >
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 10,
                            }}
                          >
                            <AccountBrandLogo
                              account={account}
                              size={expanded ? 42 : 32}
                            />
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text
                                style={{
                                  fontFamily: "Poppins-SemiBold",
                                  fontSize: expanded ? 16 : 13,
                                  color: foreground,
                                }}
                              >
                                {expanded
                                  ? account.institution || account.name
                                  : label(account)}
                              </Text>
                              {!expanded && account.institution ? (
                                <Text
                                  style={{ fontSize: 10, color: foreground }}
                                >
                                  {account.institution}
                                </Text>
                              ) : null}
                            </View>
                            {!expanded ? (
                              <Text
                                style={{
                                  fontFamily: "Poppins-SemiBold",
                                  fontSize: 13,
                                  maxWidth: "38%",
                                  color: foreground,
                                }}
                              >
                                {balance === null
                                  ? "Not recorded"
                                  : money(balance, account.currency)}
                              </Text>
                            ) : null}
                            <Icon
                              line
                              name={
                                expanded ? "chevron-forward" : "chevron-down"
                              }
                              size={16}
                              color={foreground}
                            />
                          </View>
                          {expanded ? (
                            <>
                              <Text style={{ color: foreground, fontSize: 13 }}>
                                •••• {account.lastFour || "••••"}
                              </Text>
                              <Text
                                style={{
                                  fontFamily: "Poppins-Bold",
                                  fontSize: 24,
                                  color: foreground,
                                }}
                              >
                                {balance === null
                                  ? "Not recorded"
                                  : money(balance, account.currency)}
                              </Text>
                            </>
                          ) : null}
                        </LinearGradient>
                      </Pressable>
                      {expanded ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Hide ${label(account)} card`}
                          onPress={() => setExpandedAccount(null)}
                          style={{
                            minHeight: 44,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Text style={{ color: colors.teal, fontSize: 12 }}>
                            Hide card ⌃
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  );
                })}
            </View>
          ))
      )}
      {!loading && !error && !accounts.length ? (
        <Notice>No accounts yet. Use Add account above to get started.</Notice>
      ) : null}
    </Screen>
  );
}
