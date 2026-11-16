import { PLAN_CATALOG, type CloverPlanTier } from '../../shared/plan-catalog';
import { trialDateLabel, type TrialMilestone } from '../../shared/signup-trial';
import type { InAppNotification } from './in-app-notifications';
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function signupTrialNotice(trial: { id: string; endsAt: Date }, kind: TrialMilestone, effectiveTier: CloverPlanTier): InAppNotification {
  const expiry = trialDateLabel(trial.endsAt.toISOString());
  const title = kind === 'seven_days' ? 'One more week of Clover Plus 🌿' : kind === 'one_day' ? 'Your Plus trial ends within 24 hours' : 'Your Plus trial has ended—your money story stays with you';
  const message = kind === 'expired'
    ? `Your current plan is Clover ${PLAN_CATALOG[effectiveTier].name}. Your imported history and existing records stay available. ${effectiveTier === 'free' ? 'Bank syncing has stopped. Bank disconnection is being processed and may still be pending with the provider. Upgrade whenever you need paid features again.' : 'Your other access continues to provide its features. Bank links follow your current allowance.'}`
    : `Your Plus trial ends ${expiry}. Enjoy Ask Clover and up to two linked bank accounts until then. No card required and no automatic charge. Your financial history stays available on Free; bank syncing and paid features require a paid plan after the trial unless you have other valid access.`;
  return { id: `signup-trial:${trial.id}:${kind}`, product: 'settings', productLabel: 'Clover Plus trial', productHref: '/settings?section=plan', title, message, tone: 'neutral', priority: 'normal', createdAt: new Date(+trial.endsAt - (kind === 'seven_days' ? 7 : kind === 'one_day' ? 1 : 0) * 86_400_000).toISOString(), href: '/settings?section=plan', ctaLabel: 'View plans' };
}
/** Plain text is always delivered alongside the accessible, responsive branded HTML. */
export function signupTrialEmail(subject: string, body: string, url: string, origin = 'https://clover.ph') {
  const footer = `Clover · Personal finance, clearer.\nNotification preferences: ${origin}/settings?section=notifications\nHelp: ${origin}/help · Privacy: ${origin}/privacy-policy`;
  return { subject, text: `${body}\n\nView plans: ${url}\n\n${footer}`, html: `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><meta charset="utf-8"></head><body style="margin:0;background:#f4fafa;color:#202c35;font-family:Arial,sans-serif;line-height:1.65"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding:24px 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:auto;background:#fff;border-radius:24px"><tr><td style="padding:32px"><a href="${origin}" aria-label="Clover"><img src="${origin}/pwa/icon-192-gradient.png" alt="Clover" width="48" style="display:block;max-width:100%"></a><h1 style="font-size:24px;line-height:1.35;margin:28px 0 16px">${escapeHtml(subject)}</h1><p style="font-size:16px">${escapeHtml(body).replaceAll('\n','<br>')}</p><p style="margin:28px 0"><a href="${escapeHtml(url)}" style="display:inline-block;background:#00abc0;color:#fff;padding:12px 24px;border-radius:28px;text-decoration:none;font-weight:bold">View plans</a></p><p style="font-size:12px;color:#596977">Clover · Personal finance, clearer.<br><a href="${origin}/settings?section=notifications" style="color:#007f90">Notification preferences</a> · <a href="${origin}/help" style="color:#007f90">Help</a> · <a href="${origin}/privacy-policy" style="color:#007f90">Privacy</a></p></td></tr></table></td></tr></table></body></html>` };
}
/** SMTP timeouts after DATA can mean delivered. Never blindly resend those. */
export function retryableTrialMailFailure(error: unknown) {
  const e = error as { code?: string; responseCode?: number; command?: string } | null;
  return Boolean(e && ((e.responseCode && e.responseCode >= 400 && e.responseCode < 500) || ['ECONNREFUSED','ENOTFOUND','EAI_AGAIN'].includes(e.code ?? '') || (e.command === 'CONN' && e.code === 'ETIMEDOUT')));
}
