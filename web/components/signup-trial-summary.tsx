import styles from "./signup-trial-summary.module.css";
import { trialPresentation, TRIAL_PURCHASE_COPY, type SignupTrialSnapshot } from '../../shared/signup-trial';
export function SignupTrialSummary({ trial, purchase = false }: { trial?: SignupTrialSnapshot | null; purchase?: boolean }) {
  const copy = trialPresentation(trial);
  if (!copy) return null;
  return <aside aria-label="Clover Plus trial" className={styles.summary}><h4>{copy.title}</h4><p>{copy.body}</p>{purchase && trial?.status === 'active' ? <p>{TRIAL_PURCHASE_COPY}</p> : null}</aside>;
}
