# Team PostHog reports

Team → Web Behavior Analyst / Analytics Quality Reviewer provides editable standing instructions, saved briefs, assignment execution and saved reports. Existing-owner instructions fall back to role defaults. Open a completed report to ask a question/request a revision, review history or approve it. Approved reports can be handed to another agent. All reports remain owner-scoped and pending review on import.

On-demand website assignments capture a bounded aggregate PostHog snapshot using existing `POSTHOG_PERSONAL_API_KEY`, `POSTHOG_PROJECT_ID` and `POSTHOG_APP_URL` server settings. It covers two complete Saturday–Friday Manila weeks, clover.ph pageviews, desktop/mobile device breakdown and distinct identifiers; it does not claim complete funnels or native coverage. Missing credentials or failed queries become explicit unavailable evidence. No arbitrary owner-supplied SQL is executed. The weekly local coordinator remains responsible for the deeper digest/funnel/retention review.

## Coordinator delivery bridge

After producing the real weekly Business analysis and independent measurement-quality review, create one JSON payload for each role:

```
{"agent":"web-analyst","reportKey":"posthog-2026-11-21-v1","title":"Weekly PostHog — week ending 20 November 2026","markdown":"Full actual report with dates, definitions, sources, gaps and recommendations"}
```

The other agent ID is `analytics-reviewer`; its content must be the actual reviewer assessment, not fabricated completion. Keep each report key stable on retries. Changed content requires an explicitly new revision key; existing reports are immutable. Do not truncate the full report (limit 100,000 characters; split larger reports into explicitly numbered parts).

Use the report-only token in the private local file `/Users/TimCayanga1/.codex/automations/clover-daily-quality-report/team-report.env` (mode 0600). The matching production Vercel secret is `CLOVER_TEAM_REPORT_TOKEN`. Never print or commit it. From `web/`, use the supported Node runtime:

```
node --env-file=/Users/TimCayanga1/.codex/automations/clover-daily-quality-report/team-report.env --import tsx scripts/team-report-import.ts /absolute/path/to/report.json
```

The CLI posts only to `https://team.clover.ph/api/team/reports/ingest`, refuses redirects, validates a content-hash receipt and returns the saved report URL. The production-only endpoint verifies its scoped bearer and resolves the single verified hello@clover.ph owner through Clerk. It can only import these two report types; it cannot read customer finances, start model execution or approve reports. No production database credentials or browser cookies are needed locally.

Keep the returned ID/hash/URL as a website-specific receipt. Identical report-key retries return the existing report; changed content with the same key is a conflict. If the endpoint, owner verification or token is unavailable, mark website delivery pending and continue email/Agents delivery. No duplicate automation is needed. Rotate/revoke the production secret and local file together if access changes.

An authenticated same-origin `POST /api/team/reports` accepts the same payload and derives owner from the Clerk session. The role dialog also offers “Save an existing weekly report” for manual pasting. Neither route bypasses approval or starts a paid model run.
