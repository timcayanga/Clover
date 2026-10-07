import { ReportJumpTarget } from "./report-navigation";
import { useState } from "react";
import { View, Pressable } from "react-native";
import { useSession } from "./session";
import { Body, Card, Field, SectionTitle, money, Notice, useTheme } from "./ui";
import { PlanAction } from "./plan-ui";
import {
  useRecoveryEditor,
  type RecoveryRequest,
} from "../../shared/reports/recovery-editor";
import type { RecoveryReport } from "../../shared/reports/workspace";
export function ReportRecoveries({
  report,
  currency,
  workspaceId,
  onChanged,
}: {
  report: RecoveryReport;
  currency: string;
  workspaceId: string;
  onChanged?: () => void | Promise<unknown>;
}) {
  const session = useSession(),
    { colors } = useTheme();
  const [limit, setLimit] = useState(20),
    [notes, setNotes] = useState(false);
  const request: RecoveryRequest = async <T,>(query: string, body?: object) => {
    if (session.demo) throw Error("Sign in to link your own transactions.");
    return session.request<T>(
      `reports/recoveries?workspaceId=${encodeURIComponent(workspaceId)}&${query}`,
      body ? { method: "POST", body: JSON.stringify(body) } : undefined,
    );
  };
  const e = useRecoveryEditor(useState, request, currency, onChanged),
    format = (n: number) => money(String(n), currency);
  return (
    <ReportJumpTarget title="Refunds and reimbursements"><Card>
      <SectionTitle>Refunds and reimbursements</SectionTitle>
      {[
        ["Gross spending", report.gross],
        ["Linked refunds", report.refunds],
        ["Linked reimbursements", report.reimbursements],
        ["Personal cost", report.personalCost],
        ["Received for earlier expenses", report.receivedForEarlierExpenses],
      ].map(([label, value]) => (
        <Body key={label}>
          {label}: {format(Number(value))}
        </Body>
      ))}
      <PlanAction
        title="How personal cost is calculated"
        onPress={() => setNotes(!notes)}
      />
      {notes ? report.notes.map((n) => <Body key={n}>{n}</Body>) : null}
      {e.busy ? <Body>Updating payment links…</Body> : null}
      {e.error ? <Notice>{e.error}</Notice> : null}
      {e.notice ? <Body>{e.notice}</Body> : null}
      {!e.open ? (
        <PlanAction
          title="Link a payment"
          disabled={e.busy}
          onPress={() => void e.start()}
        />
      ) : (
        <View style={{ gap: 16 }}>
          <SectionTitle>Link a refund or reimbursement</SectionTitle>
          <Body>
            Choose an expense and money received in this Profile, using the same
            currency. The original transactions stay unchanged.
          </Body>
          <View style={{ gap: 8 }}>
            {(["refund", "reimbursement"] as const).map((kind) => (
              <Pressable
                key={kind}
                accessibilityRole="radio"
                accessibilityLabel={
                  kind === "refund" ? "Refund" : "Reimbursement"
                }
                accessibilityState={{
                  checked: e.kind === kind,
                  disabled: e.busy,
                }}
                aria-checked={e.kind === kind}
                disabled={e.busy}
                onPress={() => e.setKind(kind)}
                style={{
                  padding: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: e.kind === kind ? colors.teal : colors.line,
                }}
              >
                <Body>
                  {kind === "refund" ? "Refund" : "Reimbursement"}
                  {e.kind === kind ? " · Selected" : ""}
                </Body>
              </Pressable>
            ))}
          </View>
          {(["expense", "income"] as const).map((type) => {
            const selected = type === "expense" ? e.expense : e.incoming;
            return (
              <View key={type} style={{ gap: 12 }}>
                <SectionTitle>
                  {type === "expense" ? "Expense" : "Money received"}
                </SectionTitle>
                <Field
                  editable={!e.busy}
                  label="Search merchant or account"
                  value={e.queries[type]}
                  onChangeText={(v) => e.setQuery(type, v.slice(0, 120))}
                />
                <PlanAction
                  title="Search"
                  disabled={e.busy}
                  onPress={() => void e.load(type)}
                />
                {selected ? (
                  <Body>
                    Selected: {selected.name} · {selected.date} ·{" "}
                    {format(selected.available)} available
                  </Body>
                ) : null}
                {e.pages[type].candidates.map((c) => (
                  <Pressable
                    key={c.id}
                    accessibilityRole="radio"
                    accessibilityLabel={`${c.name}, ${c.date}, ${c.account}, ${format(c.available)} available`}
                    accessibilityState={{
                      checked: selected?.id === c.id,
                      disabled: e.busy,
                    }}
                    aria-checked={selected?.id === c.id}
                    disabled={e.busy}
                    onPress={() => e.choose(type, c)}
                    style={{
                      padding: 12,
                      borderWidth: 1,
                      borderRadius: 12,
                      borderColor:
                        selected?.id === c.id ? colors.teal : colors.line,
                    }}
                  >
                    <Body>{c.name}</Body>
                    <Body>
                      {c.date} · {c.account} · {format(c.available)} available
                    </Body>
                  </Pressable>
                ))}
                {!e.busy && !e.pages[type].candidates.length ? (
                  <Body>
                    No results. Search again or record the transaction first.
                  </Body>
                ) : null}
                {e.pages[type].nextOffset !== null ? (
                  <PlanAction
                    title="Load more"
                    disabled={e.busy}
                    onPress={() => void e.load(type, true)}
                  />
                ) : null}
              </View>
            );
          })}
          <Field
            editable={!e.busy}
            label={`Amount to link (${currency})`}
            value={e.amount}
            onChangeText={e.setAmount}
            keyboardType="decimal-pad"
          />
          <Body>
            Only the unlinked part of each transaction can be allocated.
          </Body>
          <PlanAction
            title={e.busy ? "Saving…" : "Confirm link"}
            disabled={!e.canSave}
            onPress={() => void e.save()}
          />
          <PlanAction title="Cancel" disabled={e.busy} onPress={e.cancel} />
        </View>
      )}
      {report.links.slice(0, limit).map((l) => (
        <View key={l.id} style={{ gap: 8, paddingVertical: 12 }}>
          <Body>
            {l.expenseName} · {l.expenseDate} → {l.incomingName} ·{" "}
            {l.receivedDate}
          </Body>
          <Body>
            {l.kind === "refund" ? "Refund" : "Reimbursement"} ·{" "}
            {format(l.amount)}
          </Body>
          {l.issue ? <Notice>{l.issue}</Notice> : null}
          <PlanAction
            title="Remove link"
            disabled={e.busy}
            onPress={() => void e.remove(l.id)}
          />
        </View>
      ))}
      {report.links.length > limit ? (
        <PlanAction
          title="Show more links"
          onPress={() => setLimit((n) => n + 20)}
        />
      ) : null}
    </Card></ReportJumpTarget>
  );
}
