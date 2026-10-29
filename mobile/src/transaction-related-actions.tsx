import {
  nextMonth,
  transactionRecurringInput,
} from "../../shared/transaction-recurring";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { useSession } from "./session";
import { Text } from "./app-text";
import { PersonAvatar } from "./person-avatar";
import {
  Body,
  Button,
  Card,
  Field,
  SectionTitle,
  Notice,
  Icon,
  useTheme,
} from "./ui";
import { ChoiceField } from "./transaction-entry";
import type { Transaction } from "./types";
type Related = {
  splitBill: {
    id: string;
    title: string;
    people: { name: string; avatarUrl?: string | null }[];
  } | null;
  circles: { id: string; name: string; avatarUrl?: string | null }[];
  recurring: { id: string; title: string; categoryName: string | null }[];
};
export function TransactionRelatedActions({
  transaction,
}: {
  transaction: Transaction;
}) {
  const session = useSession(),
    { colors } = useTheme(),
    [panel, setPanel] = useState<"circles" | "recurring" | null>(null),
    [circles, setCircles] = useState<{ id: string; name: string }[]>([]),
    [circleId, setCircleId] = useState(""),
    [dueDate, setDueDate] = useState(() => nextMonth(transaction.date)),
    [recurrence, setRecurrence] = useState("monthly"),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [loadingRelated, setLoadingRelated] = useState(!session.demo),
    [revision, setRevision] = useState(0),
    [related, setRelated] = useState<Related>({
      splitBill: transaction.splitBill
        ? { ...transaction.splitBill, people: [] }
        : null,
      circles: [],
      recurring: [],
    });
  const title = transaction.merchantClean || transaction.merchantRaw;
  useEffect(() => {
    let live = true;
    if (!session.demo) {
      setLoadingRelated(true);
      void session
        .request<Related>(
          `transactions/${transaction.id}/related?workspaceId=${encodeURIComponent(session.profileId)}`,
        )
        .then((r) => {
          if (live) setRelated(r);
        })
        .catch((e) => {
          if (live) setMessage(e.message);
        })
        .finally(() => {
          if (live) setLoadingRelated(false);
        });
    }
    return () => {
      live = false;
    };
  }, [
    transaction.id,
    revision,
    session.profileId,
    session.request,
    session.demo,
  ]);
  useEffect(() => {
    let live = true;
    if (panel === "circles" && !session.demo)
      void session
        .request<{ circles: { id: string; name: string }[] }>(
          `circles?workspaceId=${encodeURIComponent(session.profileId)}`,
        )
        .then((r) => {
          if (live) {
            setCircles(r.circles);
            setCircleId(r.circles[0]?.id ?? "");
          }
        })
        .catch((e) => setMessage(e.message));
    return () => {
      live = false;
    };
  }, [panel, session.profileId, session.demo, session.request]);
  const save = async () => {
    if (busy || !panel) return;
    setBusy(true);
    try {
      if (panel === "circles")
        await session.request(
          `circles/${circleId}/resources?workspaceId=${encodeURIComponent(session.profileId)}`,
          {
            method: "POST",
            body: JSON.stringify({
              action: "share_transaction",
              transactionId: transaction.id,
              visibility: "item",
            }),
          },
        );
      else
        await session.request(
          `recurring?workspaceId=${encodeURIComponent(session.profileId)}`,
          {
            method: "POST",
            body: JSON.stringify(
              transactionRecurringInput(
                transaction,
                title,
                dueDate,
                recurrence,
              ),
            ),
          },
        );
      setRevision((v) => v + 1);
      setPanel(null);
      setMessage("");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const link = (
    label: string,
    detail: string,
    press: () => void,
    icon: "people-outline" | "repeat-outline" | "receipt-outline",
    avatars?: { name: string; avatarUrl?: string | null }[],
  ) => (
    <Pressable
      key={label + detail}
      accessibilityRole="link"
      onPress={press}
      style={{ paddingVertical: 10, gap: 6 }}
    >
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <Icon name={icon} size={20} />
        <Text style={{ color: colors.teal, fontSize: 13 }}>{label}</Text>
        <Icon name="open-outline" size={16} />
      </View>
      <Body>{detail}</Body>
      {avatars?.length ? (
        <View style={{ flexDirection: "row", gap: 6 }}>
          {avatars.map((p) => (
            <PersonAvatar
              key={p.name}
              name={p.name}
              imageUrl={p.avatarUrl}
              size={28}
            />
          ))}
        </View>
      ) : null}
    </Pressable>
  );
  return (
    <Card>
      <SectionTitle>Add To</SectionTitle>
      {loadingRelated ? <Body>Loading Linked Items…</Body> : null}
      <View style={{ flexDirection: "row", gap: 6 }}>
        {!loadingRelated && !message && !related.splitBill ? (
          <Pressable
            style={{
              flex: 1,
              alignItems: "center",
              gap: 4,
              paddingVertical: 10,
            }}
            onPress={() =>
              router.push({
                pathname: "/split-bills",
                params: { transactionId: transaction.id },
              })
            }
          >
            <Icon name="receipt-outline" size={24} />
            <Text style={{ fontSize: 11, color: colors.teal }}>
              Split Bills
            </Text>
          </Pressable>
        ) : null}
        {!loadingRelated &&
        !message &&
        !related.circles.length &&
        transaction.type === "expense" ? (
          <Pressable
            style={{
              flex: 1,
              alignItems: "center",
              gap: 4,
              paddingVertical: 10,
            }}
            onPress={() => setPanel(panel === "circles" ? null : "circles")}
          >
            <Icon name="people-outline" size={24} />
            <Text style={{ fontSize: 11, color: colors.teal }}>Circles</Text>
          </Pressable>
        ) : null}
        {!loadingRelated && !message && !related.recurring.length ? (
          <Pressable
            style={{
              flex: 1,
              alignItems: "center",
              gap: 4,
              paddingVertical: 10,
            }}
            onPress={() => setPanel(panel === "recurring" ? null : "recurring")}
          >
            <Icon name="repeat-outline" size={24} />
            <Text style={{ fontSize: 11, color: colors.teal }}>Recurring</Text>
          </Pressable>
        ) : null}
      </View>
      {related.splitBill
        ? link(
            "Open in Split Bills",
            related.splitBill.title,
            () =>
              router.push({
                pathname: "/split-bills",
                params: { billId: related.splitBill!.id },
              }),
            "receipt-outline",
            related.splitBill.people,
          )
        : null}
      {related.circles.map((c) =>
        link(
          "Open in Circles",
          c.name,
          () =>
            router.push({ pathname: "/circles", params: { circleId: c.id } }),
          "people-outline",
        ),
      )}
      {related.recurring.map((r) =>
        link(
          "Open in Recurring",
          [r.title, r.categoryName].filter(Boolean).join(" · "),
          () =>
            router.push({
              pathname: "/(tabs)/recurring",
              params: { commitmentId: r.id },
            }),
          "repeat-outline",
        ),
      )}
      {panel === "circles" ? (
        <>
          <ChoiceField
            label="Circle"
            value={circleId}
            onChange={setCircleId}
            options={circles.map((c) => ({ value: c.id, label: c.name }))}
          />
          {!circles.length ? (
            <Button
              title="Create Circle"
              secondary
              onPress={() => router.push("/circles")}
            />
          ) : null}
        </>
      ) : null}
      {panel === "recurring" ? (
        <>
          <ChoiceField
            label="Time Period"
            value={recurrence}
            onChange={setRecurrence}
            options={[
              "once",
              "weekly",
              "biweekly",
              "monthly",
              "quarterly",
              "annual",
            ].map((v) => ({
              value: v,
              label: v[0].toUpperCase() + v.slice(1),
            }))}
          />
          <Field
            label="Next Due Date (YYYY-MM-DD)"
            value={dueDate}
            onChangeText={setDueDate}
          />
        </>
      ) : null}
      {panel ? (
        <Button
          title="Add"
          disabled={busy || (panel === "circles" && !circleId)}
          onPress={() => void save()}
        />
      ) : null}
      {message ? <Notice>{message}</Notice> : null}
    </Card>
  );
}
