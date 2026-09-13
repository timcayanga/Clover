import { useEffect, useState } from "react";
import { router } from "expo-router";
import { Text } from "react-native";
import { useSession } from "../src/session";
import { useDisplayPreferences } from "../src/display-preferences";
import { Body, Button, Card, Field, Notice, Screen, useTheme } from "../src/ui";
import { PlanHeader } from "../src/plan-ui";
export default function Settings() {
  const session = useSession();
  const { colors } = useTheme();
  const display = useDisplayPreferences();
  const [section, setSection] = useState("menu");
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
                  : "Profiles"
        }
        back={() => (section === "menu" ? router.back() : setSection("menu"))}
      />
      {section === "menu" ? (
        <Card style={{ borderRadius: 16 }}>
          {(
            [
              ["account", "Account"],
              ["profiles", "Profiles"],
              ["display", "Display"],
              ["region", "Region"],
            ] as const
          ).map(([key, label]) => (
            <Button
              key={key}
              title={label}
              secondary
              onPress={() => {
                setSection(key);
                setMessage("");
              }}
            />
          ))}
          <Button
            title="Notifications"
            secondary
            onPress={() => router.push("/notifications")}
          />
          <Button
            title="Plan"
            secondary
            onPress={() => router.push("/(tabs)/account")}
          />
        </Card>
      ) : null}
      {section === "account" && !accountReady ? (
        <Body>Loading account details…</Body>
      ) : null}
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
            title={busy ? "Saving…" : "Save changes"}
            disabled={busy || !accountReady}
            onPress={() => void save()}
          />
        </Card>
      ) : null}
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
        <Card style={{ borderRadius: 16 }}>
          <Body>Each Profile keeps its own financial records.</Body>
          {session.data?.profiles.map((profile) => (
            <Button
              key={profile.id}
              title={`${profile.name}${session.profileId === profile.id ? " · Selected" : ""}`}
              secondary={session.profileId !== profile.id}
              onPress={() => session.setProfileId(profile.id)}
            />
          ))}
        </Card>
      ) : null}
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
          <Field
            label="Default currency"
            value={regional.baseCurrency}
            maxLength={3}
            autoCapitalize="characters"
            onChangeText={(baseCurrency) =>
              setRegional((current) => ({
                ...current,
                baseCurrency: baseCurrency.toUpperCase(),
              }))
            }
          />
          <Field
            label="Time zone"
            value={regional.timeZone}
            onChangeText={(timeZone) =>
              setRegional((current) => ({ ...current, timeZone }))
            }
          />
          <Field
            label="Locale"
            value={regional.locale}
            onChangeText={(locale) =>
              setRegional((current) => ({ ...current, locale }))
            }
          />
          {["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD"].map((dateFormat) => (
            <Button
              key={dateFormat}
              title={dateFormat}
              secondary={dateFormat !== regional.dateFormat}
              onPress={() =>
                setRegional((current) => ({ ...current, dateFormat }))
              }
            />
          ))}
          {["1,234.56", "1.234,56"].map((numberFormat) => (
            <Button
              key={numberFormat}
              title={numberFormat}
              secondary={numberFormat !== regional.numberFormat}
              onPress={() =>
                setRegional((current) => ({ ...current, numberFormat }))
              }
            />
          ))}
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
                .then(() => setMessage("Regional preferences saved."))
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
