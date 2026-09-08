import Link from "next/link";
import { buildHomeNextSteps, type HomeNextStepCounts } from "@/lib/home-next-steps";

export function HomeNextSteps(counts: HomeNextStepCounts) {
  const steps = buildHomeNextSteps(counts);
  if (steps.length === 0) return null;

  return (
    <section className="home-next-steps glass" aria-label="Next Steps">
      <p className="eyebrow">Next Steps</p>
      <ul className="home-next-steps__list">
        {steps.map((step) => (
          <li key={step.id} className="home-next-steps__item">
            <div className="home-next-steps__copy">
              <h3>{step.title} <span className="home-next-steps__count">{step.count} pending</span></h3>
              <p>{step.description}</p>
            </div>
            <Link className="button button-primary button-small" href={step.href} aria-label={step.title}>
              Review
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
