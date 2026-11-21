# Team PostHog reports

Team → Web Behavior Analyst / Analytics Quality Reviewer provides editable standing instructions, saved briefs, assignment execution and saved reports. Existing-owner instructions fall back to role defaults. Open a completed report to ask a question/request a revision, review history or approve it. Approved reports can be handed to another agent. All reports remain owner-scoped and pending review on import.

On-demand website assignments capture a bounded aggregate PostHog snapshot using existing `POSTHOG_PERSONAL_API_KEY`, `POSTHOG_PROJECT_ID` and `POSTHOG_APP_URL` server settings. It covers two complete Saturday–Friday Manila weeks, clover.ph pageviews, desktop/mobile device breakdown and distinct identifiers; it does not claim complete funnels or native coverage. Missing credentials or failed queries become explicit unavailable evidence. No arbitrary owner-supplied SQL is executed. The weekly local coordinator remains responsible for the deeper digest/funnel/retention review.

## Coordinator delivery bridge

After producing the real weekly Business analysis and independent measurement-quality review, create one JSON payload for each role:

```
{"agent":"web-analyst","reportKey":"posthog-2026-11-21-v1","title":"Weekly PostHog — week ending 20 November 2026","markdown":"Full actual report with dates, definitions, sources, gaps and recommendations"}
```

The other agent ID is `analytics-reviewer`; its content must be the actual reviewer assessment, not fabricated completion. Keep each report key stable on retries. Changed content requires an explicitly new revision key; existing reports are immutable. Do not truncate the full report (limit 100,000 characters; split larger reports into explicitly numbered parts).

With securely loaded and environment-verified Clerk/database credentials for the destination, run from `web/`:

```
CLOVER_TEAM_REPORT_DESTINATION=production npx tsx scripts/team-report-import.ts /absolute/path/to/report.json
```

The CLI requires a matching Clerk key mode and database environment marker before writing. It finds the single verified hello@clover.ph identity in that Clerk instance, saves only Team state/assignment/audit tables and returns `{id,href,duplicate}`. It does not use customer financial tables, model generation or email. Never print credentials or reuse staging identity IDs in production. Verify the saved report through the owner-authenticated Team page and save a destination-specific receipt before marking website delivery complete. When credentials/session are unavailable, report website delivery as blocked and continue the already-authorized Business email/Agents destinations. No duplicate automation is needed.

An authenticated same-origin `POST /api/team/reports` accepts the same payload and derives owner from the Clerk session. The role dialog also offers “Save an existing weekly report” for manual pasting. Neither route bypasses approval or starts a paid model run.
