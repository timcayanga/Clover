# Admin notification management

## Scope

`/admin/notifications` manages Clover-owned templates, not historical emails or
a marketing mailing list. The Admin navigation links to this page. It includes:

- Fourteen existing notification triggers, with original dynamic wording and
  destinations preserved by default.
- Create, view, update, pause, delete (archive), restore, search, and channel filters.
- In-app and/or email delivery; separate content for each channel.
- Fictional previews, supported-placeholder validation, optimistic version checks,
  and atomic before/after audit records.
- Latest 50 audit entries and daily-email delivery statuses.

New templates start paused in the UI and attach to one of the existing activity
triggers. Adding a template does not invent a new product event, change financial
data, or send a broadcast. Creating arbitrary audience campaigns and a manual
send-to-all control are deliberately not included.

## Existing messages

The catalog covers import processing/failure/completion, upload reminders,
transaction review, account reconciliation, upcoming/overdue payments, budget
alerts, Circle invitations/activity, Split Bills payment states, dividends,
investment maturity, and subscription attention notices.

Clerk authentication/verification/password emails and billing-provider receipts
remain externally managed and are labeled accordingly. Support contact and
bug-report emails go to Clover staff and are not user notification templates.

## Delivery

In-app notifications retain their source IDs, priorities, destination checks,
read markers, and dismissal markers. Custom variants get an additional stable
template key. Archived system overrides stay stored so defaults cannot reappear
after deletion. A schema-not-yet-installed rollout fallback preserves existing
notifications; other database failures do not silently re-enable paused messages.

Circle invitation email is still immediate, via the existing Zoho SMTP service.
Turning off that channel returns `emailSent: false`, leaving the secure share
link available. Email content must retain the invitation URL placeholder.
Provider credentials and HTML are never editable in Admin. Template text is
rendered as plain text, including in previews; subjects have newlines removed.

Other email-enabled templates participate in a daily **transactional digest** at
01:00 UTC (approximately 09:00 Manila time). It evaluates current notification
candidates for verified, real production users without requiring them to open
the app. It is not an instant event stream: a short-lived condition that clears
before the daily scan is not emailed. Enabling/re-enabling email records a start
time and does not backfill older candidates. Runtime-derived budget conditions
are evaluated at scan time. Changing content does not resend an existing event.

Each run scans at most 100 users or about 200 seconds, retaining a cursor for the
next run. Each user receives at most 10 newly eligible items per run in one email
with subject “Your Clover notifications”; each template's subject is its digest
heading. Larger installations will need more frequent scheduling or a durable
queue before this bounded daily sweep is sufficient. No extra email channels are
enabled by default: only the pre-existing immediate Circle invitations use email.

The cron checks `CRON_SECRET`, only sends from `VERCEL_ENV=production`, and uses a
database lease against overlapping runs. A unique user/template/event claim
prevents repeat sends. SMTP has no reliable exactly-once delivery primitive:
ambiguous failures are marked `uncertain` and are **not automatically retried**.
An interrupted `sending` row likewise needs investigation. `accepted` means SMTP
acceptance, not inbox delivery or an open. The ledger intentionally stores no
rendered financial content or recipient email addresses. Immediate invitation
sends retain their existing delivery reporting, separate from the daily ledger.

## Deployment and security

Apply `20260907090000_admin_notification_templates` before using the editor. All
four tables have RLS enabled and no Supabase Data API role grants. Admin reads and
mutations use the existing `requireAdminAuth` boundary; mutations also require a
trusted request origin. Configuration is production-scoped, matching Clover's
existing Admin control plane. Runtime feeds use the user's stored environment.

Existing `ZOHO_SMTP_*` credentials and `CRON_SECRET` are required for production
delivery. No Resend, RevenueCat, or additional provider is introduced. Deployment
registers the daily cron through `web/vercel.json`; previews do not send digests.

## Verification

- `npm --prefix web run qa:notification-admin`: executable real route and real
  delivery-function regressions with isolated in-memory storage and mocked SMTP.
  Tests CRUD, archive/restore, stale writes, channels, audit, origin/auth rejection,
  placeholders, no-backfill, deduplication, and ambiguous-send handling.
- Included in the root `qa:prepush`, also run by the GitHub quality gate.
- `cd web && npx tsx scripts/notification-admin-regression.ts --serve`: local-only
  browser harness using the real editor and route with fictional storage on
  port 8133. No credentials are read and no emails are sent.
- Browser checks covered create/save, channel changes, delete/restore, 320px,
  390px, 768px and desktop widths, plus 200% CSS zoom. No horizontal overflow
  or browser errors were observed in this isolated component harness.
- Live PostgreSQL migration/application, Clerk Admin login, production scheduler,
  and actual SMTP delivery require a controlled deployment smoke test. They were
  not tested against real users or production settings during development.
