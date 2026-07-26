"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import { CircleCreateDialog } from "@/components/circle-create-dialog";
import { AnimatedTabs } from "@/components/animated-tabs";
import { InfoTooltip } from "@/components/info-tooltip";
import {
  type CircleSummary,
  type CirclesWorkspaceData,
  type CircleTypeValue,
} from "@/lib/circles";
import { isSplitBillBuiltInAvatarUrl } from "@/lib/split-bill-avatars";

const tabs = [
  "overview",
  "expenses",
  "budget",
  "goals",
  "activity",
  "members",
] as const;
type CircleTab = (typeof tabs)[number];

type CirclesWorkspaceProps = {
  initialData: CirclesWorkspaceData;
  selectedCircleId: string | null;
  onSelectedCircleChange: (circleId: string | null) => void;
  onCirclesChange: (circles: CircleSummary[]) => void;
  createRequest: number;
};

const emptyStateCircleTypes = [
  ["🏠", "Household", "household"],
  ["💞", "Couple", "couple"],
  ["👨‍👩‍👧", "Family", "family"],
  ["✈️", "Travel", "travel"],
  ["🫶", "Barkada", "friends"],
  ["🎯", "Shared goal", "goal"],
] as const;

const CIRCLE_MARK_URL = "/clover-mark.svg";

const getCircleAvatarUrl = (circle: Pick<CircleSummary, "avatarUrl">) =>
  circle.avatarUrl && !isSplitBillBuiltInAvatarUrl(circle.avatarUrl)
    ? circle.avatarUrl
    : CIRCLE_MARK_URL;

const createCircleAvatarDataUrl = async (file: File) => {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose an image file for the Circle photo.");
  }
  if (file.size > 8_000_000) {
    throw new Error("Choose an image smaller than 8 MB.");
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    const scale = Math.min(1, 320 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Unable to prepare this Circle photo.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.86, 0.72, 0.58]) {
      const dataUrl = canvas.toDataURL("image/webp", quality);
      if (dataUrl.length <= 180_000) return dataUrl;
    }
    throw new Error("This image is still too large. Try a simpler or smaller photo.");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const formatMoney = (amount: number, currency: string) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);

