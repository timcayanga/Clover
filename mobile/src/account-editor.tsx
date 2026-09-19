import { useEffect, useRef, useState } from "react";
import { Body, Button, Card, Field, Notice, Screen } from "./ui";
import { AssetSnapshot } from "./asset-snapshot";
import { AccountValuationHistory } from "./investment-views";
import { AccountHistory } from "./account-history";
import { AccountIdentity } from "./account-identity";
import { PlanAction, PlanHeader } from "./plan-ui";
import { Choices } from "./transaction-entry";
import { useSession } from "./session";
export const accountDisplayBalance = (account: AccountRecord) =>
  account.displayBalance === undefined
    ? account.balance
    : account.displayBalance;

export type AccountRecord = {
  id: string;
  name: string;
  institution: string | null;
  type: string;
  currency: string;
  balance: string | null;
  displayBalance?: string | null;
  lastFour?: string;
  source?: string;
  favorite?: boolean;
  transactionCount?: number;
  creditLimit?: string | null;
  creditPeriodStart?: string | null;
  creditPeriodEnd?: string | null;
  investmentSubtype?: string | null;
  investmentSymbol?: string | null;
  investmentQuantity?: string | null;
  investmentCostBasis?: string | null;
  investmentPrincipal?: string | null;
  investmentStartDate?: string | null;
  investmentMaturityDate?: string | null;
  investmentInterestRate?: string | null;
  investmentMaturityValue?: string | null;
};
const types = [
  "bank",
  "wallet",
  "credit_card",
  "cash",
  "investment",
  "loan",
  "mortgage",
  "line_of_credit",
  "receivable",
  "payable",
  "bnpl",
  "prepaid",
  "insurance",
  "other",
];
const labels: Record<string, string> = {
  name: "Account name",
  institution: "Institution",
  currency: "Currency",
  balance: "Opening balance",
  accountNumber: "Replace account number",
  creditLimit: "Credit limit",
  creditPeriodStart: "Statement period start",
  creditPeriodEnd: "Statement period end",
  investmentSubtype: "Asset type",
  investmentSymbol: "Symbol",
  investmentQuantity: "Quantity",
  investmentCostBasis: "Cost basis",
  investmentPrincipal: "Principal",
  investmentStartDate: "Start date",
  investmentMaturityDate: "Maturity date",
  investmentInterestRate: "Interest rate (%)",
  investmentMaturityValue: "Maturity value",
};
const dateFields = new Set([
  "creditPeriodStart",
  "creditPeriodEnd",
  "investmentStartDate",
  "investmentMaturityDate",
]);
const numericFields = new Set([
  "balance",
  "creditLimit",
  "investmentQuantity",
  "investmentCostBasis",
  "investmentPrincipal",
  "investmentInterestRate",
  "investmentMaturityValue",
]);
export function AccountEditor({
  initial,
  defaultType = "bank",
  defaultInstitution = "",
  defaultCurrency = "PHP",
  onClose,
  onSaved,
}: {
  initial: AccountRecord | null;
  defaultType?: string;
  defaultInstitution?: string;
  defaultCurrency?: string;
  onClose: () => void;
  onSaved: (record: AccountRecord | null) => void;
}) {
  const session = useSession();
  const [record, setRecord] = useState(initial);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [editing, setEditing] = useState(!initial);
  const [loading, setLoading] = useState(Boolean(initial && !session.demo));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({
    name: "",
    institution: defaultInstitution,
    type: defaultType,
    currency: defaultCurrency,
    balance: "",
  });
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    if (initial && !session.demo)
      void session
        .request<{ account: AccountRecord }>(
          `accounts/${initial.id}?workspaceId=${encodeURIComponent(session.profileId)}`,
        )
        .then((r) => {
          if (alive.current) setRecord(r.account);
        })
        .catch((e) => {
          if (alive.current) setError(e.message);
        })
        .finally(() => {
          if (alive.current) setLoading(false);
        });
    return () => {
      alive.current = false;
    };
  }, [
    initial?.id,
    session.demo,
    session.profileId,
    session.request,
    historyRevision,
  ]);
  const beginEdit = () => {
    const values: Record<string, string> = {};
    for (const field of [...Object.keys(labels), "type"]) {
      const value = record?.[field as keyof AccountRecord];
      values[field] = dateFields.has(field)
        ? String(value ?? "").slice(0, 10)
        : String(value ?? "");
    }
    // Displayed balance is reconciled; never treat it as an opening balance.
    values.balance = "";
    values.accountNumber = "";
    setDraft(values);
    setError("");
    setEditing(true);
  };
  const save = async () => {
    setError("");
    if (!draft.name.trim() || !/^[A-Z]{3}$/.test(draft.currency))
      return setError("Enter an account name and a three-letter currency.");
    const payload: Record<string, string | null> = {};
    const fields = record
      ? [...Object.keys(labels), "type"]
      : ["name", "institution", "type", "currency", "balance"];
    for (const field of fields) {
      const value = (draft[field] ?? "").trim();
      if (
        record &&
        (field === "balance" || field === "accountNumber") &&
        !value
      )
        continue;
      const previous = dateFields.has(field)
        ? String(record?.[field as keyof AccountRecord] ?? "").slice(0, 10)
        : String(record?.[field as keyof AccountRecord] ?? "");
      if (record && value === previous) continue;
      if (
        value &&
        numericFields.has(field) &&
        !/^-?\d{1,12}(\.\d{1,8})?$/.test(value)
      )
        return setError(`Enter a valid ${labels[field].toLowerCase()}.`);
      if (value && dateFields.has(field)) {
        const d = new Date(`${value}T00:00:00Z`);
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
          !Number.isFinite(+d) ||
          d.toISOString().slice(0, 10) !== value
        )
          return setError("Use a valid date in YYYY-MM-DD format.");
      }
      payload[field] =
        value || (field === "institution" && !record ? "" : null);
    }
    if (!Object.keys(payload).length) {
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      if (session.demo) {
        onSaved({
          ...(record ?? { id: `sample-${Date.now()}` }),
          ...draft,
          balance: draft.balance || record?.balance || null,
        } as AccountRecord);
        return;
      }
      const result = await session.request<{ account: AccountRecord }>(
        `accounts${record ? `/${record.id}` : ""}?workspaceId=${encodeURIComponent(session.profileId)}`,
        { method: record ? "PATCH" : "POST", body: JSON.stringify(payload) },
      );
      if (alive.current) onSaved(result.account);
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const remove = async () => {
    if (!record) return;
    setBusy(true);
    setError("");
    try {
      if (!session.demo)
        await session.request(
          `accounts/${record.id}?workspaceId=${encodeURIComponent(session.profileId)}`,
          { method: "DELETE" },
        );
      if (alive.current) onSaved(null);
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const extra = record
    ? [
        "accountNumber",
        ...(record.source === "manual" ? ["balance"] : []),
        ...(["credit_card", "line_of_credit"].includes(draft.type)
          ? ["creditLimit", "creditPeriodStart", "creditPeriodEnd"]
          : []),
        ...(draft.type === "investment"
          ? [
              "investmentSubtype",
              "investmentSymbol",
              "investmentQuantity",
              "investmentCostBasis",
              "investmentPrincipal",
              "investmentStartDate",
              "investmentMaturityDate",
              "investmentInterestRate",
              "investmentMaturityValue",
            ]
          : []),
      ]
    : ["balance"];
  return (
    <Screen>
      <PlanHeader
        titleInset={52}
        title={
          editing
            ? record
              ? "Edit Account"
              : "Add Account"
            : record?.type === "investment"
              ? "Asset Details"
              : "Account Details"
        }
        back={() => {
          if (busy) return;
          if (editing && record) {
            setEditing(false);
            setError("");
          } else onClose();
        }}
      />
      {error ? <Notice>{error}</Notice> : null}
      {loading ? (
        <Body>Loading account details…</Body>
      ) : editing ? (
        <Card>
          <Choices
            value={draft.type}
            options={types.map((value) => ({
              value,
              label: value.replaceAll("_", " "),
            }))}
            onChange={(type) => setDraft((d) => ({ ...d, type }))}
          />
          {["name", "institution", "currency", ...extra].map((field) => (
            <Field
              key={field}
              label={labels[field]}
              value={draft[field] ?? ""}
              placeholder={dateFields.has(field) ? "YYYY-MM-DD" : undefined}
              autoCapitalize={field === "currency" ? "characters" : "sentences"}
              keyboardType={
                numericFields.has(field) ? "decimal-pad" : "default"
              }
              onChangeText={(value) =>
                setDraft((d) => ({
                  ...d,
                  [field]: field === "currency" ? value.toUpperCase() : value,
                }))
              }
            />
          ))}
          {record?.source === "manual" ? (
            <Body>
              Leave opening balance blank to keep it unchanged. Saving a new
              opening balance changes the calculated account balance.
            </Body>
          ) : null}
          {!record ? (
            <Body>
              After adding the account, open Edit account for its credit or
              asset details.
            </Body>
          ) : null}
          <Button
            title={busy ? "Saving…" : "Save account"}
            disabled={busy}
            onPress={() => void save()}
          />
          <Button
            title="Cancel"
            secondary
            disabled={busy}
            onPress={() =>
              record ? (setEditing(false), setError("")) : onClose()
            }
          />
        </Card>
      ) : record ? (
        <Card>
          {record.type === "investment" ? (
            <AssetSnapshot account={record} onEdit={beginEdit} />
          ) : (
            <>
              <AccountIdentity account={record} onEdit={beginEdit} />
              {Object.keys(labels)
                .filter(
                  (k) =>
                    ![
                      "name",
                      "institution",
                      "currency",
                      "balance",
                      "accountNumber",
                    ].includes(k) && record[k as keyof AccountRecord] != null,
                )
                .map((k) => (
                  <Body key={k}>
                    {labels[k]}:{" "}
                    {String(record[k as keyof AccountRecord]).slice(
                      0,
                      dateFields.has(k) ? 10 : undefined,
                    )}
                  </Body>
                ))}
            </>
          )}
          {record.type === "investment" ? (
            <AccountValuationHistory
              key={`valuation-${record.id}`}
              accountId={record.id}
              currency={record.currency}
            />
          ) : null}
          <AccountHistory
            key={record.id}
            accountId={record.id}
            investment={record.type === "investment"}
            currency={record.currency}
            onChanged={() => {
              if (!session.demo) setHistoryRevision((v) => v + 1);
            }}
          />
          <PlanAction
            title="Delete account"
            tone="delete"
            onPress={() => setConfirmDelete(true)}
          />
          {confirmDelete ? (
            <Notice>
              <Body>
                Delete this account and its linked transactions and import
                artifacts? This cannot be undone.
              </Body>
              <PlanAction
                tone="delete"
                title="Confirm account deletion"
                disabled={busy}
                onPress={() => void remove()}
              />
              <Button
                title="Keep account"
                secondary
                disabled={busy}
                onPress={() => setConfirmDelete(false)}
              />
            </Notice>
          ) : null}
        </Card>
      ) : null}
      {!editing ? (
        <Button
          title="Close details"
          secondary
          disabled={busy}
          onPress={onClose}
        />
      ) : null}
    </Screen>
  );
}
