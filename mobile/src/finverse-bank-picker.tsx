import { useEffect, useMemo, useState } from "react";
import { Image, type ImageRef } from "expo-image";
import { Pressable, ScrollView, View } from "react-native";
import { apiBase } from "./api-base";
import { Text } from "./app-text";
import { Body, Button, Heading, useTheme } from "./ui";
import { loadFinverseBankLogos } from "../../shared/finverse-bank-logos";
import { finverseCountries } from "../../shared/finverse-countries";
import {
  FINVERSE_BETA_NOTICE,
  finverseOptionLabel,
  groupFinverseBanks,
  type FinverseBankOption,
} from "../../shared/finverse-bank-options";

const countryFlags: Record<string, number> = {
  HKG: require("../assets/countries/hong kong.png"),
  IDN: require("../assets/countries/indonesia.png"),
  MYS: require("../assets/countries/malaysia.png"),
  PHL: require("../assets/countries/philippines.png"),
  SGP: require("../assets/countries/singapore.png"),
  VNM: require("../assets/countries/vietnam.png"),
};
function CountryFlag({ code, fallback }: { code: string; fallback: string }) {
  return countryFlags[code] ? (
    <Image
      source={countryFlags[code]}
      style={{ width: 48, height: 36 }}
      contentFit="contain"
    />
  ) : (
    <Text style={{ fontSize: 32 }}>{fallback}</Text>
  );
}

const fallbackLogo = require("../assets/account-types/bank.png");
const logoUri = (path: string) => path.startsWith("/") ? apiBase() + path : path;

export function BankLogo({ path, size = 48, decoded }: { path: string; size?: number; decoded?: ImageRef | null }) {
  return <BankLogoImage key={path} path={path} size={size} decoded={decoded} />;
}

function BankLogoImage({ path, size, decoded }: { path: string; size: number; decoded?: ImageRef | null }) {
  const [failed, setFailed] = useState(false);
  return (
    <Image
      source={
        failed || decoded === null
          ? fallbackLogo
          : decoded ?? { uri: logoUri(path) }
      }
      style={{ width: size, height: size, borderRadius: size / 4 }}
      contentFit="contain"
      onError={() => setFailed(true)}
    />
  );
}

