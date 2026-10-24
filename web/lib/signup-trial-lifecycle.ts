import { prisma } from './prisma';
import { getProAccess, refreshProAccess } from './pro-access';
import { enforceBankAllowance } from './finverse-lifecycle';
import { getCurrentUserEnvironment } from './user-environment';
import { getAppPreferences } from './app-preferences';
import { notificationAllowed } from '../../shared/app-preferences';
import { trialMilestone, TRIAL_DAY_MS } from '../../shared/signup-trial';
import { loadRuntimeNotificationTemplates } from './notification-templates.server';
import { notificationValues, renderNotificationText } from './notification-template-rules';
import { sendNotificationMail } from './notification-mail.server';
import { retryableTrialMailFailure, signupTrialEmail, signupTrialNotice } from './signup-trial-notices';
import type { InAppNotification } from './in-app-notifications';

export async function signupTrialNotifications(userId: string, now = new Date()): Promise<InAppNotification[]> {
  const trial = await prisma.signupTrial.findUnique({ where: { userId } });
  const stage = trial && trialMilestone(trial, now);
  if (!trial || !stage) return [];
  const access = await getProAccess(userId);
  if (access.hasPaidSubscription) return [];
  return [signupTrialNotice(trial, stage, access.planTier)];
}

export async function deliverTrialNotice(userId: string) {
  const now = new Date();
  const trial = await prisma.signupTrial.findUnique({ where: { userId }, include: { user: true } });
  if (!trial) return;
  const stage = trialMilestone(trial, now);
  if (!stage) return;
  const environment = trial.user.environment;
  const key = { environment, userId, templateKey: 'signup-trial', eventKey: `${trial.id}:${stage}` };
  const row = await prisma.notificationEmailDelivery.upsert({ where: { environment_userId_templateKey_eventKey: key }, create: { ...key, status: 'pending' }, update: {} });
  // A crashed sender has an ambiguous SMTP result. Preserve evidence for Admin review.
  if (row.status === 'sending' && row.leaseUntil && row.leaseUntil < now) {
    await prisma.notificationEmailDelivery.updateMany({ where: { id: row.id, status: 'sending', leaseUntil: { lt: now } }, data: { status: 'uncertain', outcome: 'Sender interrupted; verify delivery before retrying' } });
    return;
  }
  if (!['pending','failed'].includes(row.status) || (row.retryAt && row.retryAt > now)) return;
  const lease = new Date(+now + 120_000);
  const claimed = await prisma.notificationEmailDelivery.updateMany({ where: { id: row.id, status: row.status, attempts: row.attempts }, data: { status: 'sending', attempts: { increment: 1 }, leaseUntil: lease } });
  if (!claimed.count) return;
  const finish = (status: string, outcome: string, retryAt: Date | null = null) => prisma.notificationEmailDelivery.updateMany({ where: { id: row.id, status: 'sending', leaseUntil: lease }, data: { status, outcome, retryAt, leaseUntil: null } });
  let smtpStarted = false;
  try {
    // Re-evaluate immediately before delivery, not from the scheduled job's snapshot.
    const [access, current, preferences, templates] = await Promise.all([
      getProAccess(userId), prisma.signupTrial.findUnique({ where: { userId }, include: { user: true } }), getAppPreferences(userId), loadRuntimeNotificationTemplates(environment),
    ]);
    const template = templates.find(t => t.key === 'signup-trial' && t.enabled && t.email && !t.archived);
    if (!current || trialMilestone(current, new Date()) !== stage) { await finish('skipped','Milestone is no longer current'); return; }
    if (access.hasPaidSubscription) { await finish('skipped','Verified paid access'); return; }
    if (!current.user.verified || !notificationAllowed('signup-trial', preferences.notifications, 'email') || !template) { await finish('skipped','Recipient or notification preferences do not permit delivery'); return; }
    if (environment !== 'production') { await finish('skipped','No customer email delivery outside production'); return; }
    const notice = signupTrialNotice(current, stage, access.planTier);
    const values = notificationValues(notice);
    const message = signupTrialEmail(renderNotificationText(template.emailSubject, values), renderNotificationText(template.emailBody, values), values.actionUrl);
    if (!process.env.ZOHO_SMTP_PASSWORD) { await finish('failed','SMTP not configured',new Date(Date.now()+3_600_000)); return; }
    smtpStarted = true;
    await sendNotificationMail(current.user.email, message.subject, message.text, message.html);
    await finish('accepted','SMTP accepted');
  } catch (error) {
    const rejection = error as { responseCode?: number };
    if (smtpStarted && rejection?.responseCode && rejection.responseCode >= 500) { await finish('rejected','SMTP rejected delivery; manual review required'); return; }
    const retry = !smtpStarted || retryableTrialMailFailure(error);
    await finish(retry ? 'failed' : 'uncertain', retry ? 'Delivery rejected before acceptance; retry scheduled' : 'Delivery result uncertain; inspect before retry', retry ? new Date(Date.now()+Math.min(360,5 * 2 ** Math.min(row.attempts,6))*60_000) : null);
  }
}

/** Entitlement expiry is independent of notices, preferences, SMTP and client activity. */
export async function sweepSignupTrials() {
  const now = new Date();
  const deadline = Date.now() + 110_000;
  const environment = getCurrentUserEnvironment();
  const expired = await prisma.signupTrial.findMany({ where: { user: { environment }, endsAt: { lte: now }, expiryProcessedAt: null }, orderBy: { endsAt: 'asc' }, take: 100 });
  let processed = 0;
  for (const trial of expired) {
    if (Date.now() > deadline) break;
    // This refresh reuses downgrade handling and queues provider-confirmed revocation.
    const tier = await refreshProAccess(trial.userId);
    // A previous run may have saved the tier before bank-queue persistence failed.
    // Reconcile even when refresh sees no tier change; only then finish expiry.
    await enforceBankAllowance(trial.userId, tier);
    await prisma.signupTrial.updateMany({ where: { id: trial.id, expiryProcessedAt: null }, data: { expiryProcessedAt: new Date() } });
    processed++;
  }
  // Cursor rotates over the current notice window; a large signup cohort cannot starve later users.
  const cursorKey = `${environment}:signup-trial`;
  const cursor = await prisma.notificationDispatchCursor.upsert({ where: { environment: cursorKey }, create: { environment: cursorKey }, update: {} });
  const candidates = await prisma.signupTrial.findMany({ where: { user: { environment }, revokedAt: null, endsAt: { gt: new Date(+now-TRIAL_DAY_MS), lte: new Date(+now+7*TRIAL_DAY_MS) }, id: { gt: cursor.userId } }, orderBy: { id: 'asc' }, take: 50 });
  let noticeCandidates = 0;
  for (const trial of candidates) {
    if (Date.now() > deadline - 35_000) break;
    await deliverTrialNotice(trial.userId);
    noticeCandidates++;
  }
  await prisma.notificationDispatchCursor.update({ where: { environment: cursorKey }, data: { userId: noticeCandidates > 0 && (noticeCandidates < candidates.length || candidates.length === 50) ? candidates[noticeCandidates-1].id : '' } });
  return { expired: processed, noticeCandidates };
}
