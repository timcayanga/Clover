"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { CircleCreateDialog } from "@/components/circle-create-dialog";
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
  initialCircleId?: string | null;
  initialTab?: string | null;
  initialCreate?: boolean;
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
  initialCircleId,
  initialTab,
  initialCreate = false,
}: CirclesWorkspaceProps) {
  const router = useRouter();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [data, setData] = useState(initialData);
  const [selectedCircleId, setSelectedCircleId] = useState(
    initialCircleId &&
      initialData.circles.some((circle) => circle.id === initialCircleId)
      ? initialCircleId
      : (initialData.circles[0]?.id ?? null),
  );
  const [activeTab, setActiveTab] = useState<CircleTab>(
    tabs.includes(initialTab as CircleTab)
      ? (initialTab as CircleTab)
      : "overview",
  );
  const [showCreate, setShowCreate] = useState(initialCreate);
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
    if (initialCreate) {
      setCreateInitialType(null);
      setShowCreate(true);
    }
  }, [initialCreate]);

  const openCreate = (type: CircleTypeValue | null = null) => {
    setCreateInitialType(type);
    setShowCreate(true);
  };

  const closeCreate = () => {
    setShowCreate(false);
    setCreateInitialType(null);
    const params = new URLSearchParams(window.location.search);
    if (params.has("create")) {
      params.delete("create");
      const query = params.toString();
      router.replace(query ? `/circles?${query}` : "/circles", { scroll: false });
    }
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

  const updateLocation = (circleId: string, tab: CircleTab) => {
    const params = new URLSearchParams(window.location.search);
    params.set("circle", circleId);
    params.set("tab", tab);
    window.history.replaceState(null, "", `/circles?${params.toString()}`);
  };

  const selectCircle = (circleId: string) => {
    setSelectedCircleId(circleId);
    setOpenForm(null);
    setMessage(null);
    updateLocation(circleId, activeTab);
  };

  const selectTab = (tab: CircleTab) => {
    setActiveTab(tab);
    setOpenForm(null);
    setMessage(null);
    if (selectedCircle) updateLocation(selectedCircle.id, tab);
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
      setSelectedCircleId(nextId);
    else setSelectedCircleId(payload.circles[0]?.id ?? null);
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

  const submitMemberTarget = (
    event: FormEvent<HTMLFormElement>,
    memberId: string,
  ) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void runResource(
      {
        action: "update_member",
        id: memberId,
        contributionTarget: form.get("contributionTarget") || null,
        contributionCadence: form.get("contributionCadence"),
        role: form.get("role"),
      },
      "Member agreement updated.",
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

  const archiveCircle = async () => {
    if (
      !selectedCircle ||
      !window.confirm(
        `Archive ${selectedCircle.name}? Its financial history will be preserved.`,
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
        throw new Error(payload.error || "Unable to archive this Circle.");
      await refresh();
      setMessage("Circle archived. Its financial history was preserved.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to archive this Circle.",
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
          <nav className="circles-circle-tabs" aria-label="Your Circles">
            {data.circles.map((circle) => (
              <button
                key={circle.id}
                className={`circles-circle-tab ${circle.id === selectedCircle?.id ? "is-selected" : ""}`}
                type="button"
                onClick={() => selectCircle(circle.id)}
              >
                <span
                  className={`circles-avatar circles-avatar--small circles-avatar--${circle.color}`}
                >
                  <img src={getCircleAvatarUrl(circle)} alt="" />
                </span>
                <strong>{circle.name}</strong>
                {circle.pendingCount > 0 ? (
                  <span className="circles-count">{circle.pendingCount}</span>
                ) : null}
              </button>
            ))}
            <button
              className="circles-circle-tab circles-circle-tab--add"
              type="button"
              aria-label="Create another Circle"
              onClick={() => openCreate()}
            >
              <span aria-hidden="true">+</span> New Circle
            </button>
          </nav>

          {selectedCircle ? (
            <main className="circles-workspace">
              <header className="circles-workspace-heading">
                {selectedCircle.role === "organizer" ? (
                  <button
                    className={`circles-avatar circles-avatar--large circles-avatar--editable circles-avatar--${selectedCircle.color}`}
                    type="button"
                    aria-label={`Change ${selectedCircle.name} photo`}
                    title="Change Circle photo"
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={isSaving}
                  >
                    <img src={getCircleAvatarUrl(selectedCircle)} alt="" />
                    <span aria-hidden="true">✎</span>
                  </button>
                ) : (
                  <span
                    className={`circles-avatar circles-avatar--large circles-avatar--${selectedCircle.color}`}
                  >
                    <img src={getCircleAvatarUrl(selectedCircle)} alt="" />
                  </span>
                )}
                <h2>{selectedCircle.name}</h2>
                <div
                  className="circles-workspace-heading__members"
                  aria-label={`${selectedCircle.memberCount} Circle members`}
                >
                  {selectedCircle.members
                    .filter((member) => member.status === "active")
                    .slice(0, 5)
                    .map((member) => (
                    <span key={member.id} title={member.displayName}>
                      {getInitials(member.displayName)}
                    </span>
                    ))}
                  {selectedCircle.memberCount > 5 ? (
                    <span>+{selectedCircle.memberCount - 5}</span>
                  ) : null}
                </div>
                <input
                  ref={avatarInputRef}
                  className="sr-only"
                  type="file"
                  accept="image/*"
                  aria-label="Choose a Circle photo"
                  onChange={(event) => void updateCircleAvatar(event)}
                />
              </header>

              <nav
                className="circles-tabs"
                aria-label={`${selectedCircle.name} sections`}
              >
                {tabs.map((tab) => (
                  <button
                    key={tab}
                    className={activeTab === tab ? "is-active" : ""}
                    type="button"
                    onClick={() => selectTab(tab)}
                  >
                    {tab[0].toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </nav>

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
                  submitMemberTarget={submitMemberTarget}
                  manageInvitation={manageInvitation}
                  archiveCircle={archiveCircle}
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
              setSelectedCircleId(circleId);
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
        <article className="panel glass">
          <span>Shared expenses this month</span>
          <strong>
            {formatMoney(circle.expenseTotalThisMonth, circle.currency)}
          </strong>
        </article>
        <article className="panel glass">
          <span>Contributions this month</span>
          <strong>
            {formatMoney(circle.contributionTotalThisMonth, circle.currency)}
          </strong>
        </article>
        <article className="panel glass">
          <span>Active goals</span>
          <strong>
            {circle.goals.filter((goal) => goal.status === "active").length}
          </strong>
        </article>
        <article className="panel glass">
          <span>Upcoming commitments</span>
          <strong>{upcoming.length}</strong>
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
              <details>
                <summary>How Clover calculated this</summary>
                <span>
                  {insight.reason} Confidence: {insight.confidence}%.
                </span>
              </details>
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
            <div className="circles-soft-empty">
              No commitments yet. Add rent, utilities, tuition, family support,
              or another recurring responsibility.
            </div>
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
          <div className="circles-soft-empty">
            No shared expenses yet. Add a Split Bill or selectively share one of
            your own transactions.
          </div>
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
          <div className="circles-soft-empty">
            No Circle budgets yet. Start with one broad monthly budget and
            refine it after the group has real shared activity.
          </div>
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
            <div className="circles-soft-empty">
              No shared goals yet. Choose a life event or create a
              straightforward savings target.
            </div>
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
            <div className="circles-soft-empty">
              No investment information is shared with this Circle.
            </div>
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
          <div className="circles-soft-empty">
            Circle activity will appear here.
          </div>
        )}
      </div>
    </section>
  );
}

function CircleMembers({
  circle,
  latestInviteUrl,
  submitInvite,
  submitMemberTarget,
  manageInvitation,
  archiveCircle,
  isSaving,
}: {
  circle: CircleSummary;
  latestInviteUrl: string | null;
  submitInvite: (event: FormEvent<HTMLFormElement>) => void;
  submitMemberTarget: (
    event: FormEvent<HTMLFormElement>,
    memberId: string,
  ) => void;
  manageInvitation: (
    invitationId: string,
    action: "resend" | "revoke" | "copy",
    shareUrl: string,
  ) => Promise<void>;
  archiveCircle: () => Promise<void>;
  isSaving: boolean;
}) {
  return (
    <div className="circles-panel-stack">
      <section className="circles-section panel glass">
        <div className="circles-section__head">
          <div>
            <p className="eyebrow">Privacy at a glance</p>
            <h3>What this Circle can see</h3>
            <p>
              Only items deliberately added to {circle.name} are visible to its
              members. Personal accounts, balances, salary, and unshared
              transactions stay private.
            </p>
          </div>
        </div>
        <div className="circles-privacy-summary">
          <span><strong>{circle.expenses.length}</strong> shared expenses</span>
          <span><strong>{circle.goals.length}</strong> shared goals</span>
          <span><strong>{circle.budgets.length}</strong> shared budgets</span>
          <span><strong>{circle.investmentShares.length}</strong> investment summaries</span>
        </div>
      </section>
      <section className="circles-section panel glass">
        <div className="circles-section__head">
          <div>
            <p className="eyebrow">People and permissions</p>
            <h3>Members of {circle.name}</h3>
          </div>
        </div>
        <div className="circles-member-list">
          {circle.members.map((member) => (
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
              <form onSubmit={(event) => submitMemberTarget(event, member.id)}>
                <select
                  name="role"
                  defaultValue={member.role}
                  disabled={
                    circle.role !== "organizer" ||
                    Boolean(
                      member.userId &&
                        circle.isOwner &&
                        member.role === "organizer",
                    )
                  }
                >
                  <option value="organizer">Organizer</option>
                  <option value="member">Member</option>
                  <option value="participant">Participant</option>
                </select>
                <input
                  name="contributionTarget"
                  type="number"
                  min="0.01"
                  step="0.01"
                  defaultValue={member.contributionTarget ?? ""}
                  placeholder="Monthly target"
                  disabled={circle.role !== "organizer"}
                />
                <select
                  name="contributionCadence"
                  defaultValue={member.contributionCadence}
                  aria-label={`${member.displayName} contribution cadence`}
                  disabled={circle.role !== "organizer"}
                >
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Every two weeks</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="annual">Annually</option>
                </select>
                {circle.role === "organizer" ? (
                  <button
                    className="button button-secondary button-small"
                    type="submit"
                    disabled={isSaving}
                  >
                    Save
                  </button>
                ) : null}
              </form>
            </article>
          ))}
        </div>
      </section>
      {circle.role === "organizer" ? (
        <section className="circles-section panel glass">
          <div className="circles-section__head">
            <div>
              <p className="eyebrow">Invite securely</p>
              <h3>Bring someone into this Circle</h3>
              <p>
                They will see the Circle purpose and privacy boundary before
                joining.
              </p>
            </div>
          </div>
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
      ) : null}
      {circle.isOwner ? (
        <section className="circles-danger-zone panel glass">
          <div>
            <strong>Archive this Circle</strong>
            <p>
              Members will lose access, but bills, goals, contributions, and the
              audit history will be preserved.
            </p>
          </div>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => void archiveCircle()}
            disabled={isSaving}
          >
            Archive Circle
          </button>
        </section>
      ) : null}
    </div>
  );
}
