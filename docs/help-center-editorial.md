# Help Center, Guides, and editorial workflow

## Public experience

- `/help`: search across articles and guides; nine task-oriented topic cards.
- `/help/[section]`: grouped article directories; old category URLs redirect.
- `/help/[section]/[article]`: original article URLs remain available; aliases have one canonical destination.
- `/guides` and `/guides/[slug]`: six initial practical guides, including officially sourced BPI, GCash, and Metrobank download guidance checked on September 6, 2026.
- Public pages use the landing header/footer, familiar photography, existing product icons, and actual Clover UI captures with fictional data. No promotional hero headline, scroll pinning, or animated backgrounds.
- Article bodies use readable text, contents navigation, expandable questions, source links, screenshot enlargement, and helpfulness feedback. Shared mobile navigation now traps keyboard focus and restores it on close.
- Metadata and the sitemap reference published canonical URLs only. Drafts never enter public response props. Next.js can emit a streamed not-found response with HTTP 200 plus `noindex`; tests check the not-found marker and absence of draft text, not only the status code.

## Storage and migrations

Additive migrations `20260906120000_knowledge_editorial` and `20260906121000_knowledge_feedback` create editorial tables only. All have RLS enabled and no anonymous policies. Existing application database credentials must have the same server-side access as other app tables.

Public content starts from the bundled collection in `knowledge-seed.ts`. Approved database snapshots override it. Local previews without a configured database can use the bundled collection alone. Configured deployments fail closed during storage outages so an archived or superseded bundled article cannot reappear; a retry screen is shown. Admin reports an error and never pretends a write succeeded.

The normal Vercel prebuild migration step applies migrations to the deployment's isolated database. Staging content and approvals belong to staging; they are not automatically transferred to production.

## Admin → Content

- Edit or create Help articles/FAQs and Guides. Import `.md` or `.txt` up to 100 KB; use `# Title` and `## Section heading`. HTML is displayed as text, never executed. DOCX/PDF ingestion is not implemented.
- Add sections, questions, official sources, an optional source-review date, audience, and a real sample-screen selection with alternative text.
- Save a draft, preview it, confirm the review checkbox, and approve the saved version. Published text and ordering do not change on draft save.
- URLs are immutable after creation to preserve links. Moving an article to a different category does not break its URL.
- Rearrange categories with accessible move controls; set article display order in the editor. Lower order values appear first.
- Archive/restore is recoverable. Revision history can load an earlier version as a new draft requiring fresh approval.
- Optimistic version checks and a transaction prevent stale approvals and lost concurrent edits. All content APIs enforce Admin authorization and same-origin mutations.
- Article feedback is aggregated in Admin. A random article-specific browser token prevents duplicate votes; no user ID, IP address, raw search query, or financial record is stored. Feedback is directional, not an abuse-resistant voting system.

## AI drafting

AI is paused by default. Configure in Admin → Content → AI drafting after reviewing the editorial rules.

Requirements: `OPENAI_API_KEY`, `CRON_SECRET`, and optionally `CLOVER_CONTENT_MODEL` (default `gpt-4.1-mini`). Use a provider/project spending cap in addition to the app's attempt and token limits.

- Production cron checks `/api/cron/content-drafts` daily; Vercel preview deployments do not run cron. Admin's manual check follows the same cadence and limits.
- Default cadence: one attempt every three days, eight attempts per month, maximum eight articles awaiting review. Failed attempts also count; no automatic paid retry loop.
- Every request has at most two web-search tool calls and 4,000 output tokens. Search domains are limited to Clover, BPI, Metrobank, and GCash official domains. Expand the list only when reviewing a new supported institution.
- The model receives approved topics and public Help summaries, never customer financial records. Every draft must include approved-domain sources and review notes. Sources still require human verification; an allowed URL is not proof that every claim is correct.
- A database lock and daily reservation prevent duplicate concurrent generation. Completed topics are skipped until new topics are configured. Generations only create unpublished review items and provenance records; no generation path can publish.
- The queue shows failures, review notes, and usage. Pausing prevents future attempts; an already-running attempt may finish as an unpublished draft.
- This first version uses an editor-maintained topic list. Search Console integration, automatic topic discovery, live source-change monitoring, a dollar-denominated in-app budget, and automatic article refresh proposals are not included. Do not represent them as active features.

## Verification

- `npm --prefix web run qa:knowledge`: seed validation, existing links, search, source/image paths, and generation bounds. Included in `qa:prepush` and therefore CI.
- `node web/scripts/verify-knowledge.mjs`: requires a local disposable editorial database/server; tests draft/publish isolation, approval, stale and concurrent edits, history, archive/restore, origin checks, cron auth, 42 responsive combinations, and 200% text enlargement.
- `NODE_OPTIONS=--conditions=react-server npx tsx scripts/knowledge-ai-local-regression.ts`: only accepts the named disposable local database. Provider is mocked; tests pause/cadence controls, bounded requests, unpublished snapshots, and provenance. It never sends a real provider request.
- Manual/automated browser checks: direct article search and navigation, feedback persistence, keyboard menu focus/Escape, and WCAG A/AA axe scans for home, article, and Admin editor. Automated checks do not replace assistive-technology testing.

## Editorial sources

- BPI: https://www.bpi.com.ph/about-bpi/sustainability/sustainable-with-you/products-and-services/e-statement
- GCash: https://help.gcash.com/hc/en-us/articles/360034155433-How-to-request-transaction-history
- Metrobank: https://www.metrobank.com.ph/help/accounts-and-banking-services/statements-of-account?faq=where_can_i_view_my_statements_of_account_soas
- OpenAI web search API: https://developers.openai.com/api/docs/guides/tools-web-search
