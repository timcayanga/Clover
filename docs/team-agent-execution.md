# Team agent execution

Team → Distribution lead (or another role) → Open role & briefs → Save brief → Start assignment opens a permanent `/team/assignments/<UUID>` page. Each role executes only when the verified owner starts it. Review actions approve the exact saved result or create a separate revision with feedback; they never publish or delegate. The creator returns copy, visual directions, and scripts, not generated media files.

## Execution and ownership

- Uses the existing server-side `OPENAI_API_KEY` and Responses API background mode. Default model: `gpt-5.4-mini`; override with `CLOVER_TEAM_AGENT_MODEL` only after checking background, reasoning, and web-search compatibility. `CLOVER_TEAM_AGENTS_ENABLED=false` pauses new starts without preventing existing runs from finishing.
- Only the community researcher receives `web_search`, capped at three tool calls. No role receives customer-data, social-account, messaging, publishing, shell, or financial tools. Brief, saved standing instructions, and revision context are the only owner data sent to OpenAI. Outputs remain unapproved suggestions.
- Provider responses use `store: true` so polling can recover after closing the browser. This is ordinary Responses storage, not a zero-data-retention design; see OpenAI background-mode/data-control documentation. Do not put secrets or customer records in briefs.
- Reserves the run UUID before a paid request, snapshots its instructions, and serializes owner starts with a PostgreSQL transaction advisory lock. Unique trigger keys deduplicate repeated clicks. A revision has at most one child. Retries preserve the failed attempt's original prompt and feedback.
- Per owner: maximum three active assignments and twenty starts per UTC day, including failed attempts and retries. A run permits at most 6,000 output tokens. Ambiguous POST failures are recorded without automatic paid retries; the UI explains possible usage.
- Browser polling persists results. `/api/cron/team-assignments` also polls every five minutes after production promotion, authenticated with `CRON_SECRET`. Provider IDs remain server-side. Poll claims last thirty seconds, longer than the twenty-five-second provider timeout. Terminal results cannot be overwritten by late polls.
- Cancellation asks the provider to stop; usage already incurred may still be billed. If completion wins the race, the completed proposal is saved for review. A start interrupted before receiving a provider ID becomes failed after two minutes; it cannot be safely reattached automatically.
- Run and event tables are private, RLS-enabled, and inaccessible to Supabase public API roles. Owner authentication and same-origin mutation checks apply to every Team API. Approval is serialized with revision creation; the old result remains intact but is marked changes requested.
- Results show usage and estimated USD charges at uncached list prices ($0.75/M input, $4.50/M output, $0.01/search for the default model); unknown model overrides show usage without fabricated pricing. Prices are estimates, not billing records.

## Validation

Run `DATABASE_URL=postgresql://clover_test@127.0.0.1:55432/postgres npx tsx scripts/team-api-regression.ts --agents` from `web/`. Initialize only the two Team migrations in a disposable local PostgreSQL instance first. This exercises real routes/transactions with test-only Clerk and OpenAI adapters: auth/origin/payload checks, concurrent duplicate starts, limits, snapshots, completion and reload, revisions and approval invalidation, cancellation, ambiguous failure, background recovery, safe citations, tool permissions, and RLS. It refuses other database addresses.

Run `npm run typecheck` and the repository pre-push gate as well. Live verification must separately confirm the production API credential, background response, saved result, and browser revision flow; simulated provider tests do not establish those.

Official references: [Background mode](https://developers.openai.com/api/docs/guides/background), [GPT-5.4 mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini), [web search](https://developers.openai.com/api/docs/guides/tools-web-search), [pricing](https://developers.openai.com/api/docs/pricing).