const formatDate = (value: string | null) =>
  value
    ? new Date(value).toLocaleDateString("en-PH", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "No date set";

const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] ?? "?"}${parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : ""}`.toUpperCase();
};

export function CirclesWorkspace({
  initialData,
  selectedCircleId,
  onSelectedCircleChange,
  onCirclesChange,
  createRequest,
}: CirclesWorkspaceProps) {
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [data, setData] = useState(initialData);
  const [activeTab, setActiveTab] = useState<CircleTab>("overview");
  const [showCreate, setShowCreate] = useState(false);
  const [createInitialType, setCreateInitialType] =
    useState<CircleTypeValue | null>(null);
  const [isLoadingCreatedCircle, setIsLoadingCreatedCircle] = useState(false);
  const [openForm, setOpenForm] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [latestInviteUrl, setLatestInviteUrl] = useState<string | null>(null);

  const selectedCircle = useMemo(
    () =>
      data.circles.find((circle) => circle.id === selectedCircleId) ??
      data.circles[0] ??
      null,
    [data.circles, selectedCircleId],
  );

  useEffect(() => {
    if (createRequest > 0) {
      setCreateInitialType(null);
      setShowCreate(true);
    }
  }, [createRequest]);

  useEffect(() => {
    onCirclesChange(data.circles);
  }, [data.circles, onCirclesChange]);

  useEffect(() => {
    setActiveTab("overview");
    setOpenForm(null);
    setMessage(null);
  }, [selectedCircleId]);

  const openCreate = (type: CircleTypeValue | null = null) => {
    setCreateInitialType(type);
    setShowCreate(true);
  };

  const closeCreate = () => {
    setShowCreate(false);
    setCreateInitialType(null);
  };

  const updateCircleAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file || !selectedCircle) return;
    setIsSaving(true);
    setMessage("Updating Circle photo...");
    try {
      const avatarUrl = await createCircleAvatarDataUrl(file);
      const response = await fetch(`/api/circles/${selectedCircle.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarUrl }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Unable to update the Circle photo.");
      }
      setData((current) => ({
        ...current,
        circles: current.circles.map((circle) =>
          circle.id === selectedCircle.id ? { ...circle, avatarUrl } : circle,
        ),
      }));
      setMessage("Circle photo updated.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to update the Circle photo.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const selectTab = (tab: CircleTab) => {
    setActiveTab(tab);
    setOpenForm(null);
    setMessage(null);
  };

  const refresh = async (preferredCircleId?: string) => {
    const response = await fetch("/api/circles", { cache: "no-store" });
    const payload = (await response.json()) as CirclesWorkspaceData & {
      error?: string;
    };
    if (!response.ok)
      throw new Error(payload.error || "Unable to refresh Circles.");
    setData(payload);
    const nextId = preferredCircleId || selectedCircleId;
    if (nextId && payload.circles.some((circle) => circle.id === nextId))
      onSelectedCircleChange(nextId);
    else onSelectedCircleChange(payload.circles[0]?.id ?? null);
  };

  const runResource = async (
    payload: Record<string, unknown>,
    successMessage: string,
  ) => {
    if (!selectedCircle) return;
    setIsSaving(true);
    setMessage("Saving...");
    try {
      const response = await fetch(
        `/api/circles/${selectedCircle.id}/resources`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(result.error || "Unable to save this change.");
      await refresh(selectedCircle.id);
      setOpenForm(null);
      setMessage(successMessage);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to save this change.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const submitBudget = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void runResource(
      {
        action: "create_budget",
        name: form.get("name"),
        targetAmount: form.get("targetAmount"),
        cadence: form.get("cadence"),
        categoryName: form.get("categoryName") || null,
        currency: selectedCircle?.currency,
      },
      "Shared budget created.",
    );
  };

  const submitGoal = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const targetDate = String(form.get("targetDate") || "");
    void runResource(
      {
        action: "create_goal",
        name: form.get("name"),
        purpose: form.get("purpose") || null,
        targetAmount: form.get("targetAmount"),
        startingAmount: form.get("startingAmount") || 0,
        targetDate: targetDate
          ? new Date(`${targetDate}T00:00:00`).toISOString()
          : null,
        currency: selectedCircle?.currency,
      },
      "Shared goal created.",
    );
  };

  const submitContribution = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void runResource(
      {
        action: "add_contribution",
        amount: form.get("amount"),
        memberId: form.get("memberId") || null,
        goalId: form.get("goalId") || null,
        note: form.get("note") || null,
        currency: selectedCircle?.currency,
      },
      "Contribution recorded.",
    );
  };

  const submitCommitment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nextDueDate = String(form.get("nextDueDate") || "");
    void runResource(
      {
        action: "create_commitment",
        title: form.get("title"),
        amount: form.get("amount") || null,
        recurrence: form.get("recurrence"),
        assignedMemberId: form.get("assignedMemberId") || null,
        nextDueDate: nextDueDate
          ? new Date(`${nextDueDate}T00:00:00`).toISOString()
          : null,
        currency: selectedCircle?.currency,
      },
      "Shared commitment created.",
    );
  };

  const submitSharedTransaction = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void runResource(
      {
        action: "share_transaction",
        transactionId: form.get("transactionId"),
        visibility: form.get("visibility"),
        sharedAmount: form.get("sharedAmount") || null,
        sharedTitle: form.get("sharedTitle") || null,
      },
      "Transaction shared with the Circle.",
    );
  };

  const submitInvestment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void runResource(
      {
        action: "share_investment",
        accountId: form.get("accountId"),
        visibility: form.get("visibility"),
        includeHoldings: form.get("includeHoldings") === "on",
      },
      "Investment summary shared.",
    );
  };

  const submitInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedCircle) return;
    const form = new FormData(event.currentTarget);
    setIsSaving(true);
    setMessage("Creating a secure invitation...");
    try {
      const response = await fetch(
        `/api/circles/${selectedCircle.id}/invitations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            displayName: form.get("displayName") || null,
            email: form.get("email") || null,
            role: form.get("role"),
          }),
        },
      );
      const payload = (await response.json()) as {
        invitation?: { shareUrl: string; emailSent?: boolean };
        error?: string;
      };
      if (!response.ok || !payload.invitation)
        throw new Error(payload.error || "Unable to create this invitation.");
      const absoluteUrl = `${window.location.origin}${payload.invitation.shareUrl}`;
      setLatestInviteUrl(absoluteUrl);
      let copied = false;
      try {
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(absoluteUrl);
          copied = true;
        }
      } catch {
        // The invitation is still valid when browser clipboard permission is denied.
      }
      await refresh(selectedCircle.id);
      setMessage(
        payload.invitation.emailSent
          ? copied
            ? "Invitation emailed and link copied. It expires in 14 days."
            : "Invitation emailed. The secure link expires in 14 days."
          : copied
            ? "Invitation link copied. Email delivery was unavailable, so you can share the link directly."
            : "Invitation created. Copy the secure link below to share it directly.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to create this invitation.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const updateMemberRole = (memberId: string, role: string) => {
    void runResource(
      {
        action: "update_member",
        id: memberId,
        role,
      },
      "Member role updated.",
    );
  };

  const removeMember = (memberId: string, displayName: string) => {
    if (!window.confirm(`Remove ${displayName} from this Circle?`)) return;
    void runResource(
      { action: "update_member", id: memberId, status: "removed" },
      `${displayName} was removed from the Circle.`,
    );
  };

  const manageInvitation = async (
    invitationId: string,
    action: "resend" | "revoke" | "copy",
    shareUrl: string,
  ) => {
    if (!selectedCircle) return;
    const absoluteUrl = `${window.location.origin}${shareUrl}`;
    if (action === "copy") {
      try {
        await navigator.clipboard.writeText(absoluteUrl);
        setMessage("Invitation link copied.");
      } catch {
        setLatestInviteUrl(absoluteUrl);
        setMessage("Copy the invitation link shown below.");
      }
      return;
    }
    if (
      action === "revoke" &&
      !window.confirm("Revoke this invitation? Its link will stop working.")
    ) {
      return;
    }
    setIsSaving(true);
    setMessage(action === "resend" ? "Resending invitation..." : "Revoking invitation...");
    try {
      const response = await fetch(
        `/api/circles/${selectedCircle.id}/invitations/${invitationId}`,
        { method: action === "resend" ? "PATCH" : "DELETE" },
      );
      const payload = (await response.json()) as {
        error?: string;
        invitation?: { shareUrl: string; emailSent: boolean };
      };
      if (!response.ok) {
        throw new Error(payload.error || `Unable to ${action} this invitation.`);
      }
      if (payload.invitation?.shareUrl) {
        setLatestInviteUrl(
          `${window.location.origin}${payload.invitation.shareUrl}`,
        );
      }
      await refresh(selectedCircle.id);
      setMessage(
        action === "resend"
          ? payload.invitation?.emailSent
            ? "Invitation resent with a fresh 14-day link."
            : "A fresh link was created. Copy it below to share directly."
          : "Invitation revoked.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : `Unable to ${action} this invitation.`,
      );
    } finally {
      setIsSaving(false);
    }
  };

  const deleteCircle = async () => {
    if (
      !selectedCircle ||
      !window.confirm(
        `Delete ${selectedCircle.name}? Circle budgets, goals, commitments, invitations, and activity will be permanently deleted. Existing personal transactions and Split Bills will remain.`,
      )
    )
      return;
    setIsSaving(true);
    try {
      const response = await fetch(`/api/circles/${selectedCircle.id}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(payload.error || "Unable to delete this Circle.");
      await refresh();
      setMessage("Circle deleted.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to delete this Circle.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="circles-page">
      {data.circles.length === 0 ? (
        <section className="circles-empty panel glass">
          <img
            src="/assets/3d%20icons/menu/profiles.png"
            alt=""
            width={120}
            height={120}
          />
          <p className="eyebrow">Your first Circle</p>
          <h2>Manage money together, without sharing everything.</h2>
          <div className="circles-empty__chips" aria-label="Circle ideas">
            {emptyStateCircleTypes.map(([emoji, label, type]) => (
              <button
                key={type}
                type="button"
                onClick={() => openCreate(type)}
              >
                <span aria-hidden="true">{emoji}</span> {label}
              </button>
            ))}
          </div>
          {isLoadingCreatedCircle ? (
            <p className="circles-form-message" role="status">
              Circle created. Opening it now...
            </p>
          ) : null}
          <button
            className="button button-primary"
            type="button"
            onClick={() => openCreate()}
            disabled={isLoadingCreatedCircle}
          >
            Create your first Circle
          </button>
        </section>
      ) : (
        <div className="circles-layout">
          {selectedCircle ? (
            <main className="circles-workspace">
              <AnimatedTabs
                className="investments-tabs circles-section-tabs"
                activeKey={activeTab}
                onChange={(key) => selectTab(key as CircleTab)}
                tabs={tabs.map((tab) => ({
                  key: tab,
                  label:
                    tab === "budget"
                      ? "Budgeting"
                      : tab[0].toUpperCase() + tab.slice(1),
                  ariaLabel:
                    tab === "budget"
                      ? "Budgeting"
                      : tab[0].toUpperCase() + tab.slice(1),
                }))}
              />
              <input
                ref={avatarInputRef}
                className="sr-only"
                type="file"
                accept="image/*"
                aria-label="Choose a Circle photo"
                onChange={(event) => void updateCircleAvatar(event)}
              />

              {message ? (
                <div className="circles-message" role="status">
                  {message}
                </div>
              ) : null}

              {activeTab === "overview" ? (
                <CircleOverview
                  circle={selectedCircle}
                  openForm={openForm}
                  setOpenForm={setOpenForm}
                  submitCommitment={submitCommitment}
                  isSaving={isSaving}
                />
              ) : null}
              {activeTab === "expenses" ? (
                <CircleExpenses
                  circle={selectedCircle}
                  transactions={data.personalTransactions}
                  openForm={openForm}
                  setOpenForm={setOpenForm}
                  submitSharedTransaction={submitSharedTransaction}
                  runResource={runResource}
                  isSaving={isSaving}
                />
              ) : null}
              {activeTab === "budget" ? (
                <CircleBudgets
                  circle={selectedCircle}
                  openForm={openForm}
                  setOpenForm={setOpenForm}
                  submitBudget={submitBudget}
                  runResource={runResource}
                  isSaving={isSaving}
                />
              ) : null}
              {activeTab === "goals" ? (
                <CircleGoals
                  circle={selectedCircle}
                  investmentAccounts={data.investmentAccounts}
                  openForm={openForm}
                  setOpenForm={setOpenForm}
                  submitGoal={submitGoal}
                  submitContribution={submitContribution}
                  submitInvestment={submitInvestment}
                  runResource={runResource}
                  isSaving={isSaving}
                />
              ) : null}
              {activeTab === "activity" ? (
                <CircleActivity circle={selectedCircle} />
              ) : null}
              {activeTab === "members" ? (
                <CircleMembers
                  circle={selectedCircle}
                  latestInviteUrl={latestInviteUrl}
                  submitInvite={submitInvite}
                  updateMemberRole={updateMemberRole}
                  removeMember={removeMember}
                  manageInvitation={manageInvitation}
                  deleteCircle={deleteCircle}
                  onChangeCirclePhoto={() => avatarInputRef.current?.click()}
                  isSaving={isSaving}
                />
              ) : null}
            </main>
          ) : null}
        </div>
      )}

      <CircleCreateDialog
        open={showCreate}
        initialType={createInitialType}
        onClose={closeCreate}
        onCreated={(circleId) => {
          setIsLoadingCreatedCircle(true);
          setMessage("Circle created. Opening it now...");
          void refresh(circleId)
            .then(() => {
              onSelectedCircleChange(circleId);
              setActiveTab("overview");
              setMessage(
                "Circle created. Your personal finances are still private.",
              );
            })
            .catch((error: unknown) => {
              setMessage(
                error instanceof Error
                  ? error.message
                  : "Circle created. Refresh the page to open it.",
              );
            })
            .finally(() => setIsLoadingCreatedCircle(false));
        }}
      />
    </section>
  );
}

type SharedPanelProps = {
  circle: CircleSummary;
  openForm: string | null;
  setOpenForm: (value: string | null) => void;
  isSaving: boolean;
};

function CircleEmptyState({
  image,
  title,
  children,
}: {
  image: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="circles-soft-empty circles-soft-empty--illustrated">
      <img src={image} alt="" width={92} height={92} />
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}

function CircleOverview({
  circle,
  openForm,
  setOpenForm,
  submitCommitment,
  isSaving,
}: SharedPanelProps & {
  submitCommitment: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const upcoming = circle.commitments
    .filter((entry) => entry.isActive)
    .slice(0, 4);
  return (
    <div className="circles-panel-stack">
      <div className="circles-metric-grid">
        <article className="accounts-overview-card summary-aligned-card panel glass">
          <InfoTooltip
            className="summary-card-info"
            label="Total expenses shared with this Circle during the current month."
          />
          <p className="eyebrow">Shared expenses this month</p>
          <strong className="accounts-overview-card__amount is-neutral">
            {formatMoney(circle.expenseTotalThisMonth, circle.currency)}
          </strong>
        </article>
        <article className="accounts-overview-card summary-aligned-card panel glass">
          <InfoTooltip
            className="summary-card-info"
            label="Total contributions recorded for this Circle during the current month."
          />
          <p className="eyebrow">Contributions this month</p>
          <strong className="accounts-overview-card__amount is-neutral">
            {formatMoney(circle.contributionTotalThisMonth, circle.currency)}
          </strong>
        </article>
        <article className="accounts-overview-card summary-aligned-card panel glass">
          <InfoTooltip
            className="summary-card-info"
            label="The number of shared Circle goals currently marked active."
          />
          <p className="eyebrow">Active goals</p>
          <strong className="accounts-overview-card__amount is-neutral">
            {circle.goals.filter((goal) => goal.status === "active").length}
          </strong>
        </article>
        <article className="accounts-overview-card summary-aligned-card panel glass">
          <InfoTooltip
            className="summary-card-info"
            label="Active shared commitments currently surfaced as coming up for this Circle."
          />
          <p className="eyebrow">Upcoming commitments</p>
          <strong className="accounts-overview-card__amount is-neutral">{upcoming.length}</strong>
        </article>
      </div>
      <section className="circles-section panel glass">
        <div className="circles-section__head">
          <div>
            <p className="eyebrow">Circle pulse</p>
            <h3>What needs attention</h3>
          </div>
        </div>
        <div className="circles-insight-grid">
          {circle.insights.map((insight) => (
            <article
              key={insight.id}
              className={`circles-insight circles-insight--${insight.tone}`}
            >
              <strong>{insight.title}</strong>
              <p>{insight.detail}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="circles-section panel glass">
        <div className="circles-section__head">
          <div>
            <p className="eyebrow">Shared commitments</p>
            <h3>Upcoming responsibilities</h3>
          </div>
          <button
            className="button button-secondary button-small"
            type="button"
            onClick={() =>
              setOpenForm(openForm === "commitment" ? null : "commitment")
            }
          >
            Add commitment
          </button>
        </div>
        {openForm === "commitment" ? (
          <form className="circles-inline-form" onSubmit={submitCommitment}>
            <label>
              <span>Commitment</span>
              <input name="title" required placeholder="e.g. Meralco bill" />
            </label>
            <label>
              <span>Amount</span>
              <input name="amount" type="number" min="0.01" step="0.01" />
            </label>
            <label>
              <span>Repeats</span>
              <select name="recurrence" defaultValue="monthly">
                <option value="once">Once</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annual">Annual</option>
              </select>
            </label>
            <label>
              <span>Next due date</span>
              <input name="nextDueDate" type="date" />
            </label>
            <label>
              <span>Assigned to</span>
              <select name="assignedMemberId">
                <option value="">Anyone</option>
                {circle.members
                  .filter((member) => member.status === "active")
                  .map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.displayName}
                    </option>
                  ))}
              </select>
            </label>
            <button
              className="button button-primary"
              type="submit"
              disabled={isSaving}
            >
              Save commitment
            </button>
          </form>
        ) : null}
        <div className="circles-record-list">
          {upcoming.length ? (
            upcoming.map((entry) => (
              <article key={entry.id}>
                <div>
                  <strong>{entry.title}</strong>
                  <span>
                    {entry.assignedMemberName || "Anyone"} · {entry.recurrence}{" "}
                    · {formatDate(entry.nextDueDate)}
                  </span>
                </div>
                <strong>
                  {entry.amount === null
                    ? "Amount not set"
                    : formatMoney(entry.amount, entry.currency)}
                </strong>
              </article>
            ))
          ) : (
            <CircleEmptyState
              image="/assets/3d%20icons/menu/recurring.png"
              title="No commitments yet"
            >
              Add rent, utilities, tuition, family support, or another recurring
              responsibility.
            </CircleEmptyState>
          )}
        </div>
      </section>
    </div>
  );
}

function CircleExpenses({
  circle,
  transactions,
  openForm,
  setOpenForm,
  submitSharedTransaction,
  runResource,
  isSaving,
}: SharedPanelProps & {
  transactions: CirclesWorkspaceData["personalTransactions"];
  submitSharedTransaction: (event: FormEvent<HTMLFormElement>) => void;
  runResource: (
    payload: Record<string, unknown>,
    message: string,
  ) => Promise<void>;
}) {
  return (
    <section className="circles-section panel glass">
      <div className="circles-section__head">
        <div>
          <p className="eyebrow">Shared expenses</p>
          <h3>Expenses and settlements</h3>
          <p>
            Split bills are Circle-owned. Personal transactions remain yours and
            are only referenced when shared.
          </p>
        </div>
        <div className="circles-section__actions">
          <button
            className="button button-secondary button-small"
            type="button"
            onClick={() =>
              setOpenForm(
                openForm === "share-transaction" ? null : "share-transaction",
              )
            }
          >
            Share transaction
          </button>
          <Link
            className="button button-primary button-small"
            href={
              circle.splitBillGroupId
                ? `/split-bill?group=${encodeURIComponent(circle.splitBillGroupId)}`
                : "/split-bill"
            }
            prefetch={false}
          >
            Open Split Bills
          </Link>
        </div>
      </div>
      {openForm === "share-transaction" ? (
        <form
          className="circles-inline-form circles-inline-form--wide"
          onSubmit={submitSharedTransaction}
        >
          <label>
            <span>Your transaction</span>
            <select name="transactionId" required defaultValue="">
              <option value="" disabled>
                Select a transaction
              </option>
              {transactions.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {formatDate(entry.date)} · {entry.title} ·{" "}
                  {formatMoney(entry.amount, entry.currency)} ·{" "}
                  {entry.workspaceName}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>What members can see</span>
            <select name="visibility" defaultValue="item">
              <option value="summary">Amount only</option>
              <option value="item">Selected transaction details</option>
            </select>
          </label>
          <label>
            <span>
              Shared amount <small>Optional</small>
            </span>
            <input name="sharedAmount" type="number" min="0.01" step="0.01" />
          </label>
          <label>
            <span>
              Shared title <small>Optional</small>
            </span>
            <input name="sharedTitle" placeholder="e.g. Groceries" />
          </label>
          <div className="circles-share-preview">
            Preview: Clover shares only the amount at “Amount only.” It never
            exposes the source account or other transactions.
          </div>
          <button
            className="button button-primary"
            type="submit"
            disabled={isSaving}
          >
            Share with Circle
          </button>
        </form>
      ) : null}
      <div className="circles-record-list">
        {circle.expenses.length ? (
          circle.expenses.map((expense) => (
            <article key={`${expense.kind}:${expense.id}`}>
              <div>
                <strong>{expense.title}</strong>
                <span>
                  {formatDate(expense.date)} ·{" "}
                  {expense.kind === "split_bill"
                    ? "Split bill"
                    : expense.visibility === "summary"
                      ? "Amount-only share"
                      : "Shared transaction"}
                </span>
              </div>
              <div className="circles-record-list__actions">
                <strong>{formatMoney(expense.amount, expense.currency)}</strong>
                {expense.kind === "shared_transaction" ? (
                  <button
                    className="button button-ghost button-small"
                    type="button"
                    onClick={() =>
                      void runResource(
                        { action: "unshare_transaction", id: expense.id },
                        "Transaction is private again.",
                      )
                    }
                  >
                    Stop sharing
                  </button>
                ) : (
                  <Link
                    className="button button-ghost button-small"
                    href={expense.href}
                    prefetch={false}
                  >
                    Open
                  </Link>
                )}
              </div>
            </article>
          ))
        ) : (
          <CircleEmptyState
            image="/illustrations/clover-transactions-search-3d.png"
            title="No shared expenses yet"
          >
            Add a Split Bill or selectively share one of your own transactions.
          </CircleEmptyState>
        )}
      </div>
    </section>
  );
}

function CircleBudgets({
  circle,
  openForm,
  setOpenForm,
  submitBudget,
  runResource,
  isSaving,
}: SharedPanelProps & {
  submitBudget: (event: FormEvent<HTMLFormElement>) => void;
  runResource: (
    payload: Record<string, unknown>,
    message: string,
  ) => Promise<void>;
}) {
  return (
    <section className="circles-section panel glass">
      <div className="circles-section__head">
        <div>
          <p className="eyebrow">Shared budgets</p>
          <h3>Guardrails based on what the Circle shares</h3>
          <p>Circle budgets never inspect anyone’s private spending.</p>
        </div>
        <button
          className="button button-primary button-small"
          type="button"
          onClick={() => setOpenForm(openForm === "budget" ? null : "budget")}
        >
          Create budget
        </button>
      </div>
      {openForm === "budget" ? (
        <form className="circles-inline-form" onSubmit={submitBudget}>
          <label>
            <span>Budget name</span>
            <input name="name" required placeholder="e.g. Household spending" />
          </label>
          <label>
            <span>Target</span>
            <input
              name="targetAmount"
              type="number"
              min="0.01"
              step="0.01"
              required
            />
          </label>
          <label>
            <span>Cadence</span>
            <select name="cadence" defaultValue="monthly">
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annual">Annual</option>
            </select>
          </label>
          <label>
            <span>
              Category <small>Optional</small>
            </span>
            <input name="categoryName" placeholder="Exact category name" />
          </label>
          <button
            className="button button-primary"
            type="submit"
            disabled={isSaving}
          >
            Save budget
          </button>
        </form>
      ) : null}
      <div className="circles-card-grid">
        {circle.budgets.length ? (
          circle.budgets.map((budget) => (
            <article key={budget.id} className="circles-progress-card">
              <div>
                <strong>{budget.name}</strong>
                <span>
                  {budget.cadence}
                  {budget.categoryName
                    ? ` · ${budget.categoryName}`
                    : " · all shared expenses"}
                </span>
              </div>
              <div className="circles-progress-track">
                <span
                  style={{ width: `${Math.min(100, budget.progressPercent)}%` }}
                />
              </div>
              <div className="circles-progress-card__numbers">
                <span>
                  {formatMoney(budget.spentAmount, budget.currency)} used
                </span>
                <strong>
                  {formatMoney(budget.targetAmount, budget.currency)}
                </strong>
              </div>
              {budget.remainingAmount < 0 ? (
                <p className="is-attention">
                  {formatMoney(
                    Math.abs(budget.remainingAmount),
                    budget.currency,
                  )}{" "}
                  over target
                </p>
              ) : (
                <p>
                  {formatMoney(budget.remainingAmount, budget.currency)}{" "}
                  remaining
                </p>
              )}
              <button
                className="button button-ghost button-small"
                type="button"
                onClick={() =>
                  void runResource(
                    { action: "update_budget", id: budget.id, isActive: false },
                    "Budget archived.",
                  )
                }
              >
                Archive
              </button>
            </article>
          ))
        ) : (
          <CircleEmptyState
            image="/assets/3d%20icons/menu/budgeting.png"
            title="No shared budgets yet"
          >
            Start with one broad monthly budget and refine it after the group
            has real shared activity.
          </CircleEmptyState>
        )}
      </div>
    </section>
  );
}

function CircleGoals({
  circle,
  investmentAccounts,
  openForm,
  setOpenForm,
  submitGoal,
  submitContribution,
  submitInvestment,
  runResource,
  isSaving,
}: SharedPanelProps & {
  investmentAccounts: CirclesWorkspaceData["investmentAccounts"];
  submitGoal: (event: FormEvent<HTMLFormElement>) => void;
  submitContribution: (event: FormEvent<HTMLFormElement>) => void;
  submitInvestment: (event: FormEvent<HTMLFormElement>) => void;
  runResource: (
    payload: Record<string, unknown>,
    message: string,
  ) => Promise<void>;
}) {
  return (
    <div className="circles-panel-stack">
      <section className="circles-section panel glass">
        <div className="circles-section__head">
          <div>
            <p className="eyebrow">Goals and life plans</p>
            <h3>Plan around something real</h3>
          </div>
          <div className="circles-section__actions">
            <button
              className="button button-secondary button-small"
              type="button"
              onClick={() =>
                setOpenForm(openForm === "contribution" ? null : "contribution")
              }
            >
              Record contribution
            </button>
            <button
              className="button button-primary button-small"
              type="button"
              onClick={() => setOpenForm(openForm === "goal" ? null : "goal")}
            >
              Create goal
            </button>
          </div>
        </div>
        {openForm === "goal" ? (
          <form
            className="circles-inline-form circles-inline-form--wide"
            onSubmit={submitGoal}
          >
            <label>
              <span>Plan or goal</span>
              <select name="name" defaultValue="">
                <option value="" disabled>
                  Choose or type below
                </option>
                <option>Emergency fund</option>
                <option>Wedding</option>
                <option>Moving out</option>
                <option>Tuition</option>
                <option>Pregnancy and childbirth</option>
                <option>Buying a home</option>
                <option>Vehicle</option>
                <option>Changing jobs</option>
                <option>Working abroad</option>
                <option>Starting freelancing</option>
                <option>Travel</option>
                <option>Supporting parents</option>
                <option>Retirement transition</option>
              </select>
            </label>
            <label>
              <span>
                Purpose <small>Optional</small>
              </span>
              <input
                name="purpose"
                placeholder="What will this make possible?"
              />
            </label>
            <label>
              <span>Target amount</span>
              <input
                name="targetAmount"
                type="number"
                min="0.01"
                step="0.01"
                required
              />
            </label>
            <label>
              <span>Already saved</span>
              <input name="startingAmount" type="number" min="0" step="0.01" />
            </label>
            <label>
              <span>Target date</span>
              <input name="targetDate" type="date" />
            </label>
            <button
              className="button button-primary"
              type="submit"
              disabled={isSaving}
            >
              Create shared goal
            </button>
          </form>
        ) : null}
        {openForm === "contribution" ? (
          <form className="circles-inline-form" onSubmit={submitContribution}>
            <label>
              <span>Amount</span>
              <input
                name="amount"
                type="number"
                min="0.01"
                step="0.01"
                required
              />
            </label>
            <label>
              <span>Contributed by</span>
              <select name="memberId" defaultValue="">
                <option value="">Current member</option>
                {circle.members
                  .filter((member) => member.status === "active")
                  .map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.displayName}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              <span>Apply to goal</span>
              <select name="goalId">
                <option value="">General Circle contribution</option>
                {circle.goals
                  .filter((goal) => goal.status === "active")
                  .map((goal) => (
                    <option key={goal.id} value={goal.id}>
                      {goal.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              <span>Note</span>
              <input name="note" placeholder="Optional context" />
            </label>
            <button
              className="button button-primary"
              type="submit"
              disabled={isSaving}
            >
              Record contribution
            </button>
          </form>
        ) : null}
        <div className="circles-card-grid">
          {circle.goals.length ? (
            circle.goals.map((goal) => (
              <article key={goal.id} className="circles-progress-card">
                <div>
                  <strong>{goal.name}</strong>
                  <span>{goal.purpose || formatDate(goal.targetDate)}</span>
                </div>
                <div className="circles-progress-track">
                  <span style={{ width: `${goal.progressPercent}%` }} />
                </div>
                <div className="circles-progress-card__numbers">
                  <span>
                    {formatMoney(goal.currentAmount, goal.currency)} saved
                  </span>
                  <strong>{goal.progressPercent}%</strong>
                </div>
                <p>
                  {formatMoney(goal.remainingAmount, goal.currency)} remaining
                </p>
                {goal.estimatedCompletionDate ? (
                  <p className="circles-estimate">
                    Estimated completion:{" "}
                    {formatDate(goal.estimatedCompletionDate)} ·{" "}
                    {goal.estimateConfidence}% confidence
                  </p>
                ) : (
                  <p className="circles-estimate">
                    Record at least two contributions for a pace-based estimate.
                  </p>
                )}
                <button
                  className="button button-ghost button-small"
                  type="button"
                  onClick={() =>
                    void runResource(
                      {
                        action: "update_goal",
                        id: goal.id,
                        status: "archived",
                      },
                      "Goal archived.",
                    )
                  }
                >
                  Archive
                </button>
              </article>
            ))
          ) : (
            <CircleEmptyState
              image="/illustrations/clover-goals-progress-3d.png"
              title="No shared goals yet"
            >
              Choose a life event or create a straightforward savings target.
            </CircleEmptyState>
          )}
        </div>
      </section>
      <section className="circles-section panel glass">
        <div className="circles-section__head">
          <div>
            <p className="eyebrow">Shared investment visibility</p>
            <h3>Share a selected summary, never an account login</h3>
            <p>
              This is for coordination and goals. It does not create joint
              ownership.
            </p>
          </div>
          {investmentAccounts.length ? (
            <button
              className="button button-secondary button-small"
              type="button"
              onClick={() =>
                setOpenForm(openForm === "investment" ? null : "investment")
              }
            >
              Share summary
            </button>
          ) : null}
        </div>
        {openForm === "investment" ? (
          <form className="circles-inline-form" onSubmit={submitInvestment}>
            <label>
              <span>Your investment account</span>
              <select name="accountId" required>
                {investmentAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} ·{" "}
                    {account.balance === null
                      ? "No value"
                      : formatMoney(account.balance, account.currency)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Visibility</span>
              <select name="visibility" defaultValue="summary">
                <option value="summary">Value only</option>
                <option value="item">Account name and value</option>
              </select>
            </label>
            <label className="circles-checkbox">
              <input name="includeHoldings" type="checkbox" />
              <span>Also show holdings when item details are shared</span>
            </label>
            <button
              className="button button-primary"
              type="submit"
              disabled={isSaving}
            >
              Share investment summary
            </button>
          </form>
        ) : null}
        <div className="circles-record-list">
          {circle.investmentShares.length ? (
            circle.investmentShares.map((entry) => (
              <article key={entry.id}>
                <div>
                  <strong>{entry.name}</strong>
                  <span>
                    {entry.institution ||
                      (entry.visibility === "summary"
                        ? "Account identity hidden"
                        : "Investment account")}
                  </span>
                </div>
                <div className="circles-record-list__actions">
                  <strong>
                    {entry.balance === null
                      ? "No value"
                      : formatMoney(entry.balance, entry.currency)}
                  </strong>
                  <button
                    className="button button-ghost button-small"
                    type="button"
                    onClick={() =>
                      void runResource(
                        { action: "unshare_investment", id: entry.id },
                        "Investment summary is private again.",
                      )
                    }
                  >
                    Stop sharing
                  </button>
                </div>
              </article>
            ))
          ) : (
            <CircleEmptyState
              image="/illustrations/clover-investments-portfolio-3d.png"
              title="No shared investments"
            >
              No investment information is shared with this Circle.
            </CircleEmptyState>
          )}
        </div>
      </section>
    </div>
  );
}

function CircleActivity({ circle }: { circle: CircleSummary }) {
  return (
    <section className="circles-section panel glass">
      <div className="circles-section__head">
        <div>
          <p className="eyebrow">Audit history</p>
          <h3>What changed and who changed it</h3>
        </div>
      </div>
      <div className="circles-timeline">
        {circle.activities.length ? (
          circle.activities.map((activity) => (
            <article key={activity.id}>
              <span className="circles-timeline__dot" />
              <div>
                <strong>{activity.summary}</strong>
                <span>
                  {activity.actorName ? `${activity.actorName} · ` : ""}
                  {formatDate(activity.createdAt)}
                </span>
              </div>
            </article>
          ))
        ) : (
          <CircleEmptyState
            image="/illustrations/clover-review-checklist-3d.png"
            title="No Circle activity yet"
          >
            Changes made by Circle members will appear here.
          </CircleEmptyState>
        )}
      </div>
    </section>
  );
}

function CircleMembers({
  circle,
  latestInviteUrl,
  submitInvite,
  updateMemberRole,
  removeMember,
  manageInvitation,
  deleteCircle,
  onChangeCirclePhoto,
  isSaving,
}: {
  circle: CircleSummary;
  latestInviteUrl: string | null;
  submitInvite: (event: FormEvent<HTMLFormElement>) => void;
  updateMemberRole: (memberId: string, role: string) => void;
  removeMember: (memberId: string, displayName: string) => void;
  manageInvitation: (
    invitationId: string,
    action: "resend" | "revoke" | "copy",
    shareUrl: string,
  ) => Promise<void>;
  deleteCircle: () => Promise<void>;
  onChangeCirclePhoto: () => void;
  isSaving: boolean;
}) {
  const [inviteOpen, setInviteOpen] = useState(false);

  return (
    <div className="circles-panel-stack">
      <section className="circles-section panel glass">
        <div className="circles-section__head">
          <div>
            <h3 className="eyebrow">People and permissions</h3>
          </div>
          {circle.role === "organizer" ? (
            <button
              className="circles-change-photo"
              type="button"
              onClick={onChangeCirclePhoto}
              disabled={isSaving}
            >
              <span
                className={`circles-avatar circles-avatar--small circles-avatar--${circle.color}`}
              >
                <img src={getCircleAvatarUrl(circle)} alt="" />
              </span>
              Change Circle photo
            </button>
          ) : null}
        </div>
        <div className="circles-member-list">
          {circle.members
            .filter(
              (member) =>
                member.status !== "removed" && member.status !== "left",
            )
            .map((member) => (
              <article key={member.id}>
                <span className="circles-avatar">
                  {getInitials(member.displayName)}
                </span>
                <div>
                  <strong>{member.displayName}</strong>
                  <span>
                    {member.status === "invited"
                      ? "Not joined yet"
                      : member.email || "Active member"}
                  </span>
                </div>
                <div className="circles-member-list__actions">
                  <select
                    value={member.role}
                    aria-label={`${member.displayName} role`}
                    onChange={(event) =>
                      updateMemberRole(member.id, event.currentTarget.value)
                    }
                    disabled={
                      circle.role !== "organizer" ||
                      member.isOwner ||
                      isSaving
                    }
                  >
                    <option value="organizer">Organizer</option>
                    <option value="member">Member</option>
                    <option value="participant">Participant</option>
                  </select>
                  {circle.role === "organizer" && !member.isOwner ? (
                    <button
                      className="circles-member-remove"
                      type="button"
                      aria-label={`Remove ${member.displayName}`}
                      title={`Remove ${member.displayName}`}
                      onClick={() => removeMember(member.id, member.displayName)}
                      disabled={isSaving}
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          {circle.role === "organizer" ? (
            <button
              className="circles-add-person"
              type="button"
              onClick={() => setInviteOpen((current) => !current)}
              aria-expanded={inviteOpen}
            >
              <span aria-hidden="true">+</span> Add person
            </button>
          ) : null}
        </div>
        {circle.role === "organizer" && inviteOpen ? (
          <form className="circles-inline-form" onSubmit={submitInvite}>
            <label>
              <span>Email</span>
              <input name="email" type="email" placeholder="ana@example.com" required />
            </label>
            <label>
              <span>
                Name <small>Optional</small>
              </span>
              <input name="displayName" placeholder="e.g. Ana" />
            </label>
            <label>
              <span>Role</span>
              <select name="role" defaultValue="member">
                <option value="member">Member · can add shared items</option>
                <option value="participant">
                  Participant · view and respond
                </option>
                <option value="organizer">
                  Organizer · can manage the Circle
                </option>
              </select>
            </label>
            <button
              className="button button-primary"
              type="submit"
              disabled={isSaving}
            >
              Send invitation
            </button>
          </form>
        ) : null}
        {latestInviteUrl ? (
            <div className="circles-invite-result">
              <input
                readOnly
                value={latestInviteUrl}
                aria-label="Latest Circle invitation link"
              />
              <button
                className="button button-secondary button-small"
                type="button"
                onClick={() =>
                  void navigator.clipboard?.writeText(latestInviteUrl)
                }
              >
                Copy
              </button>
            </div>
          ) : null}
          {circle.invitations.length ? (
            <div className="circles-pending-invites">
              {circle.invitations.map((invitation) => (
                <article key={invitation.id}>
                  <div>
                    <strong>
                      {invitation.displayName || invitation.email || "Invitation"}
                    </strong>
                    <span>
                      {invitation.email} · Pending · expires {formatDate(invitation.expiresAt)}
                    </span>
                  </div>
                  <div className="circles-pending-invites__actions">
                    <button className="button button-secondary button-small" type="button" disabled={isSaving} onClick={() => void manageInvitation(invitation.id, "copy", invitation.shareUrl)}>Copy link</button>
                    <button className="button button-secondary button-small" type="button" disabled={isSaving} onClick={() => void manageInvitation(invitation.id, "resend", invitation.shareUrl)}>Resend</button>
                    <button className="button button-secondary button-small" type="button" disabled={isSaving} onClick={() => void manageInvitation(invitation.id, "revoke", invitation.shareUrl)}>Revoke</button>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
      </section>
      {circle.isOwner ? (
        <section className="settings-action-card settings-account-card settings-account-card--danger circles-delete-card">
          <div className="settings-account-card__head">
            <h5>Delete Circle</h5>
          </div>
          <p>
            Permanently delete this Circle and its shared plans. Personal
            transactions and existing Split Bills will remain.
          </p>
          <button
            className="button button-danger button-small"
            type="button"
            onClick={() => void deleteCircle()}
            disabled={isSaving}
          >
            Delete Circle
          </button>
        </section>
      ) : null}
    </div>
  );
}
