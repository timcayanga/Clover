"use client";
import { missionMascotPoses } from "../../shared/onboarding-missions";

import Link from "next/link";
import { CloverMascot } from "@/components/clover-mascot";
import { useEffect, useState } from "react";
import { capturePostHogClientEvent } from "@/components/posthog-analytics";
import type { OnboardingMissionSnapshot } from "@/lib/onboarding-missions";

export function OnboardingMissions({ surface }: { surface: "notifications" | "popover" }) {
  const [snapshot, setSnapshot] = useState<OnboardingMissionSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/onboarding/missions", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((result: { missions?: OnboardingMissionSnapshot | null } | null) => {
        if (cancelled) return;
        setSnapshot(result?.missions ?? null);
        setLoading(false);
        if (result?.missions && !result.missions.dismissed && !result.missions.complete) {
          capturePostHogClientEvent("onboarding_missions_viewed", {
            surface,
            completed_count: result.missions.completedCount,
            total_count: result.missions.totalCount,
            next_mission_id: result.missions.nextMission?.id ?? null,
          });
        }
      })
      .catch(() => setLoading(false));
    return () => { cancelled = true; };
  }, [surface]);

  const dismiss = async () => {
    setSnapshot((current) => current ? { ...current, dismissed: true } : current);
    await fetch("/api/onboarding/missions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "dismiss" }),
    }).catch(() => null);
  };

  if (loading || !snapshot || snapshot.dismissed || snapshot.complete || !snapshot.nextMission) return null;
  const next = snapshot.nextMission;
  const progress = Math.round((snapshot.completedCount / snapshot.totalCount) * 100);

  return (
    <section className="onboarding-missions onboarding-missions--notifications" aria-label="Getting started missions">
      <div className="onboarding-missions__head">
        <CloverMascot pose={missionMascotPoses[snapshot.nextMission.id]} size={72} />
        <div>
          <h3>Getting started</h3>
          <p>A few simple steps to make Clover yours.</p>
        </div>
      </div>
      <div className="onboarding-missions__meta">
        <span>{snapshot.completedCount} of {snapshot.totalCount} complete</span>
        <button type="button" className="onboarding-missions__dismiss" onClick={dismiss}>Dismiss</button>
      </div>
      <div
        className="onboarding-missions__progress"
        role="progressbar"
        aria-label="Getting started progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
      >
        <span style={{ width: `${progress}%` }} />
      </div>
      <div className="onboarding-missions__list">
        {snapshot.missions.map((mission) => (
          <article key={mission.id} className={`onboarding-mission${mission.completed ? " is-complete" : ""}${mission.id === next.id ? " is-next" : ""}`}>
            <span className="onboarding-mission__status" aria-hidden="true">{mission.completed ? "✓" : ""}</span>
            <div>
              <strong>{mission.title}</strong>

            </div>
            {!mission.completed && mission.id === next.id ? (
              <Link
                className="button button-primary button-small"
                href={mission.href}
                onClick={() => capturePostHogClientEvent("onboarding_mission_started", { mission_id: mission.id, surface })}
              >
                {mission.actionLabel}
              </Link>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
