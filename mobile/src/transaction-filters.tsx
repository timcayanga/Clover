import { SafeAreaView } from "react-native-safe-area-context";
import { useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from "react-native";
import { Text } from "./app-text";
import { Button, CategoryMark, Field, Icon, Notice, useTheme } from "./ui";

import { AccountBrandLogo } from "./account-brand-logo";
import { emptyTransactionFilters, type TransactionFilters, type FilterOptions } from "./transaction-filter-query";
export function FilterRow({ label, summary, children }: { label: string; summary: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { colors } = useTheme();
  return <View style={{ borderBottomWidth: 1, borderBottomColor: colors.line }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${summary}`} accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 10 }}>
      <Text style={{ color: colors.ink, fontSize: 13, flexShrink: 1 }}>{label}</Text>
      <Text numberOfLines={1} style={{ flex: 1, textAlign: "right", color: colors.muted, fontSize: 12 }}>{summary}</Text>
      <Icon line name={open ? "chevron-up" : "chevron-down"} size={16}/>
    </Pressable>
    {open ? <View style={{ paddingBottom: 10 }}>{children}</View> : null}
  </View>;
}
export function DropdownFilter({ label, value, options, onChange }: {
  label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void;
}) {
  const { colors } = useTheme();
  return <FilterRow label={label} summary={options.find(option => option.value === value)?.label ?? "All"}>
    <View accessibilityRole="radiogroup" style={{ borderWidth: 1, borderColor: colors.line, borderRadius: 12, overflow: "hidden" }}>
      {options.map(option => <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: option.value === value }} onPress={() => onChange(option.value)} style={{ minHeight: 44, padding: 10, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: option.value === value ? colors.pale : colors.white, borderBottomWidth: 1, borderBottomColor: colors.line }}>
        <Text style={{ flex: 1, color: colors.ink, fontSize: 13 }}>{option.label}</Text>
        {option.value === value ? <Icon line name="checkmark" size={16} /> : null}
      </Pressable>)}
    </View>
  </FilterRow>;
}
export function TransactionFilterPanel({ value, options, optionError, onApply, onClose }: {
  value: TransactionFilters; options: FilterOptions; optionError?: string; onApply: (value: TransactionFilters) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const { colors } = useTheme();
  const set = <K extends keyof TransactionFilters>(key: K, value: TransactionFilters[K]) => setDraft(current => ({ ...current, [key]: value }));
  const menu = (label: string, key: keyof TransactionFilters, choices: {value:string;label:string; account?: FilterOptions["accounts"][number]; values?: string[]}[], multiple = false) => {
    const selected = (v: string) => { const values=choices.find(choice=>choice.value===v)?.values; return values ? values.every(id=>(draft[key] as string[]).includes(id)) : multiple ? (draft[key] as string[]).includes(v) : draft[key] === v; };
    const summary = choices.filter(c => selected(c.value)).map(c => c.label).join(", ") || "All";
    return <FilterRow label={label} summary={summary}>
      <View style={{ borderWidth: 1, borderColor: colors.line, borderRadius: 12, overflow: "hidden" }}>
        {(multiple ? [{value:"",label:"All"},...choices] : choices).map(choice => {
          const active = choice.value === "" && multiple ? (draft[key] as string[]).length === 0 : selected(choice.value);
          return <Pressable key={choice.value} accessibilityRole={multiple ? "checkbox" : "radio"} accessibilityState={{ checked: active }} onPress={() => {
            if (multiple) { const previous = draft[key] as string[]; const values=choice.values ?? [choice.value]; set(key, !choice.value ? [] : selected(choice.value) ? previous.filter(v => !values.includes(v)) : [...new Set([...previous,...values])]); }
            else set(key,choice.value);
          }} style={{ minHeight: 44, padding: 10, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: active ? colors.pale : colors.white, borderBottomWidth: 1, borderBottomColor: colors.line }}>
            {choice.value && label === "Category" ? <CategoryMark name={choice.label} size={24}/> : choice.account ? <AccountBrandLogo size={24} account={{...choice.account, type: choice.account.type ?? "bank", institution: choice.account.institution ?? null, brandLogoUrl: choice.account.brandLogoUrl ?? null}}/> : choice.value && label === "Type" ? <Icon line name={choice.value === "credit" ? "arrow-down-outline" : choice.value === "debit" ? "arrow-up-outline" : "swap-horizontal-outline"} size={22}/> : null}<Text style={{ flex: 1, color: colors.ink, fontSize: 13 }}>{choice.label}</Text>{active ? <Icon line name="checkmark" size={16}/> : null}
          </Pressable>;
        })}
      </View>
    </FilterRow>;
  };
  const named = (rows: {id:string;name:string}[]) => rows.map(r=>({value:r.id,label:r.name}));
  const invalidAmount = [draft.amountMin,draft.amountMax].some(v=>v!==""&&(!Number.isFinite(Number(v))||Number(v)<0)) || Boolean(draft.amountMin && draft.amountMax && Number(draft.amountMin)>Number(draft.amountMax));
  const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;
  const invalidDates = draft.dateFilterMode === "custom" && ((!draft.customStart && !draft.customEnd) || [draft.customStart,draft.customEnd].some(v=>v!==""&&!validDate(v)) || Boolean(draft.customStart&&draft.customEnd&&draft.customStart>draft.customEnd));
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: "#0007" }}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "center", padding: 12 }}>
          <View accessibilityViewIsModal style={{ flexShrink: 1, alignSelf: "center", width: "100%", maxWidth: 520, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 12, gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Text style={{ flex: 1, color: colors.ink, fontFamily: "Poppins-SemiBold" }}>Filters</Text>
              <Pressable accessibilityRole="button" onPress={()=>setDraft(emptyTransactionFilters)} style={{minHeight:44,justifyContent:"center"}}><Text style={{color:colors.teal}}>Reset</Text></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Close filters" onPress={onClose} style={{width:44,height:44,alignItems:"center",justifyContent:"center"}}><Icon line name="close"/></Pressable>
            </View>
            <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
              {optionError ? <Notice>Unable to load filter choices. Close and reopen Filters to retry.</Notice> : null}
              {menu("Dates","dateFilterMode",[{value:"ltd",label:"Lifetime"},{value:"day",label:"Today"},{value:"week",label:"This week"},{value:"month",label:"This month"},{value:"quarter",label:"This quarter"},{value:"year",label:"This year"},{value:"custom",label:"Custom range"}])}
              {draft.dateFilterMode==="custom" ? <View style={{gap:8,paddingVertical:8}}><Field accessibilityLabel="From date" placeholder="From: YYYY-MM-DD" value={draft.customStart} onChangeText={v=>set("customStart",v)}/><Field accessibilityLabel="To date" placeholder="To: YYYY-MM-DD" value={draft.customEnd} onChangeText={v=>set("customEnd",v)}/></View> : null}
              {menu("Type","types",[{value:"debit",label:"Expense"},{value:"credit",label:"Income"},{value:"transfer",label:"Transfer"}],true)}
              {menu("Account","accounts",[...Array.from(new Set(options.accounts.filter(a=>a.type!=="investment").map(a=>a.institution).filter((v):v is string=>Boolean(v)))).map(institution=>({value:`institution:${institution}`,label:`${institution} · All accounts`,account:{id:institution,name:institution,currency:"",type:"bank",institution,brandLogoUrl:options.accounts.find(a=>a.institution===institution)?.brandLogoUrl},values:options.accounts.filter(a=>a.type!=="investment"&&a.institution===institution).map(a=>a.id)})),...options.accounts.filter(a=>a.type!=="investment").map(account=>({value:account.id,label:account.name,account}))],true)}
              {menu("Category","categories",named(options.categories),true)}
              <FilterRow label="Amount" summary={draft.amountMin||draft.amountMax?`${draft.amountMin||"0"} – ${draft.amountMax||"Any"}`:"Any amount"}>
                <View style={{flexDirection:"row",gap:8}}><View style={{flex:1}}><Field accessibilityLabel="Minimum amount" placeholder="Minimum" keyboardType="decimal-pad" value={draft.amountMin} onChangeText={v=>set("amountMin",v)}/></View><View style={{flex:1}}><Field accessibilityLabel="Maximum amount" placeholder="Maximum" keyboardType="decimal-pad" value={draft.amountMax} onChangeText={v=>set("amountMax",v)}/></View></View>
              </FilterRow>
              {menu("Currency","currency",[{value:"",label:"All currencies"},...[...new Set(options.accounts.map(a=>a.currency))].sort().map(value=>({value,label:value}))])}
              {menu("Tags","tags",named(options.tags),true)}
              {menu("Source","sourceFilter",[{value:"",label:"All sources"},{value:"manual",label:"Manual"},{value:"upload",label:"Imported"}])}
              {menu("Extraction confidence","confidenceFilter",[{value:"",label:"Any confidence"},{value:"high",label:"High · 85–100%"},{value:"medium",label:"Medium · 65–84%"},{value:"low",label:"Low · below 65%"}])}
              {menu("Warnings","reviewFilter",[{value:"",label:"All transactions"},{value:"pending",label:"Needs review"},{value:"confirmed",label:"Confirmed"}])}
            </ScrollView>
            {invalidAmount||invalidDates ? <Text style={{color:colors.danger,fontSize:12}}>Check the amount or date range.</Text> : null}
            <Button title="Show transactions" disabled={invalidAmount||invalidDates} onPress={()=>onApply(draft)}/>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
