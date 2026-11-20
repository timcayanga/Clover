import { useRef, useState, type ReactNode } from "react";
import { View } from "react-native";
import { supportsCardReplacement } from "../../shared/card-replacement";
import { CardReplacementPanel } from "./card-replacement-panel";
import type { AccountRecord } from "./account-editor";
import { AccountBrandLogo } from "./account-brand-logo";
import { ChoiceField } from "./transaction-entry";
import { useSession } from "./session";
import { Body, Button, Card, Notice } from "./ui";

export function AccountDetailActions({
  account,
  accounts,
  disabled = false,
  onChanged,
  onMerged,
  onDelete,
  children,
}: {
  account: AccountRecord;
  accounts: readonly AccountRecord[];
  disabled?: boolean;
  onChanged: (account: AccountRecord) => void;
  onMerged: () => void;
  onDelete: () => void;
  children?: ReactNode;
}) {
  const session = useSession();
  const [replacement, setReplacement] = useState(0),
    [merging, setMerging] = useState(false),
    [targetId, setTargetId] = useState(""),
    [review, setReview] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [replacing,setReplacing]=useState(false);
  const pending = useRef(false);
  const candidates = accounts.filter(
    (a) =>
      a.id !== account.id &&
      a.currency === account.currency &&
      a.type === account.type,
  );
  const target = candidates.find((a) => a.id === targetId);
  const locked = disabled || busy || replacing;
  async function merge() {
    if (!target || !review || session.demo || pending.current || disabled)
      return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await session.request<{ account: { id: string } }>(
        `accounts/${encodeURIComponent(account.id)}/merge?workspaceId=${encodeURIComponent(session.profileId)}`,
        {
          method: "POST",
          body: JSON.stringify({ targetAccountId: target.id, confirmed: true }),
        },
      );
      if (!result.account?.id)
        throw new Error("The merged account was not returned.");
      session.refresh();
      onMerged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to merge accounts.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  if (children) return <Card>{children}</Card>;
  return (
    <Card>
      <View style={{ flexDirection: "row", gap: 12 }}>
        {supportsCardReplacement(account.type) ? (
          <View style={{ flex: 1 }}>
            <Button
              title="Replace Card"
              secondary
              disabled={locked || session.demo}
              onPress={() => {
                setMerging(false);
                setReplacement((v) => v + 1);
              }}
            />
          </View>
        ) : null}
        {account.type !== "investment" ? (
          <View style={{ flex: 1 }}>
            <Button
              title="Merge Account"
              secondary
              disabled={locked || session.demo}
              onPress={() => {
                setReplacement(0);
                setMerging(true);
                setReview(false);
                setTargetId("");
                setError("");
              }}
            />
          </View>
        ) : null}
      </View>
      {merging ? (
        <View style={{ gap: 12 }}>
          {candidates.length ? (
            <>
              <ChoiceField
                label="Keep Account"
                value={targetId}
                disabled={locked || review}
                onChange={setTargetId}
                options={candidates.map((a) => ({
                  value: a.id,
                  label: a.name,
                  icon: <AccountBrandLogo account={a} size={24} />,
                }))}
              />
              {review && target ? (
                <Notice>
                  <Body>
                    Keep {target.name}. Move {account.name} and its linked
                    history into it. Balances are not added together. This cannot be undone.
                  </Body>
                  <Button
                    title={busy ? "Merging…" : "Confirm Merge"}
                    disabled={locked}
                    onPress={() => void merge()}
                  />
                </Notice>
              ) : (
                <Button
                  title="Review Merge"
                  disabled={locked || !target}
                  onPress={() => setReview(true)}
                />
              )}
            </>
          ) : (
            <Body>
              No other accounts of this type in {account.currency} are available
              in this Profile.
            </Body>
          )}
          <Button
            title="Cancel"
            secondary
            disabled={locked}
            onPress={() => {
              setMerging(false);
              setReview(false);
              setError("");
            }}
          />
        </View>
      ) : (
        <CardReplacementPanel
          compact
          onBusyChange={setReplacing}
          openSignal={replacement}
          account={account}
          onChanged={onChanged}
        />
      )}
      {error ? <Notice>{error}</Notice> : null}
      <View>
        <Button
          title={
            account.type === "investment" ? "Delete Asset" : "Delete Account"
          }
          danger
          disabled={locked}
          onPress={() => {
            setReplacement(0);
            setMerging(false);
            onDelete();
          }}
        />
      </View>
      {children}
    </Card>
  );
}
