import type { AdminCommandCenterSnapshot } from "@/components/admin-command-center";

export type AdminRecommendation = {
  key: string;
  priority: "high" | "medium" | "opportunity";
  area: string;
  title: string;
  evidence: string;
  action: string;
  href: string;
};

const conversion = (start: number, end: number) =>
  start > 0 ? Math.min(100, Math.round((end / start) * 100)) : null;

const findAttention = (snapshot: AdminCommandCenterSnapshot, label: string) =>
  snapshot.attention.find((item) => item.label === label)?.value ?? 0;

export const buildAdminRecommendations = (
  snapshot: AdminCommandCenterSnapshot,
): AdminRecommendation[] => {
  const recommendations: AdminRecommendation[] = [];
  const activation = snapshot.funnels.find((funnel) => funnel.name === "Activation");
  const tracking = snapshot.funnels.find((funnel) => funnel.name === "Core tracking");
  const activationRate = conversion(
    activation?.steps[0]?.count ?? 0,
    activation?.steps.at(-1)?.count ?? 0,
  );
  const trackingRate = conversion(
    tracking?.steps[0]?.count ?? 0,
    tracking?.steps.at(-1)?.count ?? 0,
  );
  const retentionRate = conversion(
    snapshot.retention.active30d,
    snapshot.retention.returning7d,
  );
  const failedImports = findAttention(snapshot, "Failed imports, 7d");
  const deployErrors = findAttention(snapshot, "Current deploy errors");
  const reviewQueue = findAttention(snapshot, "Review queue");
  const lowConfidence = findAttention(snapshot, "Low confidence");

  if (deployErrors > 0) {
    recommendations.push({
      key: "reliability-errors",
      priority: "high",
      area: "Reliability",
      title: "Resolve current deployment errors first",
      evidence: `${deployErrors.toLocaleString()} error${deployErrors === 1 ? "" : "s"} recorded for the current deployment in the last 24 hours.`,
      action: "Group the top error signatures, reproduce the highest-volume path, and verify the fix before evaluating behavior changes.",
      href: "/admin/errors",
    });
  }

  if (failedImports > 0) {
    recommendations.push({
      key: "failed-imports",
      priority: "high",
      area: "Import quality",
      title: "Reduce failed imports before driving more upload traffic",
      evidence: `${failedImports.toLocaleString()} import${failedImports === 1 ? "" : "s"} failed during the last 7 days.`,
      action: "Review affected institutions and error codes in Data QA, then add deterministic coverage for the largest failure cluster.",
      href: "/admin/data-qa",
    });
  }

  if (activationRate !== null && (activation?.steps[0]?.count ?? 0) >= 3 && activationRate < 60) {
    recommendations.push({
      key: "activation-drop",
      priority: "medium",
      area: "Activation",
      title: "Shorten the path to a usable transaction list",
      evidence: `${activationRate}% of signed-up users currently reach transactions.`,
      action: "Inspect the largest step-to-step drop and simplify that exact transition rather than adding more onboarding content.",
      href: "/admin/analytics",
    });
  }

  if (trackingRate !== null && (tracking?.steps[0]?.count ?? 0) >= 3 && trackingRate < 50) {
    recommendations.push({
      key: "tracking-freshness",
      priority: "medium",
      area: "Core loop",
      title: "Help users keep their financial records current",
      evidence: `${trackingRate}% of users who started tracking added transaction data in the last 30 days.`,
      action: "Test contextual reminders around stale accounts, recurring reviews, and unfinished imports without forcing uploads.",
      href: "/admin/analytics",
    });
  }

  if (retentionRate !== null && snapshot.retention.active30d >= 3 && retentionRate < 35) {
    recommendations.push({
      key: "retention",
      priority: "medium",
      area: "Retention",
      title: "Strengthen the reason to return after setup",
      evidence: `${retentionRate}% of users active in 30 days returned across the measured periods.`,
      action: "Prioritize weekly summaries, recurring-payment follow-up, and review completion for users who already have data.",
      href: "/admin/analytics",
    });
  }

  if (reviewQueue > 0 || lowConfidence > 0) {
    recommendations.push({
      key: "review-trust",
      priority: lowConfidence > 20 ? "medium" : "opportunity",
      area: "Trust",
      title: "Turn uncertain data into a short, clear review task",
      evidence: `${reviewQueue.toLocaleString()} items await review and ${lowConfidence.toLocaleString()} have low-confidence fields.`,
      action: "Rank the queue by impact and confidence, explain the uncertain field, and learn from every confirmed correction.",
      href: "/admin/data-qa",
    });
  }

  const featureOpportunities = snapshot.adoption
    .filter((feature) => feature.status === "live")
    .map((feature) => {
      const steps = feature.steps.filter((step) => step.source === "PostHog");
      const viewers = steps[0]?.count ?? 0;
      const deepest = steps.at(-1)?.count ?? 0;
      return { feature, viewers, rate: conversion(viewers, deepest) ?? 0 };
    })
    .filter((item) => item.viewers >= 3 && item.rate < 40)
    .sort((left, right) => left.rate - right.rate || right.viewers - left.viewers)
    .slice(0, 3);

  featureOpportunities.forEach(({ feature, viewers, rate }) => {
    recommendations.push({
      key: `feature-${feature.key}`,
      priority: "opportunity",
      area: feature.label,
      title: `Improve the ${feature.label} next-step conversion`,
      evidence: `${viewers.toLocaleString()} users viewed the feature and ${rate}% reached its deepest tracked step.`,
      action: "Review the first major drop, confirm the event coverage, then simplify or clarify that specific action.",
      href: "/admin#admin-adoption-title",
    });
  });

  if (!recommendations.length) {
    recommendations.push({
      key: "collect-signal",
      priority: "opportunity",
      area: "Measurement",
      title: "Keep collecting beta behavior before changing the product",
      evidence: "No high-confidence product or reliability gap crosses the current recommendation thresholds.",
      action: "Validate event coverage and wait for a larger cohort before drawing conclusions from small conversion changes.",
      href: "/admin/analytics",
    });
  }

  const order = { high: 0, medium: 1, opportunity: 2 } as const;
  return recommendations.sort((left, right) => order[left.priority] - order[right.priority]);
};
