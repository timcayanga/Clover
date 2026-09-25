import { getTimeZoneOptions, formatTimeZoneLabel } from "../../shared/region-options";
import { ChoiceField } from "../src/transaction-entry";
import { Text } from "../src/app-text";
import { useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { View, Pressable } from "react-native";
import { Icon } from "../src/ui";
import { useSession } from "../src/session";
import { useDisplayPreferences } from "../src/display-preferences";
import { Body, Button, Card, Field, Notice, Screen, useTheme } from "../src/ui";
import { SettingsPreferences } from "../src/settings-preferences";
import { SettingsPlan } from "../src/settings-plan";
import { SettingsData } from "../src/settings-data";
import { SettingsConnections } from "../src/settings-connections";
import { SettingsPhoto } from "../src/settings-photo";
import { SettingsSecurity } from "../src/settings-security";
import { SettingsCategories } from "../src/settings-categories";
import { SettingsProfiles } from "../src/settings-profiles";
import { PlanHeader } from "../src/plan-ui";
export default function Settings() {
  const session = useSession();
  const { colors } = useTheme();
  const display = useDisplayPreferences();
  const params = useLocalSearchParams<{ section?: string }>();
  const [section, setSection] = useState("menu");
  useEffect(() => {
    if (
      [
        "account",
        "profiles",
        "display",
        "region",
        "categories",
        "security",
        "data",
        "plan",
        "review",
        "notifications",
      ].includes(params.section ?? "")
    )
      setSection(params.section!);
  }, [params.section]);
  const [accountReady, setAccountReady] = useState(session.demo);
  const [regionReady, setRegionReady] = useState(session.demo);
  const [regional, setRegional] = useState({
    baseCurrency: "PHP",
    dateFormat: "MM/DD/YYYY",
    numberFormat: "1,234.56",
    timeZone: "Asia/Manila",
    locale: "en-PH",
    countryCode: null as string | null,
  });
  useEffect(() => {
    if (section !== "region" || session.demo) return;
    let active = true;
    setRegionReady(false);
    void session
      .request<{ regionalPreferences: typeof regional | null }>(
        "settings/regional",
      )
      .then((result) => {
        if (active) {
          if (result.regionalPreferences)
            setRegional(result.regionalPreferences);
          setRegionReady(true);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [section, session.demo, session.request]);
  const [account, setAccount] = useState({
    firstName: "",
    lastName: "",
    email: "",
  });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    if (session.demo)
      setAccount({
        firstName: "Alex",
        lastName: "Sample",
        email: "alex@example.test",
      });
    else
      void session
        .request<typeof account>("settings/account")
        .then((data) => {
          if (active) {
            setAccount({
              firstName: data.firstName ?? "",
              lastName: data.lastName ?? "",
              email: data.email,
            });
            setAccountReady(true);
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [session.demo, session.request]);
  const save = async () => {
    if (!accountReady || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (!session.demo)
        await session.request("settings/account", {
          method: "PATCH",
          body: JSON.stringify({
            firstName: account.firstName,
            lastName: account.lastName,
          }),
        });
      setMessage(
        session.demo
          ? "Sample changes stay in this preview."
          : "Account details saved.",
      );
      if (!session.demo) session.refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to save account details.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen>
      <PlanHeader
        title={
          section === "menu"
            ? "Settings"
            : section === "account"
              ? "Account"
              : section === "display"
                ? "Display"
                : section === "region"
                  ? "Region"
                  : section === "notifications"
                    ? "Notifications"
                    : section === "review"
                      ? "Review"
                      : section === "plan"
                        ? "Plan"
                        : section === "data"
                          ? "Data"
                          : section === "security"
                            ? "Security"
                            : section === "categories"
                              ? "Categories"
                              : "Profiles"
        }
        back={() => (section === "menu" ? router.back() : setSection("menu"))}
      />
      {section === "menu" ? (
        <View>
          {(
            [
              ["account", "Account", "person-outline"],
              ["profiles", "Profiles", "people-outline"],
              ["display", "Display", "desktop-outline"],
              ["data", "Data", "server-outline"],
              ["review", "Review", "document-text-outline"],
              ["categories", "Categories", "grid-outline"],
              ["notifications", "Notifications", "notifications-outline"],
              ["security", "Security", "shield-checkmark-outline"],
              ["region", "Region", "globe-outline"],
              ["plan", "Plan", "card-outline"],
            ] as const
          ).map(([key, label, icon]) => (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityLabel={label}
              onPress={() => {
                setSection(key);
                setMessage("");
              }}
              style={{
                minHeight: 52,
                flexDirection: "row",
                alignItems: "center",
                gap: 16,
                borderBottomWidth: key === "plan" ? 0 : 1,
                borderBottomColor: colors.line,
                paddingHorizontal: 8,
              }}
            >
              <Icon name={icon} size={26} />
              <Text style={{ fontSize: 13, color: colors.muted }}>{label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {section === "account" && !accountReady ? (
        <Body>Loading account details…</Body>
      ) : null}
      {section === "account" ? <SettingsPhoto /> : null}
      {section === "account" ? (
        <Card style={{ borderRadius: 16 }}>
          <Text style={{ color: colors.ink, fontFamily: "Poppins-SemiBold" }}>
            Account details
          </Text>
          <Field
            editable={accountReady && !busy}
            label="First name"
            maxLength={80}
            value={account.firstName}
            onChangeText={(firstName) =>
              setAccount((current) => ({ ...current, firstName }))
            }
          />
          <Field
            editable={accountReady && !busy}
            label="Last name"
            maxLength={80}
            value={account.lastName}
            onChangeText={(lastName) =>
              setAccount((current) => ({ ...current, lastName }))
            }
          />
          <Body>Email: {account.email}</Body>
          <Button
            title="Change password"
            secondary
            onPress={() => setSection("security")}
          />
          <Button
            title={busy ? "Saving…" : "Save changes"}
            disabled={busy || !accountReady}
            onPress={() => void save()}
          />
        </Card>
      ) : null}
      {section === "account" ? <SettingsConnections /> : null}
      {section === "display" ? (
        <Card style={{ borderRadius: 16 }}>
          <Text style={{ color: colors.ink, fontFamily: "Poppins-SemiBold" }}>
            Appearance
          </Text>
          <Body>Choose how Clover looks on this device.</Body>
          {(["system", "light", "dark"] as const).map((value) => (
            <Button
              key={value}
              title={`${value === "system" ? "Use device setting" : value === "light" ? "Light" : "Dark"}${display.appearance === value ? " · Selected" : ""}`}
              secondary={display.appearance !== value}
              onPress={() => {
                void display
                  .setAppearance(value)
                  .catch(() =>
                    setError("Unable to save appearance. Please try again."),
                  );
              }}
            />
          ))}
        </Card>
      ) : null}
      {section === "profiles" ? (
        <>
          <SettingsProfiles />
          <SettingsPreferences section="defaults" />
        </>
      ) : null}
      {section === "categories" ? <SettingsCategories /> : null}
      {section === "menu" ? (
        <Button
          title="Sync & Offline"
          secondary
          onPress={() => router.push("/offline")}
        />
      ) : null}
      {section === "security" ? <SettingsSecurity /> : null}
      {section === "data" ? (
        <>
          <SettingsData />
          <SettingsPreferences section="privacy" />
        </>
      ) : null}
      {section === "review" || section === "notifications" ? (
        <SettingsPreferences key={section} section={section} />
      ) : null}
      {section === "plan" ? <SettingsPlan /> : null}
      {section === "account" ? <SettingsData accountOnly /> : null}
      {section === "region" && !regionReady ? (
        <Body>Loading regional preferences…</Body>
      ) : null}
      {section === "region" && regionReady ? (
        <Card style={{ borderRadius: 16 }}>
          <Text style={{ color: colors.ink, fontFamily: "Poppins-SemiBold" }}>
            Regional preferences
          </Text>
          <Body>
            Display preferences do not convert existing financial records.
          </Body>
          <ChoiceField
            label="Default currency"
            value={regional.baseCurrency}
            options={(session.data?.currencyChoices ?? [{ code: regional.baseCurrency, name: regional.baseCurrency }]).map(option => ({ value: option.code, label: `${option.code} · ${option.name}` }))}
            onChange={baseCurrency => setRegional(current => ({ ...current, baseCurrency }))}
          />
          <ChoiceField
            label="Number format"
            value={regional.numberFormat}
            options={["1,234.56", "1.234,56"].map(value => ({ value, label: value }))}
            onChange={numberFormat => setRegional(current => ({ ...current, numberFormat }))}
          />
          <ChoiceField
            label="Date format"
            value={regional.dateFormat}
            options={["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD"].map(value => ({ value, label: value }))}
            onChange={dateFormat => setRegional(current => ({ ...current, dateFormat }))}
          />
          <ChoiceField
            label="Time zone"
            value={regional.timeZone}
            options={getTimeZoneOptions(regional.timeZone).map(value => ({ value, label: formatTimeZoneLabel(value) }))}
            onChange={timeZone => setRegional(current => ({ ...current, timeZone }))}
          />
          <Button
            title={busy ? "Saving…" : "Save preferences"}
            disabled={busy}
            onPress={() => {
              setBusy(true);
              setError("");
              void (
                session.demo
                  ? Promise.resolve()
                  : session.request("settings/regional", {
                      method: "PATCH",
                      body: JSON.stringify(regional),
                    })
              )
                .then(() => { setMessage("Regional preferences saved."); session.refresh(); })
                .catch((e) => setError(e.message))
                .finally(() => setBusy(false));
            }}
          />
        </Card>
      ) : null}
      {error ? <Notice>{error}</Notice> : null}
      {message ? <Body>{message}</Body> : null}
    </Screen>
  );
}
