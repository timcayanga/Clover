import { useState } from "react";
import { Image } from "expo-image";
import { Pressable, View } from "react-native";
import { apiBase } from "./api-base";
import { Text } from "./app-text";
import { Body, Button, Heading, useTheme } from "./ui";
import { finverseCountries } from "../../shared/finverse-countries";
import { FINVERSE_BETA_NOTICE, finverseOptionLabel, groupFinverseBanks, type FinverseBankOption } from "../../shared/finverse-bank-options";

const countryFlags: Record<string, number> = {
  HKG: require("../assets/countries/hong kong.png"), IDN: require("../assets/countries/indonesia.png"),
  MYS: require("../assets/countries/malaysia.png"), PHL: require("../assets/countries/philippines.png"),
  SGP: require("../assets/countries/singapore.png"), VNM: require("../assets/countries/vietnam.png"),
};
function CountryFlag({code, fallback}: {code:string;fallback:string}) {
  return countryFlags[code] ? <Image source={countryFlags[code]} style={{width:48,height:36}} contentFit="contain" /> : <Text style={{fontSize:32}}>{fallback}</Text>;
}

export function BankLogo({path}:{path:string}) {
  const [failed,setFailed]=useState(false);
  return <Image source={failed?require("../assets/account-types/bank.png"):{uri:path.startsWith("/")?apiBase()+path:path}} style={{width:48,height:48}} contentFit="contain" onError={()=>setFailed(true)}/>;
}

export function FinverseBankPicker({ banks, busy, onConnect }: { banks: FinverseBankOption[]; busy: boolean; onConnect: (bank: FinverseBankOption) => void }) {
  const { colors } = useTheme();
  const [country, setCountry] = useState<string | null>(null);
  const [groupKey, setGroupKey] = useState<string | null>(null);
  const [betaId, setBetaId] = useState<string | null>(null);
  const countries = finverseCountries(banks);
  const groups = country ? groupFinverseBanks(banks, country) : [];
  const group = groups.find(g => g.key === groupKey);
  const beta = group?.options.find(o => o.id === betaId && o.status === "BETA");
  const choose = (option: FinverseBankOption) => { if (option.status === "BETA") setBetaId(option.id); else onConnect(option); };
  const badge = <Text style={{ fontSize: 11, color: colors.ink, backgroundColor: colors.line, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 }}>Beta</Text>;
  return <View style={{ gap: 16 }}>
    {country ? <Button secondary disabled={busy} title={`‹ ${group ? "Banks" : "Countries"} · ${countries.find(c => c.code === country)?.name}`} onPress={() => { if (group) { setGroupKey(null); setBetaId(null); } else setCountry(null); }} /> : null}
    {group ? <View style={{ gap: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}><BankLogo path={group.logoUrl} /><Heading>{group.name}</Heading></View>
      {group.options.length > 1 ? <><Body>Choose your bank access</Body>{group.options.map(option => <Pressable key={option.id} accessibilityRole="button" accessibilityLabel={`${finverseOptionLabel(option, group.options)}${option.status === "BETA" ? ", Beta" : ""}`} accessibilityState={{ disabled: busy, selected: betaId === option.id }} disabled={busy} onPress={() => choose(option)} style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 52, padding: 14, borderWidth: 1, borderRadius: 14, borderColor: betaId === option.id ? colors.teal : colors.line }}><Text style={{ flex: 1, color: colors.ink }}>{finverseOptionLabel(option, group.options)}</Text>{option.status === "BETA" ? badge : null}<Text style={{ color: colors.teal }}>›</Text></Pressable>)}</> : null}
      {beta ? <View accessibilityLiveRegion="polite" style={{ gap: 12, padding: 16, borderWidth: 1, borderColor: colors.line, borderRadius: 16 }}><Body>{finverseOptionLabel(beta, group.options)} · Beta</Body><Body muted>{FINVERSE_BETA_NOTICE}</Body><Button disabled={busy} title="Continue to Finverse" onPress={() => onConnect(beta)} /></View> : null}
    </View> : <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {!country ? countries.map(c => <Pressable key={c.code} accessibilityRole="button" accessibilityLabel={c.name} disabled={busy} onPress={() => setCountry(c.code)} style={{ width: "31%", padding: 12, alignItems: "center", gap: 8, borderWidth: 1, borderColor: colors.line, borderRadius: 16 }}><CountryFlag code={c.code} fallback={c.flag} /><Text style={{ fontSize: 11, color: colors.ink, textAlign: "center" }}>{c.name}</Text></Pressable>)
        : groups.map(g => <Pressable key={g.key} accessibilityRole="button" accessibilityLabel={`${g.name}, ${g.accessLabel}${g.betaOnly ? ", Beta" : ""}`} disabled={busy} onPress={() => { if (g.options.length === 1 && g.options[0].status !== "BETA") onConnect(g.options[0]); else { setGroupKey(g.key); setBetaId(g.options.length === 1 ? g.options[0].id : null); } }} style={{ width: "31%", padding: 8, alignItems: "center", gap: 8, borderWidth: 1, borderColor: colors.line, borderRadius: 16 }}><BankLogo path={g.logoUrl} /><Text style={{ fontSize: 11, color: colors.ink, textAlign: "center" }}>{g.name}</Text><Text style={{ fontSize: 10, color: colors.muted, textAlign: "center" }}>{g.accessLabel}</Text>{g.betaOnly ? badge : null}</Pressable>)}
      {country && !groups.length ? <Body>No banks are available here right now.</Body> : null}
    </View>}
  </View>;
}
