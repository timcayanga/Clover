# Admin import retry worker setup

The web UI/API and guarded worker implementation are prepared. Persistent worker hosting and deployment have not been verified in this task. Publishing the web app on Vercel does not start this service.

## Deploy the existing worker service

1. Use the same approved release commit and Node/dependency versions as the web deployment. Install with `npm ci --prefix web`; generate Prisma using the existing installation scripts.
2. Apply the release migrations through the normal deployment process before starting the worker.
3. Configure the matching database, Redis, object storage, parser/provider credentials and environment-isolation settings privately on the worker host. Never copy staging credentials into a production service or vice versa.
4. Run `npm --prefix web run worker:imports` as a persistent service with restart policy, graceful termination and error logs. It subscribes to the regular import queue and the separate guarded Admin retry queue for its configured environment.
5. Keep the production queue names stable: `import-processing` and `import-processing-admin`. Staging uses `import-processing-staging` and `import-processing-staging-admin`. `NODE_ENV=production` alone selects production; staging also needs `VERCEL_ENV=preview` and the matching isolation configuration. Production uses `VERCEL_ENV=production`.
6. Configure `CLOVER_DEPLOYMENT_ENVIRONMENT`, `CLOVER_EXPECTED_DATABASE_PROJECT_REF`, `CLOVER_EXPECTED_R2_BUCKET` and the matching R2 bucket, database marker and provider modes. Do not disable the isolation checks to make startup pass.

Admin is currently the production control plane. Its bulk retry API targets the production queue and production-scoped records. A staging worker does not activate production Admin retries. Do not test this by retrying real customer files.

## Acceptance checks

- Confirm the updated worker registers on the intended guarded queue. Without it, Admin execution must report that the worker is offline.
- Use an isolated test environment and disposable failed import with retained source, zero transactions/checkpoints/confirmed rows, and no password requirement.
- Preview, execute once, observe the worker's version/eligibility check, and confirm the import enters the normal processing path.
- Change an import after preview and confirm it is skipped; verify that confirmed imports never qualify and no retry modifies confirmed records.
- Verify partial queued/skipped/failed outcomes, stale previews, duplicate submission and graceful worker restart.

The local fixture already verifies preview, actor binding, one-use execution, eligibility and offline/conflict handling with a mocked queue. It does not prove a hosted worker processed a file.
