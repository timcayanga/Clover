# Clover

Clover is a personal finance web application focused on importing financial files, deterministically parsing transactions, reviewing uncertain results, and learning from confirmed user edits.

The production application lives in [`web/`](web/). The root package only provides convenient workspace commands.

## Start Here

```bash
npm install
npm run dev
```

The web app starts with the scripts and environment configuration in [`web/package.json`](web/package.json).

## Repository Map

| Path | Responsibility |
| --- | --- |
| `web/app/` | Next.js routes, pages, layouts, and API handlers |
| `web/components/` | Reusable client and server UI components |
| `web/lib/` | Domain logic, authorization, parsing, data access, and shared utilities |
| `web/workers/` | Background import processing |
| `web/prisma/` | Database schema, migrations, and seed data |
| `web/scripts/` | Regression checks, parser QA, and operational scripts |
| `assets/` | Canonical source for images and other product assets |
| `docs/` | Product, security, and institution-specific parser rules |
| `legacy/electron-prototype/` | Archived pre-web desktop prototype; not deployed |

`web/public/assets/` is generated from `assets/` before development and production builds. Do not edit or commit the generated copy.

## Financial Data Flow

```text
source file
  -> raw import file and traceability metadata
  -> deterministic institution parser
  -> parsed rows with confidence and reasons
  -> normalized transactions
  -> review queue for uncertain results
  -> confirmed transactions and learned merchant rules
```

The core implementation is intentionally separated:

- `web/lib/import-parser.ts` detects and parses supported document formats.
- `web/workers/import-processor.ts` coordinates durable background processing.
- `web/lib/data-engine.ts` normalizes, categorizes, and learns from confirmed data.
- `web/lib/merchant-labels.ts` contains durable merchant-title normalization rules.
- `web/prisma/schema.prisma` defines raw, parsed, normalized, and learned data stages.

Read the relevant `docs/*-parser-rules.md` file before changing an institution parser.

## Safety Rules

- Never overwrite confirmed financial data.
- Preserve raw source files and parsed payloads for traceability.
- Prefer deterministic parsing before AI fallback.
- Keep raw descriptions separate from normalized display values.
- Update confidence, reason, and review state together.
- Add or update a regression script whenever parser behavior changes.

## Useful Commands

```bash
npm run build
npm run typecheck
npm run qa:critical
npm run qa:data-engine
npm run qa:browser
```

Additional parser and feature-specific checks are listed in [`web/package.json`](web/package.json).

## Deployment

Vercel builds the `web` workspace. Staging uses the `staging` Git branch and production is served at `clover.ph`.

