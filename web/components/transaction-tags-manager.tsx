"use client";

import { useEffect, useState } from "react";

type ManagedTag = {
  id: string;
  name: string;
  transactionCount: number;
  updatedAt: string;
};

export function TransactionTagsManager({ workspaceId }: { workspaceId: string }) {
  const [tags, setTags] = useState<ManagedTag[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/tags?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as { tags?: ManagedTag[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Unable to load tags.");
        if (!cancelled) {
          const nextTags = payload.tags ?? [];
          setTags(nextTags);
          setDrafts(Object.fromEntries(nextTags.map((tag) => [tag.id, tag.name])));
        }
      })
      .catch((reason) => !cancelled && setError(reason instanceof Error ? reason.message : "Unable to load tags."))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [workspaceId]);

  const renameTag = async (tag: ManagedTag) => {
    const name = (drafts[tag.id] ?? tag.name).trim();
    if (!name || name === tag.name) return;
    setBusyId(tag.id);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/tags", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: tag.id, name }),
      });
      const payload = (await response.json().catch(() => ({}))) as { tag?: ManagedTag; error?: string };
      if (!response.ok || !payload.tag) throw new Error(payload.error ?? "Unable to rename tag.");
      setTags((current) => current.map((entry) => entry.id === tag.id ? payload.tag! : entry));
      setDrafts((current) => ({ ...current, [tag.id]: payload.tag!.name }));
      setMessage(`Renamed ${tag.name} to ${payload.tag.name}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to rename tag.");
    } finally {
      setBusyId(null);
    }
  };

  const removeTag = async (tag: ManagedTag) => {
    const usage = `${tag.transactionCount} transaction${tag.transactionCount === 1 ? "" : "s"}`;
    if (!window.confirm(`Remove “${tag.name}” from ${usage}? The transactions themselves will not be deleted.`)) return;
    setBusyId(tag.id);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/tags", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: tag.id }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to remove tag.");
      setTags((current) => current.filter((entry) => entry.id !== tag.id));
      setMessage(`${tag.name} was removed. No transactions were deleted.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to remove tag.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="settings-section settings-section--swap" aria-labelledby="transaction-tags-title">
      <div className="settings-section__intro settings-section__intro--single">
        <div>
          <p className="eyebrow">Transactions</p>
          <h4 id="transaction-tags-title">Tags</h4>
          <p className="settings-helper">Tags are reusable labels for projects, people, reimbursements, trips, or any grouping that cuts across categories.</p>
        </div>
      </div>

      {message ? <p className="settings-save-status" role="status">{message}</p> : null}
      {error ? <p className="settings-save-status is-error" role="alert">{error}</p> : null}

      {loading ? (
        <article className="settings-action-card"><div><h5>Loading tags</h5><p>Finding labels used in this workspace.</p></div></article>
      ) : tags.length === 0 ? (
        <article className="settings-action-card">
          <div><h5>No tags yet</h5><p>Add a tag while creating or editing a transaction. It will appear here automatically.</p></div>
        </article>
      ) : (
        <div className="transaction-tags-manager__list">
          {tags.map((tag) => {
            const busy = busyId === tag.id;
            const changed = (drafts[tag.id] ?? tag.name).trim() !== tag.name;
            return (
              <article className="transaction-tags-manager__row" key={tag.id}>
                <label>
                  <span className="sr-only">Tag name</span>
                  <input
                    value={drafts[tag.id] ?? tag.name}
                    maxLength={40}
                    disabled={busy}
                    onChange={(event) => setDrafts((current) => ({ ...current, [tag.id]: event.target.value }))}
                    onKeyDown={(event) => { if (event.key === "Enter") void renameTag(tag); }}
                  />
                </label>
                <span className="transaction-tags-manager__usage">{tag.transactionCount} transaction{tag.transactionCount === 1 ? "" : "s"}</span>
                <div className="transaction-tags-manager__actions">
                  <button className="button button-secondary button-small" type="button" disabled={busy || !changed} onClick={() => void renameTag(tag)}>
                    {busy && changed ? "Saving…" : "Save"}
                  </button>
                  <button className="button button-danger button-small" type="button" disabled={busy} onClick={() => void removeTag(tag)}>Remove</button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
