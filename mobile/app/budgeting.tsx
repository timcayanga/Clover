import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { View } from "react-native";
import { useSession } from "../src/session";
import {
  Body,
  Button,
  Card,
  Heading,
  Notice,
  Screen,
  money,
  useTheme,
} from "../src/ui";
type Budget = {
  id: string;
  name: string;
  currency: string;
  actualAmount: number;
  targetAmount: number;
  progressPercent: number;
  statusLabel: string;
  periodLabel: string;
  isActive: boolean;
};
export default function Budgeting() {
  const session = useSession();
  const { colors } = useTheme();
  const [budgets, setBudgets] = useState<Budget[] | null>(null);
  const [error, setError] = useState("");
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setBudgets(null);
      setError("");
      const load = session.demo
        ? Promise.resolve({ budgets: [] })
        : session.request<{ budgets: Budget[] }>(
            `budgets?workspaceId=${encodeURIComponent(session.profileId)}`,
          );
      void load
        .then((r) => {
          if (active) setBudgets(r.budgets);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
      return () => {
        active = false;
      };
    }, [session.demo, session.profileId, session.request]),
  );
  return (
    <Screen>
      <Heading>Budgeting</Heading>
      {error ? <Notice>{error}</Notice> : null}
      {!budgets ? (
        <Body>Loading budgets…</Body>
      ) : budgets.length ? (
        budgets.map((b) => (
          <Card key={b.id}>
            <Heading>{b.name}</Heading>
            <Body>
              {b.statusLabel} · {b.isActive ? b.periodLabel : "Archived"}
            </Body>
            <Body>
              {money(String(b.actualAmount), b.currency)} of{" "}
              {money(String(b.targetAmount), b.currency)}
            </Body>
            <View
              style={{
                height: 10,
                backgroundColor: colors.line,
                borderRadius: 5,
              }}
            >
              <View
                style={{
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: colors.bright,
                  width: `${Math.max(0, Math.min(100, b.progressPercent))}%`,
                }}
              />
            </View>
            <Body>{Math.round(b.progressPercent)}% of target</Body>
          </Card>
        ))
      ) : (
        <Notice>No budgets in this Profile yet.</Notice>
      )}
    </Screen>
  );
}
