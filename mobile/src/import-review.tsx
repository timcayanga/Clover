import { useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import { useSession } from "./session";
import { Body, Card, Notice, Screen, money } from "./ui";
import { PlanAction, PlanHeader } from "./plan-ui";
type Review = {
  items: {
    id: string;
    date: string | null;
    amount: string | null;
    currency: string;
    merchantRaw: string | null;
    merchantClean: string | null;
    categoryName: string | null;
    confidence: number;
    categoryReason: string | null;
  }[];
  totalCount: number;
  accounts: { id: string; name: string; currency: string }[];
  file: {
    accountId: string | null;
    status: string;
    processingPhase: string | null;
  };
};
export function ImportReview({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const session = useSession();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Review | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [saved, setSaved] = useState(false);
  const [revision, setRevision] = useState(0);
  const lock = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    void session
      .request<Review>(
        `imports/${id}/review?workspaceId=${encodeURIComponent(session.profileId)}&page=${page}`,
      )
      .then((value) => {
        if (active) {
          setData(value);
          if (page === 1) setAccount(value.file.accountId);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [id, session.profileId, session.request, page, revision]);
  const save = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await session.request<{ status?: string }>(
        `imports/${id}/confirm?workspaceId=${encodeURIComponent(session.profileId)}`,
        { method: "POST", body: JSON.stringify({ accountId: account }) },
      );
      if (!alive.current) return;
      if (result.status === "staged") {
        setError(
          "Clover is still saving this file. Check its status before trying again.",
        );
      } else setSaved(true);
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      lock.current = false;
      if (alive.current) {
        setBusy(false);
        setConfirm(false);
      }
    }
  };
  return (
    <Screen>
      <PlanHeader
        title="Review Import"
        back={() => {
          if (!busy) onClose();
        }}
      />
      {error ? (
        <Notice>
          {error}
          <PlanAction
            title="Reload preview"
            onPress={() => setRevision((v) => v + 1)}
          />
        </Notice>
      ) : null}
      {saved ? (
        <Card>
          <Body>
            Your import has been saved. Check any flagged transactions before
            marking them reviewed.
          </Body>
          <PlanAction
            title="Review transactions"
            tone="primary"
            onPress={() =>
              router.replace({
                pathname: "/(tabs)/transactions",
                params: { review: "pending_review" },
              })
            }
          />
        </Card>
      ) : data ? (
        <>
          <Body>
            {data.totalCount} parsed records. Original file data is preserved.
            Low-confidence records remain in the review queue.
          </Body>
          {data.items.map((row) => (
            <Card key={row.id}>
              <Body muted={false}>
                {row.merchantClean || row.merchantRaw || "Untitled record"}
              </Body>
              <Body>
                {row.date?.slice(0, 10) || "Date needs review"} ·{" "}
                {row.amount === null
                  ? "Amount needs review"
                  : money(row.amount, row.currency)}
              </Body>
              <Body>
                {row.categoryName || "Uncategorized"} · Confidence{" "}
                {row.confidence}%
              </Body>
              {row.categoryReason ? <Body>{row.categoryReason}</Body> : null}
            </Card>
          ))}
          <Body>
            Page {page} of {Math.max(1, Math.ceil(data.totalCount / 30))}
          </Body>
          {page > 1 ? (
            <PlanAction
              title="Previous"
              onPress={() => setPage((v) => v - 1)}
            />
          ) : null}
          {page * 30 < data.totalCount ? (
            <PlanAction title="Next" onPress={() => setPage((v) => v + 1)} />
          ) : null}
          <Card>
            <Body muted={false}>Account</Body>
            <PlanAction
              title={`Use statement account${account === null ? " ✓" : ""}`}
              onPress={() => setAccount(null)}
            />
            {data.accounts.map((a) => (
              <PlanAction
                key={a.id}
                title={`${a.name} · ${a.currency}${account === a.id ? " ✓" : ""}`}
                onPress={() => setAccount(a.id)}
              />
            ))}
          </Card>
          {confirm ? (
            <Card>
              <Body>
                Save these parsed records to this Profile? Existing duplicate
                checks and review flags still apply. You can correct individual
                saved transactions in Transaction Details.
              </Body>
              <PlanAction
                title="Confirm import"
                tone="primary"
                disabled={busy}
                onPress={() => void save()}
              />
              <PlanAction
                title="Keep reviewing"
                disabled={busy}
                onPress={() => setConfirm(false)}
              />
            </Card>
          ) : (
            <PlanAction
              title="Review and confirm import"
              tone="primary"
              disabled={!data.totalCount}
              onPress={() => setConfirm(true)}
            />
          )}
        </>
      ) : (
        <Body>Loading parsed records…</Body>
      )}
    </Screen>
  );
}
