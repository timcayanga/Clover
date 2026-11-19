"use client";

import { useEffect, useState } from "react";
import { subscribeWorkspaceDataChanges } from "@/lib/workspace-data-sync";

type ImportSummary = { id: string; fileName: string; status: string; createdAt?: string; uploadedAt?: string; accountName?: string | null; transactionCount?: number };

export function RecentImportHistory({ workspaceId }: { workspaceId?: string }) {
  const [result, setResult] = useState<{ workspaceId?: string; rows: ImportSummary[] }>({ rows: [] });
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!workspaceId) return;
    const controller = new AbortController();
    let active = true;
    setError(false);
    void fetch(`/api/imports/recent?workspaceId=${encodeURIComponent(workspaceId)}`, { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error("history_unavailable");
        const data = await response.json();
        if (active) setResult({ workspaceId, rows: Array.isArray(data.importFiles) ? data.importFiles.slice(0, 10) : [] });
      }).catch(() => { if (active) setError(true); });
    return () => { active = false; controller.abort(); };
  }, [workspaceId, revision]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribeWorkspaceDataChanges(change => {
      if (!workspaceId || change.workspaceId !== workspaceId || !change.affected.includes("transactions")) return;
      clearTimeout(timer);
      timer = setTimeout(() => setRevision(value => value + 1), 300);
    });
    return () => { unsubscribe(); clearTimeout(timer); };
  }, [workspaceId]);
  const rows = result.workspaceId === workspaceId ? result.rows : [];
  if (!workspaceId || !rows.length && !error) return null;
  return <section className="recent-import-history" aria-label="Recent imports">
    <h4>Recent imports</h4>
    {error ? <p role="status">Recent imports could not load. You can still upload. <button type="button" onClick={() => setRevision(value => value + 1)}>Retry</button></p> : null}
    <ul>{rows.map(item => {
      const date = new Date(item.createdAt || item.uploadedAt || "");
      const count = item.transactionCount ?? 0;
      return <li key={item.id}><span title={item.fileName}>{item.fileName}</span><small>{[
        Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
        item.accountName || "Account not assigned",
        `${count} transaction${count === 1 ? "" : "s"}`,
        item.status.replace(/_/g, " ").replace(/\b\w/g, letter => letter.toUpperCase()),
      ].join(" · ")}</small></li>;
    })}</ul>
  </section>;
}