export function FinverseBankPicker({
  banks,
  busy,
  onConnect,
}: {
  banks: FinverseBankOption[];
  busy: boolean;
  onConnect: (bank: FinverseBankOption) => void;
}) {
  const { colors } = useTheme();
  const [country, setCountry] = useState<string | null>(null);
  const [groupKey, setGroupKey] = useState<string | null>(null);
  const [betaId, setBetaId] = useState<string | null>(null);
  const countries = finverseCountries(banks);
  const groups = useMemo(() => country ? groupFinverseBanks(banks, country) : [], [banks, country]);
  const [logoBatch, setLogoBatch] = useState<{ groups: typeof groups; loaded: ReadonlyMap<string, ImageRef> }>();
  useEffect(() => {
    if (!groups.length) return;
    let current = true;
    void loadFinverseBankLogos(groups.map(group => group.logoUrl), path =>
      Image.loadAsync(logoUri(path), { maxWidth: 144, maxHeight: 144 }),
    ).then(loaded => { if (current) setLogoBatch({ groups, loaded }); });
    return () => { current = false; };
  }, [groups]);
  const group = groups.find((g) => g.key === groupKey);
  const beta = group?.options.find(
    (o) => o.id === betaId && o.status === "BETA",
  );
  const choose = (option: FinverseBankOption) => {
    if (option.status === "BETA") setBetaId(option.id);
    else onConnect(option);
  };
  return (
    <View style={{ gap: 16 }}>
      {country ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
          accessibilityLabel="Countries"
        >
          {countries.map((c) => (
            <Pressable
              key={c.code}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={c.name}
              accessibilityState={{
                selected: country === c.code,
                disabled: busy,
              }}
              onPress={() => {
                setCountry(c.code);
                setGroupKey(null);
                setBetaId(null);
              }}
              style={{
                alignItems: "center",
                gap: 4,
                padding: 10,
                borderWidth: 1,
                borderRadius: 14,
                borderColor: country === c.code ? colors.teal : colors.line,
                backgroundColor:
                  country === c.code ? colors.pale : "transparent",
              }}
            >
              <CountryFlag code={c.code} fallback={c.flag} />
              <Text style={{ fontSize: 11, color: colors.ink }}>{c.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      {group ? (
        <Button
          secondary
          title="‹ Banks"
          disabled={busy}
          onPress={() => {
            setGroupKey(null);
            setBetaId(null);
          }}
        />
      ) : null}
      {group ? (
        <View style={{ gap: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <BankLogo path={group.logoUrl} decoded={logoBatch?.loaded.get(group.logoUrl) ?? null} />
            <Heading>{group.name}</Heading>
          </View>
          {group.options.length > 1 ? (
            <>
              <Body>Choose your bank access</Body>
              {group.options.map((option) => (
                <Pressable
                  key={option.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${finverseOptionLabel(option, group.options)}${option.status === "BETA" ? ", Beta" : ""}`}
                  accessibilityState={{
                    disabled: busy,
                    selected: betaId === option.id,
                  }}
                  disabled={busy}
                  onPress={() => choose(option)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    minHeight: 52,
                    padding: 14,
                    borderWidth: 1,
                    borderRadius: 14,
                    borderColor:
                      betaId === option.id ? colors.teal : colors.line,
                  }}
                >
                  <Text style={{ flex: 1, color: colors.ink }}>
                    {finverseOptionLabel(option, group.options)}
                  </Text>
                  <Text style={{ color: colors.teal }}>›</Text>
                </Pressable>
              ))}
            </>
          ) : null}
          {beta ? (
            <View
              accessibilityLiveRegion="polite"
              style={{
                gap: 12,
                padding: 16,
                borderWidth: 1,
                borderColor: colors.line,
                borderRadius: 16,
              }}
            >
              <Body>{finverseOptionLabel(beta, group.options)}</Body>
              <Body muted>{FINVERSE_BETA_NOTICE}</Body>
              <Button
                disabled={busy}
                title="Continue to Finverse"
                onPress={() => onConnect(beta)}
              />
            </View>
          ) : null}
        </View>
      ) : groups.length && logoBatch?.groups !== groups ? (
        <Body>Loading banks…</Body>
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {!country
            ? countries.map((c) => (
                <Pressable
                  key={c.code}
                  accessibilityRole="button"
                  accessibilityLabel={c.name}
                  disabled={busy}
                  onPress={() => setCountry(c.code)}
                  style={{
                    width: "31%",
                    padding: 12,
                    alignItems: "center",
                    gap: 8,
                    borderWidth: 1,
                    borderColor: colors.line,
                    borderRadius: 16,
                  }}
                >
                  <CountryFlag code={c.code} fallback={c.flag} />
                  <Text
                    style={{
                      fontSize: 11,
                      color: colors.ink,
                      textAlign: "center",
                    }}
                  >
                    {c.name}
                  </Text>
                </Pressable>
              ))
            : groups.map((g) => (
                <Pressable
                  key={g.key}
                  accessibilityRole="button"
                  accessibilityLabel={`${g.name}, ${g.accessLabels.join(", ")}${g.betaOnly ? ", Beta" : ""}`}
                  disabled={busy}
                  onPress={() => {
                    if (
                      g.options.length === 1 &&
                      g.options[0].status !== "BETA"
                    )
                      onConnect(g.options[0]);
                    else {
                      setGroupKey(g.key);
                      setBetaId(
                        g.options.length === 1 ? g.options[0].id : null,
                      );
                    }
                  }}
                  style={{
                    width: "31%",
                    padding: 8,
                    alignItems: "center",
                    gap: 8,
                    borderWidth: 1,
                    borderColor: colors.line,
                    borderRadius: 16,
                  }}
                >
                  <BankLogo path={g.logoUrl} decoded={logoBatch?.loaded.get(g.logoUrl) ?? null} />
                  <Text
                    style={{
                      fontSize: 11,
                      color: colors.ink,
                      textAlign: "center",
                    }}
                  >
                    {g.name}
                  </Text>
                  <View style={{ marginTop: "auto", flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 4 }}>
                    {g.accessLabels.map(label => (
                      <Text key={label} style={{ fontSize: 10, color: colors.ink, backgroundColor: colors.pale, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 }}>
                        {label}
                      </Text>
                    ))}
                  </View>
                </Pressable>
              ))}
          {country && !groups.length ? (
            <Body>No banks are available here right now.</Body>
          ) : null}
        </View>
      )}
    </View>
  );
}
