import Link from "next/link";
import type { AdminCommandCenterSnapshot } from "@/components/admin-command-center";
import { buildAdminRecommendations } from "@/lib/admin-analysis";

export function AdminAnalysisWorkspace({ snapshot }: { snapshot: AdminCommandCenterSnapshot }) {
  const recommendations = buildAdminRecommendations(snapshot);

  return (
    <section className="admin-analysis-workspace">
      <div className="admin-analysis-intro">
        <div>
          <span>Behavior-based product review</span>
          <h2>What Clover should improve next</h2>
          <p>Suggestions use current production behavior and operational signals. Small cohorts are filtered out before Clover recommends product changes.</p>
        </div>
        <Link href="/admin/analytics">Review source metrics</Link>
      </div>

      <div className="admin-analysis-list">
        {recommendations.map((recommendation, index) => (
          <article className={`admin-analysis-card is-${recommendation.priority}`} key={recommendation.key}>
            <div className="admin-analysis-card__rank">{String(index + 1).padStart(2, "0")}</div>
            <div>
              <div className="admin-analysis-card__meta">
                <span>{recommendation.area}</span>
                <em>{recommendation.priority === "opportunity" ? "Opportunity" : `${recommendation.priority} priority`}</em>
              </div>
              <h3>{recommendation.title}</h3>
              <p>{recommendation.evidence}</p>
              <strong>{recommendation.action}</strong>
            </div>
            <Link href={recommendation.href}>Inspect</Link>
          </article>
        ))}
      </div>

      <p className="admin-analysis-note">These are decision-support suggestions, not automatic product changes. Validate qualitative feedback before changing a major workflow.</p>
    </section>
  );
}
