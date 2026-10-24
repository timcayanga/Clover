import { trialPresentation, TRIAL_PURCHASE_COPY, type SignupTrialSnapshot } from '../../shared/signup-trial';
import { Body, Card, Heading } from './ui';
export function SignupTrialSummary({ trial, purchase = false }: { trial?: SignupTrialSnapshot | null; purchase?: boolean }) {
  const copy = trialPresentation(trial);
  if (!copy) return null;
  return <Card><Heading>{copy.title}</Heading><Body>{copy.body}</Body>{purchase && trial?.status === 'active' ? <Body>{TRIAL_PURCHASE_COPY}</Body> : null}</Card>;
}
