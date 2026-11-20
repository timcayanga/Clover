import { AccountSummaryGrid } from "../src/account-summary-grid";
import { currencyMark } from "../../shared/currency-mark";
import { usePageAskScope } from "../src/page-ask-context";
import { accountSectionEmoji, accountSectionTitle, accountSectionType } from "../../shared/account-presentation";
import { recordedSummary } from "../src/recorded-summary";
import { Modal } from "../src/adaptive-modal";
import { AdaptiveDetail } from "../src/adaptive-detail";
import { AccountEditTile, AccountGrid, AccountGridCard } from "../src/account-grid";
import { useLiveInvestmentValues } from "../src/use-live-investment-values";
import { CloverEmptyState } from "../src/clover-mascot";
import { institutionGroups } from "../src/institution-groups";
import { consolidatedAccountSummary } from "../../shared/account-summary";
import { useExchangeRates } from "../src/use-exchange-rates";
import { FinversePendingChip } from "../src/finverse-pending-chip";
import type { PendingBankConnection } from "../../shared/finverse-pending";
import { createScreenDataLoader, registerScreenRefresh } from "../src/screen-refresh";
import { EntryOverlay } from "../src/entry-overlay";
import { Text } from "../src/app-text";
import { AccountBrandLogo } from "../src/account-brand-logo";
import { AccountTypeMark } from "../src/account-type-mark";
import { accountCardPalette } from "../../shared/visual-identity";
import {
  router,
  useFocusEffect,
  useLocalSearchParams,
  useNavigation,
} from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { useSession } from "../src/session";
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
  ProfileGate,
  Screen,
  money,
  useTheme,
} from "../src/ui";
import {
  AccountEditor,
  accountDisplayBalance,
  type AccountRecord as Account,
} from "../src/account-editor";
export default function AccountsRoute() {
  const { profileId } = useSession();
  return <ProfileGate><Accounts key={profileId} /></ProfileGate>;
}

