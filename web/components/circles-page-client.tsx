"use client";

import { useEffect, useState } from "react";
import { AnimatedTabs } from "@/components/animated-tabs";
import { CloverShell } from "@/components/clover-shell";
import { CirclesWorkspace } from "@/components/circles-workspace";
import type { CircleSummary, CirclesWorkspaceData } from "@/lib/circles";
import { isSplitBillBuiltInAvatarUrl } from "@/lib/split-bill-avatars";

const circleAvatarUrl = (circle: CircleSummary) =>
  circle.avatarUrl && !isSplitBillBuiltInAvatarUrl(circle.avatarUrl)
    ? circle.avatarUrl
    : "/clover-mark.svg";

export function CirclesPageClient({
  initialData,
}: {
  initialData: CirclesWorkspaceData;
}) {
  const [circles, setCircles] = useState(initialData.circles);
  const [selectedCircleId, setSelectedCircleId] = useState<string | null>(
    initialData.circles[0]?.id ?? null,
  );
  const [createRequest, setCreateRequest] = useState(0);

  useEffect(() => {
    if (window.location.pathname === "/circles") {
      window.history.replaceState(null, "", "/circles");
    }
  }, []);

  useEffect(() => {
    if (
      selectedCircleId &&
      !circles.some((circle) => circle.id === selectedCircleId)
    ) {
      setSelectedCircleId(circles[0]?.id ?? null);
    }
  }, [circles, selectedCircleId]);

  return (
    <CloverShell
      active="circles"
      title="Circles"
      mobileBackHref="/more"
      titleAddon={
        circles.length ? (
          <AnimatedTabs
            className="investments-tabs circles-title-tabs"
            activeKey={selectedCircleId ?? circles[0].id}
            onChange={setSelectedCircleId}
            tabs={circles.map((circle) => ({
              key: circle.id,
              label: circle.name,
              icon: (
                <img
                  className="circles-title-tab__avatar"
                  src={circleAvatarUrl(circle)}
                  alt=""
                />
              ),
              badge:
                circle.pendingCount > 0 ? String(circle.pendingCount) : null,
              ariaLabel: circle.name,
            }))}
          />
        ) : null
      }
      actions={
        <button
          className="button button-primary button-small accounts-toolbar-button accounts-toolbar-button--upload circles-topbar-action"
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
      />
    </CloverShell>
  );
}
