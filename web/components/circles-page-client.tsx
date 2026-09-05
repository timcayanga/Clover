"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { CloverShell } from "@/components/clover-shell";
import { CirclesWorkspace } from "@/components/circles-workspace";
import { CollectionBack, useCollectionSelection } from "@/components/collection-navigation";
import type { CircleSummary, CirclesWorkspaceData } from "@/lib/circles";
import { isSplitBillBuiltInAvatarUrl } from "@/lib/split-bill-avatars";

const circleAvatarUrl = (circle: CircleSummary) =>
  circle.avatarUrl && !isSplitBillBuiltInAvatarUrl(circle.avatarUrl)
    ? circle.avatarUrl
    : "/clover-mark.svg";

type CircleRenameEvent = {
  circleId: string;
  name: string;
  revision: number;
};

function CircleTitleTabs({
  circles,
  activeCircleId,
  onChange,
  onRename,
}: {
  circles: CircleSummary[];
  activeCircleId: string;
  onChange: (circleId: string) => void;
  onRename: (circleId: string, name: string) => Promise<void>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef(new Map<string, HTMLDivElement>());
  const inputRef = useRef<HTMLInputElement>(null);
  const [editingCircleId, setEditingCircleId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [savingCircleId, setSavingCircleId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [indicator, setIndicator] = useState({ left: 0, width: 0, opacity: 0 });

  const editingCircle = useMemo(
    () => circles.find((circle) => circle.id === editingCircleId) ?? null,
    [circles, editingCircleId],
  );

  useLayoutEffect(() => {
    const container = containerRef.current;
    const activeTab = tabRefs.current.get(activeCircleId);
    if (!container || !activeTab) {
      setIndicator((current) => ({ ...current, opacity: 0 }));
      return;
    }
    const containerRect = container.getBoundingClientRect();
    const tabRect = activeTab.getBoundingClientRect();
    setIndicator({
      left: tabRect.left - containerRect.left,
      width: tabRect.width,
      opacity: 1,
    });
  }, [activeCircleId, circles, editingCircleId]);

  useEffect(() => {
    if (editingCircleId) inputRef.current?.select();
  }, [editingCircleId]);

  const beginEditing = (circle: CircleSummary) => {
    onChange(circle.id);
    if (circle.role !== "organizer") return;
    setEditingCircleId(circle.id);
    setDraftName(circle.name);
    setError(null);
  };

  const cancelEditing = () => {
    setEditingCircleId(null);
    setDraftName("");
    setError(null);
  };

  const saveName = async () => {
    if (!editingCircle || savingCircleId) return;
    const nextName = draftName.trim();
    if (!nextName) {
      setError("Enter a Circle name.");
      inputRef.current?.focus();
      return;
    }
    if (nextName === editingCircle.name) {
      cancelEditing();
      return;
    }

    setSavingCircleId(editingCircle.id);
    setError(null);
    try {
      await onRename(editingCircle.id, nextName);
      setEditingCircleId(null);
      setDraftName("");
    } catch (renameError) {
      setError(
        renameError instanceof Error
          ? renameError.message
          : "Unable to rename this Circle.",
      );
      inputRef.current?.focus();
    } finally {
      setSavingCircleId(null);
    }
  };

  const submitName = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void saveName();
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelEditing();
    }
  };

  return (
    <div className="circles-title-tabs-wrap">
      <div
        ref={containerRef}
        className="animated-tabs investments-tabs circles-title-tabs circles-title-tabs--editable"
        role="tablist"
        aria-label="Your Circles"
      >
        <span
          className="animated-tabs__indicator"
          style={{
            transform: `translateX(${indicator.left}px)`,
            width: indicator.width,
            opacity: indicator.opacity,
          }}
          aria-hidden="true"
        />
        {circles.map((circle) => {
          const isActive = circle.id === activeCircleId;
          const isEditing = circle.id === editingCircleId;
          return (
            <div
              key={circle.id}
              ref={(node) => {
                if (node) tabRefs.current.set(circle.id, node);
                else tabRefs.current.delete(circle.id);
              }}
              className={`animated-tabs__tab circles-title-tab${isActive ? " is-active" : ""}${isEditing ? " is-editing" : ""}`}
              role="presentation"
            >
              <button
                className="circles-title-tab__select"
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-label={`Open ${circle.name}`}
                onClick={() => onChange(circle.id)}
              >
                <img
                  className="circles-title-tab__avatar"
                  src={circleAvatarUrl(circle)}
                  alt=""
                />
              </button>
              {isEditing ? (
                <form
                  className="circles-title-tab__editor"
                  onSubmit={submitName}
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) {
                      void saveName();
                    }
                  }}
                >
                  <input
                    ref={inputRef}
                    value={draftName}
                    maxLength={100}
                    onChange={(event) => setDraftName(event.target.value)}
                    onKeyDown={handleInputKeyDown}
                    disabled={savingCircleId === circle.id}
                    aria-label="Circle name"
                  />
                  <button
                    type="submit"
                    className="circles-title-tab__edit-action"
                    disabled={savingCircleId === circle.id}
                    aria-label="Save Circle name"
                  >
                    {savingCircleId === circle.id ? "…" : "✓"}
                  </button>
                  <button
                    type="button"
                    className="circles-title-tab__edit-action"
                    onClick={cancelEditing}
                    disabled={savingCircleId === circle.id}
                    aria-label="Cancel renaming"
                  >
                    ×
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  className="circles-title-tab__name"
                  onClick={() => beginEditing(circle)}
                  title={
                    circle.role === "organizer"
                      ? "Rename Circle"
                      : "Only Circle organizers can rename it"
                  }
                >
                  {circle.name}
                </button>
              )}
              {circle.pendingCount > 0 ? (
                <span className="animated-tabs__badge">
                  {circle.pendingCount}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
      {error ? (
        <span className="circles-title-tabs__error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function CirclesPageClient({
  initialData,
}: {
  initialData: CirclesWorkspaceData;
}) {
  const [circles, setCircles] = useState(initialData.circles);
  const [requestedCircleId, setSelectedCircleId] = useCollectionSelection("circle");
  const selectedCircleId = circles.some((circle) => circle.id === requestedCircleId) ? requestedCircleId : null;
  const [createRequest, setCreateRequest] = useState(0);
  const [circleRename, setCircleRename] = useState<CircleRenameEvent | null>(
    null,
  );

  const renameCircle = async (circleId: string, name: string) => {
    const response = await fetch(`/api/circles/${circleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const payload = (await response.json()) as {
      circle?: { name?: string };
      error?: string;
    };
    if (!response.ok) {
      throw new Error(payload.error || "Unable to rename this Circle.");
    }
    const savedName = payload.circle?.name?.trim() || name;
    setCircles((current) =>
      current.map((circle) =>
        circle.id === circleId ? { ...circle, name: savedName } : circle,
      ),
    );
    setCircleRename((current) => ({
      circleId,
      name: savedName,
      revision: (current?.revision ?? 0) + 1,
    }));
  };

  return (
    <CloverShell
      active="circles"
      title="Circles"
      mobileLeadingAction={selectedCircleId ? <CollectionBack label="Circles" onClick={() => setSelectedCircleId(null)} /> : undefined}
      desktopTitleAction={selectedCircleId ? <CollectionBack label="All Circles" onClick={() => setSelectedCircleId(null)} /> : undefined}
      titleAddon={
        selectedCircleId ? (
          <div className="collection-title-controls">
          <CircleTitleTabs
            circles={circles.filter((circle) => circle.id === selectedCircleId)}
            activeCircleId={selectedCircleId}
            onChange={setSelectedCircleId}
            onRename={renameCircle}
          />
          {circles.length > 1 ? <select className="collection-switcher" aria-label="Switch Circle" value={selectedCircleId} onChange={(event) => setSelectedCircleId(event.target.value)}>
            {circles.map((circle) => <option key={circle.id} value={circle.id}>{circle.name}</option>)}
          </select> : null}
          </div>
        ) : null
      }
      actions={
        <button
          className="button button-primary button-small accounts-toolbar-add circles-topbar-action"
          type="button"
          onClick={() => setCreateRequest((current) => current + 1)}
          aria-label="Create Circle"
        >
          <span className="circles-topbar-action__icon button-icon" aria-hidden="true">
            <svg viewBox="0 0 20 20" fill="none">
              <path
                d="M10 4v12M4 10h12"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.8"
              />
            </svg>
          </span>
          <span className="circles-topbar-action__label">Create Circle</span>
        </button>
      }
    >
      <CirclesWorkspace
        initialData={initialData}
        selectedCircleId={selectedCircleId}
        onSelectedCircleChange={setSelectedCircleId}
        onCirclesChange={setCircles}
        createRequest={createRequest}
        circleRename={circleRename}
      />
    </CloverShell>
  );
}