function Accounts() {
  const session = useSession();
  return <AccountsContent key={session.profileId} />;
}
function AccountsContent() {
  const { colors, styles } = useTheme();
  const session = useSession();
  async function deleteRow(account: Account) {
    await session.request(`accounts/${account.id}?workspaceId=${encodeURIComponent(session.profileId)}`, { method: "DELETE" });
    setAccounts(current => current.filter(row => row.id !== account.id));
    session.refresh();
  }
  const [editingCards, setEditingCards] = useState(false);
  const deleting = useRef(false);
  useFocusEffect(useCallback(() => () => setEditingCards(false), []));
  const enterEdit = session.demo ? undefined : () => setEditingCards(true);
  function confirmRemoval(account: Account) {
    if (!editingCards || session.demo || deleting.current || account.id.startsWith("fallback-cash-")) return;
    Alert.alert(`Delete ${account.name}?`, "This deletes the account and its linked transactions and cannot be undone.", [
      {text:"Cancel", style:"cancel"},
      {text:"Delete Account", style:"destructive", onPress:async () => {
        if (deleting.current) return;
        deleting.current = true;
        try { await deleteRow(account); }
        catch { Alert.alert("Unable to Delete Account", "Please try again."); }
        finally { deleting.current = false; }
      }},
    ]);
  }
  const doneEditing = editingCards ? <Button title="Done" secondary onPress={() => setEditingCards(false)} /> : null;
  const [currencyFilter, setCurrencyFilter] = useState("");
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [recordedAccounts, setAccounts] = useState<Account[]>([]);
  const liveValues = useLiveInvestmentValues(recordedAccounts.filter(account => account.type === "investment").map(account => ({ id: account.id, name: account.name, currency: account.currency, subtype: account.investmentSubtype, symbol: account.investmentSymbol, quantity: account.investmentQuantity })));
  const accounts = recordedAccounts.map(account => liveValues[account.id] === undefined ? account : { ...account, displayBalance: String(liveValues[account.id]) });
  const [institutionId, setInstitutionId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Account | null>(null);
  const [adding, setAdding] = useState(false);
  const [pendingBanks,setPendingBanks]=useState<PendingBankConnection[]>([]);
  const [cancellingBank,setCancellingBank]=useState(false);
  const [bankMessage,setBankMessage]=useState("");
  const cancellingBankRef=useRef(false);
  async function cancelBank(connectionId:string) {
    if(cancellingBankRef.current)return;
    cancellingBankRef.current=true;setCancellingBank(true);setBankMessage("");
    try {
      const data=await session.request<{message:string}>("finverse/unlink",{method:"POST",body:JSON.stringify({workspaceId:session.profileId,connectionId})});
      setPendingBanks(current=>current.filter(bank=>bank.id!==connectionId));setBankMessage(data.message);
    }catch(error){setBankMessage(error instanceof Error?error.message:"Unable to cancel linking. Please try again.");}
    finally{cancellingBankRef.current=false;setCancellingBank(false);}
  }
  useEffect(()=>{
    const controller=new AbortController();
    if(session.demo||adding){setPendingBanks([]);return;}
    void session.request<{pending:PendingBankConnection[]}>(`finverse/connections?view=picker&workspaceId=${encodeURIComponent(session.profileId)}`,{signal:controller.signal}).then(data=>{if(!controller.signal.aborted)setPendingBanks(data.pending);}).catch(()=>{});
    return()=>controller.abort();
  },[session.profileId,session.demo,adding]);
  const { add, accountId, finverseConnection, finverseWorkspace, onboarding, currency: linkCurrency } =
    useLocalSearchParams<{
      add?: string;
      onboarding?: string;
      finverseConnection?: string;
      finverseWorkspace?: string;
      accountId?: string;
      currency?: string;
    }>();
  useEffect(() => {
    if (linkCurrency && /^[A-Z]{3}$/.test(linkCurrency)) setCurrencyFilter(linkCurrency);
  }, [linkCurrency]);
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
  const loadedProfile = useRef<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      const cached = session.cached<{ accounts: Account[] }>(`accounts?workspaceId=${encodeURIComponent(session.profileId)}`);
      if (cached) setAccounts(cached.accounts);
      setLoading(!cached && loadedProfile.current !== session.profileId);
      setError("");
      setSelected(null);
      const load = () => session.demo
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
      const refresh = createScreenDataLoader<{ accounts: Account[] }>({
        load,
        active: () => active,
        apply: data => {
          loadedProfile.current = session.profileId;
          setAccounts(data.accounts);
          setError("");
        },
        error: e => setError((e as Error).message),
        settled: () => setLoading(false),
      });
      void refresh();
      const unregister = registerScreenRefresh("/accounts", refresh);
      return () => {
        active = false; unregister();
      };
    }, [session.demo, session.profileId, session.request, revision]),
  );
  const label = (account: Account) =>
    [account.name, account.lastFour && !account.name.trim().endsWith(account.lastFour) ? account.lastFour : null].filter(Boolean).join(" ");
  const amountLabel = (account: Account) =>
    ["credit_card", "loan", "mortgage", "liability"].includes(account.type)
      ? "Outstanding balance"
      : account.type === "investment"
        ? "Recorded value"
        : "Balance";
  const ownedCurrencies = [...new Set(accounts.map(account => account.currency))];
  const displayedCurrency = currencyFilter === "ALL" ? "ALL" : ownedCurrencies.includes(currencyFilter) ? currencyFilter : ownedCurrencies.includes(session.data?.defaultCurrency ?? "") ? session.data!.defaultCurrency : ownedCurrencies[0];
  usePageAskScope({
    page: "accounts",
    title: selected?.name ?? "Accounts",
    accountId: selected?.id,
    currency: selected?.currency ?? (displayedCurrency === "ALL" ? undefined : displayedCurrency),
  });
  useLayoutEffect(() => {
    navigation.setOptions({ header: () => <AppHeader title="Accounts" leading={
      <Pressable accessibilityRole="button" accessibilityLabel={`Select account currency: ${displayedCurrency ?? "none"}`} onPress={() => setCurrencyOpen(true)} style={styles.iconButton}>{displayedCurrency === "ALL" || !displayedCurrency ? <Icon line name="globe-outline" size={24} /> : <Text style={{ color: colors.teal, fontFamily: "Poppins-SemiBold", fontSize: 13 }}>{currencyMark(displayedCurrency)} {displayedCurrency}</Text>}</Pressable>
    } trailing={editingCards ? <Button title="Done" secondary onPress={() => setEditingCards(false)} /> :
      <Pressable accessibilityRole="button" accessibilityLabel="Add account" onPress={() => setAdding(true)} style={styles.iconButton}><AddNavigationMark size={32} /></Pressable>
    } /> });
  }, [navigation, displayedCurrency, colors.teal, styles.iconButton, editingCards]);

  const groups = new Map<
    string,
    { title: string; currency: string; rows: Account[] }
  >();
  for (const account of accounts.filter(account => displayedCurrency === "ALL" || account.currency === displayedCurrency)) {
    const title = accountSectionTitle(accountSectionType(account)),
      key = displayedCurrency === "ALL" ? title : `${title}:${account.currency}`;
    if (!groups.has(key))
      groups.set(key, { title, currency: account.currency, rows: [] });
    groups.get(key)!.rows.push(account);
  }
  const groupOrder = [
    "Banks & Savings",
    "Credit Cards",
    "Liabilities",
    "Wallets",
    "Investments",
    "Tracked Assets",
    "Cash",
    "Other Accounts",
  ];
  const summaryCurrency = displayedCurrency === "ALL" ? session.data?.defaultCurrency ?? "PHP" : displayedCurrency ?? session.data?.defaultCurrency ?? "PHP";
  const summaryRows = accounts.filter(a => displayedCurrency === "ALL" || a.currency === displayedCurrency).map(a => ({ type: accountSectionType(a), currency: a.currency, balance: accountDisplayBalance(a) === null ? null : Number(accountDisplayBalance(a)) }));
  const exchangeRates = useExchangeRates(summaryRows.filter(a => a.balance !== null && a.balance !== 0).map(a => a.currency), summaryCurrency, displayedCurrency === "ALL");
  const summary = consolidatedAccountSummary(summaryRows, summaryCurrency, exchangeRates.rates);
  const accountEditor = selected || adding ? (
      <AccountEditor
        mergeAccounts={accounts}
        defaultCurrency={session.data?.defaultCurrency ?? "PHP"}
        callbackConnection={finverseConnection}
        connectInitially={add === "connect"}
        onboarding={onboarding === "1"}
        initial={selected}
        onClose={() => {
          if (adding) setRevision(v => v + 1);
          router.setParams({
            add: undefined,
            onboarding: undefined,
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
            onboarding: undefined,
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
  const institution = institutionGroups(accounts, accountSectionType).find(group => group.id === institutionId);
  const institutionDetail = institution ? <Screen gap={20}>
    <Button title="All accounts" secondary onPress={() => setInstitutionId(null)} />
    <Heading>{institution.name}</Heading>
    <Body>{institution.assets.length} assets · {institution.currency}</Body>
    {doneEditing}
    {institution.assets.map(asset => <AccountEditTile key={asset.id} editing={editingCards} name={asset.name} onDelete={()=>confirmRemoval(asset)}>
      <Pressable accessibilityRole="button" accessibilityLabel={`View ${asset.name}`} onLongPress={enterEdit} onPress={() => !editingCards && setSelected(asset)}>
      <Card><View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <AccountBrandLogo account={asset} size={36} />
        <View style={{ flex: 1 }}><Text style={{ color: colors.ink, fontFamily: "Poppins-SemiBold" }}>{asset.name}</Text><Body>{asset.investmentSymbol ?? "Investment"}</Body></View>
        <Text style={{ color: colors.ink }}>{money(accountDisplayBalance(asset) ?? "0", asset.currency)}</Text>
        <Icon line name="chevron-forward" size={16} />
      </View></Card>
    </Pressable></AccountEditTile>)}
  </Screen> : <Screen><Body>Select an investment institution to see its assets here.</Body></Screen>;
  return <AdaptiveDetail selected={Boolean(institution)} detailOnlyOnCompact detail={institutionDetail} list={(
    <Screen layout="dashboard" gap={24}>
      {adding ? <EntryOverlay onClose={() => setAdding(false)}>{accountEditor}</EntryOverlay> : null}
      {pendingBanks.map(connection=><FinversePendingChip key={connection.id} connection={connection} busy={cancellingBank} onResume={()=>router.push({pathname:"/accounts",params:{finverseConnection:connection.id,finverseWorkspace:session.profileId}})} onCancel={()=>void cancelBank(connection.id)}/>)}
      {bankMessage?<Notice>{bankMessage}</Notice>:null}
      <Modal visible={currencyOpen} transparent animationType="fade" onRequestClose={() => setCurrencyOpen(false)}>
        <View style={{ flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#0007" }}>
          <Pressable accessibilityLabel="Close currency selector" onPress={() => setCurrencyOpen(false)} style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0 }} />
          <View accessibilityViewIsModal style={{ width: "100%", maxWidth: 440, alignSelf: "center", maxHeight: "90%", flexShrink: 1, backgroundColor: colors.white, borderRadius: 20, padding: 20, gap: 12 }}>
            <Heading>Account currency</Heading>
            <ScrollView style={{ flexShrink: 1 }}>
            {ownedCurrencies.length ? ["ALL", ...ownedCurrencies].map(code => <Pressable key={code} accessibilityRole="button" accessibilityLabel={code === "ALL" ? "All Currencies" : code} accessibilityState={{ selected: displayedCurrency === code }} onPress={() => { setCurrencyFilter(code); setCurrencyOpen(false); }} style={{ minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}><Text style={{ color: colors.ink }}>{currencyMark(code)} {code === "ALL" ? "All Currencies" : code}</Text>{displayedCurrency === code ? <Icon line name="checkmark" /> : null}</Pressable>) : <Body>Add an account to see its currency here.</Body>}
            </ScrollView>
            <Button secondary title="Close" onPress={() => setCurrencyOpen(false)} />
          </View>
        </View>
      </Modal>
      <View style={{ gap: 8 }}>
        <AccountSummaryGrid metrics={["Net worth", "Spendable", "Assets", "Liabilities"].map((title, i) => ({
          label: displayedCurrency === "ALL" ? `Est. ${title}` : title,
          value: summary.values[i] === null ? "—" : money(String(summary.values[i]), summaryCurrency),
          negative: i === 3 || (summary.values[i] ?? 0) < 0,
        }))} />
        {summary.missingCurrencies.length ? <><Body>{exchangeRates.loading ? "Loading exchange rates…" : `Unable to estimate all balances. Exchange rate unavailable: ${summary.missingCurrencies.join(", ")}.`}</Body>{!exchangeRates.loading ? <Button secondary title="Retry rates" onPress={exchangeRates.retry} /> : null}</> : null}
      </View>
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
                  gap: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                }}
              >
                <Text
                  accessibilityRole="header"
                  accessibilityLabel={group.title}
                  style={{
                    fontFamily: "Poppins-SemiBold",
                    fontSize: 14,
                    color: colors.ink,
                  }}
                >
                  {accountSectionEmoji(group.title)} {group.title}
                </Text>
                <Text
                  style={{
                    fontFamily: "Poppins-SemiBold",
                    fontSize: 13,
                    color: colors.ink,
                  }}
                >
                  {(() => {
                    const totals = consolidatedAccountSummary(group.rows.map(account => ({ type: accountSectionType(account), currency: account.currency, balance: Number(accountDisplayBalance(account) ?? 0) })), displayedCurrency === "ALL" ? summaryCurrency : group.currency, exchangeRates.rates);
                    const total = totals.values[0];
                    return total === null ? "—" : money(String(["Credit Cards", "Liabilities"].includes(group.title) ? Math.abs(total) : total), displayedCurrency === "ALL" ? summaryCurrency : group.currency);
                  })()}
                </Text>
              </View>
              <AccountGrid>
              {group.title === "Investments" ? institutionGroups(group.rows, accountSectionType).map(institution => {
                const representative = institution.assets[0];
                const palette = accountCardPalette(representative);
                const value = recordedSummary(institution.assets.map(a => accountDisplayBalance(a) ?? "0"));
                return <AccountEditTile key={institution.id} name={institution.name} editing={editingCards}><AccountGridCard onLongPress={enterEdit} name={institution.name}
                  identifier={`${institution.assets.length} ${institution.assets.length === 1 ? "asset" : "assets"}`}
                  amount={(money(String(value.value ?? 0), institution.currency)) + (value.missing > 0 && value.known > 0 ? "*" : "")}
                  palette={palette} logo={<AccountBrandLogo account={representative} size={32} radius={7} />}
                  onOpen={() => setInstitutionId(institution.id)} /></AccountEditTile>;
              }) : [...group.rows]
                .sort(
                  (a, b) =>
                    Math.abs(Number(accountDisplayBalance(b))) -
                      Math.abs(Number(accountDisplayBalance(a))) ||
                    a.name.localeCompare(b.name),
                )
                .map((account) => {
                  const palette = accountCardPalette(account);
                  const balance = accountDisplayBalance(account);
                  return (
                    <AccountEditTile key={account.id} editing={editingCards} name={label(account)} onDelete={account.id.startsWith("fallback-cash-") ? undefined : () => confirmRemoval(account)}>
                      <AccountGridCard onLongPress={enterEdit} name={label(account)}
                        identifier={account.lastFour ? `•••• ${account.lastFour}` : account.type === "cash" ? "Cash on hand" : accountSectionTitle(accountSectionType(account))}
                        amount={money(balance ?? "0", account.currency)} palette={palette}
                        logo={<AccountBrandLogo account={account} size={32} radius={7} />}
                        onOpen={() => !editingCards && setSelected(account)} />
                    </AccountEditTile>
                  );
                })}
              </AccountGrid>
            </View>
          ))
      )}
      {!loading && !error && !accounts.length ? (
        <CloverEmptyState pose="accounts">No accounts yet. Use Add account above to get started.</CloverEmptyState>
      ) : null}
    </Screen>
  )} />;
}
