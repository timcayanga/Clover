import { Text } from "./app-text";
import { useEffect, useRef, useState } from "react";
import { Switch, View } from "react-native";
import {
  defaultAppPreferences,
  type AppPreferences,
} from "../../shared/app-preferences";
import { useSession } from "./session";
import { Body, Button, Card, Notice, useTheme } from "./ui";
export function SettingsPreferences({
  section,
}: {
  section: "review" | "notifications" | "privacy" | "defaults";
}) {
  const session = useSession();
  const { colors, styles } = useTheme();
  const [value, setValue] = useState<AppPreferences>(
    session.data?.preferences ?? defaultAppPreferences,
  );
  const [ready, setReady] = useState(session.demo);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    if (session.demo) return;
    void session
      .request<{ preferences: AppPreferences }>("settings/preferences")
      .then((result) => {
        if (active) {
          setValue(result.preferences);
          setReady(true);
        }
      })
      .catch(() => {
        if (active) setError("Unable to load preferences.");
      });
    return () => {
      active = false;
    };
  }, [session.demo, session.request]);
  const save = async () => {
    if (!ready || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (!session.demo) {
        const result = await session.request<{ preferences: AppPreferences }>(
          "settings/preferences",
          {
            method: "PATCH",
            body: JSON.stringify({ [section]: value[section] }),
          },
        );
        setValue(result.preferences);
        session.refresh();
      }
      setMessage(
        session.demo
          ? "Sample changes stay in this preview."
          : "Preferences saved.",
      );
    } catch {
      setError(
        "Unable to save preferences. Your previous settings are still in place.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const toggle = (
    group: "notifications" | "review" | "privacy",
    key: string,
    label: string,
    fixed = false,
  ) => (
    <View
      key={key}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        minHeight: 48,
      }}
    >
      <Text
        style={{
          flex: 1,
          color: colors.ink,
          fontFamily: "Poppins-Medium",
          fontSize: 13,
        }}
      >
        {label}
      </Text>
      <Switch
          thumbColor="#fff"
        accessibilityLabel={label}
        disabled={fixed || busy || !ready}
        value={Boolean(
          (value[group] as unknown as Record<string, unknown>)[key],
        )}
        trackColor={{ true: colors.teal, false: colors.line }}
        onValueChange={(checked) =>
          setValue((current) => ({
            ...current,
            [group]: { ...current[group], [key]: checked },
          }))
        }
      />
    </View>
  );
  return (
    <Card style={{ borderRadius: 16 }}>
      {!ready && !error ? <Body>Loading preferences…</Body> : null}
      {section === "notifications" ? (
        <>
          {toggle("notifications", "weeklySummary", "Weekly summary")}
          {toggle("notifications", "importComplete", "Import complete")}
          {toggle(
            "notifications",
            "transactionsNeedReview",
            "Transactions need review",
          )}
          {toggle(
            "notifications",
            "budgetWarnings",
            "Budget or plan-limit warnings",
          )}
          {toggle("notifications", "inApp", "In-app notifications")}
          {toggle("notifications", "email", "Email notifications")}
          <Body>
            Email delivery also depends on Clover’s enabled notification
            templates.
          </Body>
        </>
      ) : null}
      {section === "review" ? (
        <>
          <Body>Review flow</Body>
          {toggle(
            "review",
            "reviewLowConfidence",
            "Require manual review for low-confidence rows",
            true,
          )}
          <Body>
            Low-confidence financial changes always require your review.
          </Body>
          {toggle(
            "review",
            "openReviewAfterImport",
            "Open review automatically after import",
          )}
          {toggle(
            "review",
            "askBeforeDifferentProfile",
            "Ask before importing into a different Profile",
          )}
          <Body>When Clover suspects a duplicate import</Body>
          {(["ask", "skip"] as const).map((option) => (
            <Button
              key={option}
              title={
                option === "ask" ? "Ask me first" : "Skip suspected duplicates"
              }
              secondary={value.review.duplicateHandling !== option}
              disabled={!ready || busy}
              onPress={() =>
                setValue((current) => ({
                  ...current,
                  review: { ...current.review, duplicateHandling: option },
                }))
              }
            />
          ))}
        </>
      ) : null}
      {section === "privacy" ? (
        <>
          <Text accessibilityRole="header" style={styles.sectionTitle}>Privacy and Data Use</Text>
          {toggle(
            "privacy",
            "improveSuggestions",
            "Use my edits to improve suggestions",
          )}
          {toggle(
            "privacy",
            "adviserUsesContext",
            "Allow Adviser to use my financial context",
          )}
          {toggle(
            "privacy",
            "clearCachedStateOnSignOut",
            "Clear cached financial state on sign-out",
            true,
          )}
          <Body>
            Turning learning off stops new learning from edits; existing rules
            are preserved. Adviser is unavailable while financial context is
            off. Cached financial state is always cleared on sign-out.
          </Body>
        </>
      ) : null}
      {section === "defaults" ? (
        <>
          <Body>Workspace defaults</Body>
          <Body>Default landing page</Body>
          {(["dashboard", "transactions", "accounts", "reports"] as const).map((page) => (
            <Button
              key={page}
              title={
                page === "dashboard"
                  ? "Home"
                  : page === "transactions"
                    ? "Transactions"
                    : page === "reports" ? "Reports" : "Accounts"
              }
              secondary={value.defaults.defaultLandingPage !== page}
              disabled={!ready || busy}
              onPress={() =>
                setValue((current) => ({
                  ...current,
                  defaults: { ...current.defaults, defaultLandingPage: page },
                }))
              }
            />
          ))}
          <Body>Default import Profile</Body>
          <Button
            title="Current Profile"
            secondary={value.defaults.defaultImportProfileId !== null}
            disabled={!ready || busy}
            onPress={() =>
              setValue((current) => ({
                ...current,
                defaults: { ...current.defaults, defaultImportProfileId: null },
              }))
            }
          />
          {session.data?.profiles.map((profile) => (
            <Button
              key={profile.id}
              title={profile.name}
              disabled={!ready || busy}
              secondary={value.defaults.defaultImportProfileId !== profile.id}
              onPress={() =>
                setValue((current) => ({
                  ...current,
                  defaults: {
                    ...current.defaults,
                    defaultImportProfileId: profile.id,
                  },
                }))
              }
            />
          ))}
        </>
      ) : null}
      <Button
        title={busy ? "Saving…" : "Save preferences"}
        disabled={!ready || busy}
        onPress={() => void save()}
      />
      {message ? <Body>{message}</Body> : null}
      {error ? <Notice>{error}</Notice> : null}
    </Card>
  );
}
