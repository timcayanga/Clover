import { CloverShell } from "@/components/clover-shell";

export default function GoalsLoading() {
  return (
    <CloverShell active="goals" kicker="Goal coaching" title="Loading goals" showTopbar={false}>
      <section className="goals-story">
        <article className="goals-hero glass">
          <div className="goals-hero__copy">
            <span className="pill pill-accent">Onboarding goals</span>
            <h3>Getting your goal lane ready...</h3>
            <p>We are shaping your progress view and pulling in the latest workspace data.</p>
          </div>
        </article>
      </section>
    </CloverShell>
  );
}
