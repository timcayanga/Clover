import { useCallback, useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import { Linking, Text, View } from "react-native";
import { apiBase } from "../src/api";
import { useSession } from "../src/session";
import { Body, Button, Card, Notice, Screen, useTheme } from "../src/ui";
import { PlanHeader } from "../src/plan-ui";
type Feed = {
  notifications: {
    id: string;
    title: string;
    message: string;
    tone: string;
    productLabel: string;
    createdAt: string;
    href: string | null;
    ctaLabel: string | null;
  }[];
  count: number;
  readIds: string[];
};
export default function Notifications() {
  const session = useSession();
  const { colors } = useTheme();
  const [feed, setFeed] = useState<Feed>({
    notifications: [],
    count: 0,
    readIds: [],
  });
  const [filter, setFilter] = useState("All");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const profile = useRef(session.profileId);
  profile.current = session.profileId;
  const load = useCallback(async () => {
    const id = session.profileId;
    setLoading(true);
    setError("");
    try {
      const result = session.demo
        ? { notifications: [], count: 0, readIds: [] }
        : await session.request<Feed>(
            `notifications?workspaceId=${encodeURIComponent(id)}`,
          );
      if (id === profile.current) setFeed(result);
    } catch (e) {
      if (id === profile.current)
        setError(
          e instanceof Error ? e.message : "Unable to load notifications.",
        );
    } finally {
      if (id === profile.current) setLoading(false);
    }
  }, [session.profileId, session.demo, session.request]);
  useEffect(() => {
    setFeed({ notifications: [], count: 0, readIds: [] });
    setConfirm(false);
    void load();
  }, [load]);
  const update = async (ids: string[], action: "read" | "dismiss") => {
    if (busy) return;
    const id = session.profileId;
    setBusy(true);
    setError("");
    try {
      for (let i = 0; i < ids.length; i += 40) {
        const result = await session.request<Feed>(
          `notifications?workspaceId=${encodeURIComponent(id)}`,
          {
            method: "PATCH",
            body: JSON.stringify({ ids: ids.slice(i, i + 40), action }),
          },
        );
        if (id !== profile.current) break;
        setFeed(result);
      }
    } catch (e) {
      if (id === profile.current)
        setError(
          e instanceof Error ? e.message : "Unable to update notifications.",
        );
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };
  const visible = feed.notifications.filter(
    (item) =>
      filter === "All" ||
      (filter === "Unread"
        ? !feed.readIds.includes(item.id)
        : filter === "Needs attention"
          ? ["warning", "danger"].includes(item.tone)
          : !["warning", "danger"].includes(item.tone)),
  );
  return (
    <Screen>
      <PlanHeader title="Notifications" back={() => router.back()} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {["All", "Unread", "Needs attention", "Activity"].map((tab) => (
          <Button
            key={tab}
            title={tab}
            secondary={filter !== tab}
            onPress={() => setFilter(tab)}
          />
        ))}
      </View>
      {loading ? <Body>Loading notifications…</Body> : null}
      {error ? (
        <>
          <Notice>{error}</Notice>
          <Button title="Try again" secondary onPress={() => void load()} />
        </>
      ) : null}
      {!loading && !error && !visible.length ? (
        <Card>
          <Body>You’re all caught up.</Body>
          <Body>No notifications in this view.</Body>
        </Card>
      ) : null}
      {visible.map((item) => (
        <Card key={item.id}>
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            {item.productLabel}
          </Text>
          <Text
            accessibilityRole="header"
            style={{
              color: colors.ink,
              fontFamily: "Poppins-SemiBold",
              fontSize: 16,
            }}
          >
            {item.title}
          </Text>
          <Body>{item.message}</Body>
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            {new Date(item.createdAt).toLocaleString()}
          </Text>
          {item.href &&
          item.href.startsWith("/") &&
          !item.href.startsWith("//") ? (
            <Button
              title={item.ctaLabel ?? "View details"}
              secondary
              onPress={() => {
                void Linking.openURL(`${apiBase()}${item.href}`).catch(() =>
                  setError("Unable to open details."),
                );
              }}
            />
          ) : null}
          {!feed.readIds.includes(item.id) ? (
            <Button
              title="Mark as read"
              secondary
              disabled={busy}
              onPress={() => void update([item.id], "read")}
            />
          ) : null}
          <Button
            title="Dismiss"
            secondary
            disabled={busy}
            onPress={() => void update([item.id], "dismiss")}
          />
        </Card>
      ))}
      {feed.notifications.length ? (
        <>
          <Button
            title="Mark all as read"
            secondary
            disabled={busy}
            onPress={() =>
              void update(
                feed.notifications.map((item) => item.id),
                "read",
              )
            }
          />
          <Button
            title="Clear notifications"
            secondary
            disabled={busy}
            onPress={() => setConfirm(true)}
          />
        </>
      ) : null}
      {confirm ? (
        <Card>
          <Body>
            Clear these notifications? This removes them from your feed, without
            changing their underlying records.
          </Body>
          <Button
            title="Clear notifications"
            disabled={busy}
            onPress={() =>
              void update(
                feed.notifications.map((item) => item.id),
                "dismiss",
              )
            }
          />
          <Button
            title="Cancel"
            secondary
            disabled={busy}
            onPress={() => setConfirm(false)}
          />
        </Card>
      ) : null}
    </Screen>
  );
}
