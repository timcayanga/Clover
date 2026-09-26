import { useState, type ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Text } from "./app-text";
import { Button, Field, Icon, useTheme } from "./ui";

import { emptyTransactionFilters, type TransactionFilters, type FilterOptions } from "./transaction-filter-query";
function FilterRow({ label, summary, children }: { label: string; summary: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { colors } = useTheme();
  return <View style={{ borderBottomWidth: 1, borderBottomColor: colors.line }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${summary}`} accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={{ minHeight: 48, flexDirection: "row", alignItems: "center", gap: 10 }}>
      <Text style={{ color: colors.ink, fontSize: 13 }}>{label}</Text>
      <Text numberOfLines={1} style={{ flex: 1, textAlign: "right", color: colors.muted, fontSize: 12 }}>{summary}</Text>
      <Icon line name={open ? "chevron-up" : "chevron-down"} size={16}/>
    </Pressable>
    {open ? <View style={{ paddingBottom: 10 }}>{children}</View> : null}
  </View>;
}
export function TransactionFilterPanel({ value, options, onApply, onClose }: {
  value: TransactionFilters; options: FilterOptions; onApply: (value: TransactionFilters) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const { colors } = useTheme();
  const set = <K extends keyof TransactionFilters>(key: K, value: TransactionFilters[K]) => setDraft(current => ({ ...current, [key]: value }));
  const menu = (label: string, key: keyof TransactionFilters, choices: {value:string;label:string}[], multiple = false) => {
    const selected = (v: string) => multiple ? (draft[key] as string[]).includes(v) : draft[key] === v;
    const summary = choices.filter(c => selected(c.value)).map(c => c.label).join(", ") || "All";
    return <FilterRow label={label} summary={summary}>
      <View style={{ borderWidth: 1, borderColor: colors.line, borderRadius: 12, overflow: "hidden" }}>
        {(multiple ? [{value:"",label:"All"},...choices] : choices).map(choice => {
          const active = choice.value === "" && multiple ? (draft[key] as string[]).length === 0 : selected(choice.value);
          return <Pressable key={choice.value} accessibilityRole={multiple ? "checkbox" : "radio"} accessibilityState={{ checked: active }} onPress={() => {
            if (multiple) { const previous = draft[key] as string[]; set(key, !choice.value ? [] : previous.includes(choice.value) ? previous.filter(v => v !== choice.value) : [...previous,choice.value]); }
            else set(key,choice.value);
          }} style={{ minHeight: 44, padding: 10, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: active ? colors.pale : colors.white, borderBottomWidth: 1, borderBottomColor: colors.line }}>
            <Text style={{ flex: 1, color: colors.ink, fontSize: 13 }}>{choice.label}</Text>{active ? <Icon line name="checkmark" size={16}/> : null}
          </Pressable>;
        })}
      </View>
    </FilterRow>;
  };
  const named = (rows: {id:string;name:string}[]) => rows.map(r=>({value:r.id,label:r.name}));
  const invalidAmount = [draft.amountMin,draft.amountMax].some(v=>v!==""&&(!Number.isFinite(Number(v))||Number(v)<0)) || Boolean(draft.amountMin && draft.amountMax && Number(draft.amountMin)>Number(draft.amountMax));
  const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;
  const invalidDates = draft.dateFilterMode === "custom" && ((!draft.customStart && !draft.customEnd) || [draft.customStart,draft.customEnd].some(v=>v!==""&&!validDate(v)) || Boolean(draft.customStart&&draft.customEnd&&draft.customStart>draft.customEnd));
  return <View style={{ backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 12, gap: 8 }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <Text style={{ flex: 1, color: colors.ink, fontFamily: "Poppins-SemiBold" }}>Filters</Text>
      <Pressable accessibilityRole="button" onPress={()=>setDraft(emptyTransactionFilters)} style={{minHeight:44,justifyContent:"center"}}><Text style={{color:colors.teal}}>Reset</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Close filters" onPress={onClose} style={{width:44,height:44,alignItems:"center",justifyContent:"center"}}><Icon line name="close"/></Pressable>
    </View>
    <ScrollView style={{ maxHeight: 300 }} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
      {menu("Dates","dateFilterMode",[{value:"ltd",label:"Lifetime"},{value:"day",label:"Today"},{value:"week",label:"This week"},{value:"month",label:"This month"},{value:"quarter",label:"This quarter"},{value:"year",label:"This year"},{value:"custom",label:"Custom range"}])}
      {draft.dateFilterMode==="custom" ? <View style={{gap:8,paddingVertical:8}}><Field accessibilityLabel="From date" placeholder="From: YYYY-MM-DD" value={draft.customStart} onChangeText={v=>set("customStart",v)}/><Field accessibilityLabel="To date" placeholder="To: YYYY-MM-DD" value={draft.customEnd} onChangeText={v=>set("customEnd",v)}/></View> : null}
      {menu("Type","types",[{value:"debit",label:"Expense"},{value:"credit",label:"Income"},{value:"transfer",label:"Transfer"}],true)}
      {menu("Account","accounts",named(options.accounts),true)}
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
  </View>;
}
