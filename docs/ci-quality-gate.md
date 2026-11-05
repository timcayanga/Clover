# Clover quality gate

Every staging/main push and pull request runs the same root `npm run qa:prepush` command as the local hook. Security audits, parser and real-worker preservation tests, mobile checks and the production web build remain mandatory. A failed command must fail the job, including when output is piped to its diagnostic log.

The runner is pinned to Ubuntu 24.04. Upgrade its distribution deliberately rather than inheriting a change to `ubuntu-latest`. `web/scripts/ci-postgres.mjs` discovers a complete, executable PostgreSQL 16+ installation and exports its server-tool directory through `GITHUB_ENV`. It rejects incomplete or mixed-major toolchains and only reads version information. If tools are absent, the workflow installs the distribution's `postgresql` package and discovers the resulting version. It must not assume a particular versioned package or connect to a configured application database.

The parser release gate continues to create a fresh localhost-only database, refuses an occupied QA port and removes its disposable cluster. Discovery does not start the distribution's database or reuse developer/production data.

The CI job has a 90-minute upper limit: the complete historical source replay had outgrown the former 30-minute limit before reaching the final build. New pushes can still cancel superseded runs through the existing concurrency group; those cancellations are expected and do not establish a passing release. On failure, the workflow preserves its gate log as a seven-day Actions artifact. It does not suppress failures or disable notification settings.

`npm run qa:ci` covers supported and unsupported versions, missing/non-executable/mixed toolchains, explicit selection, spaced paths and environment-file safety. It is included in `qa:prepush` and also runs before dependency installation in GitHub.

## November 5, 2026 investigation

- The latest 12 failed runs all stopped at PostgreSQL setup, before the quality gate. The runner had moved to Ubuntu 26.04; the logged error was `Unable to locate package postgresql-16`. Representative run: https://github.com/timcayanga/Clover/actions/runs/41992051527.
- Older 30-minute cancellations were job timeouts. GitHub's annotation explicitly states that the maximum execution time was exceeded. Representative run: https://github.com/timcayanga/Clover/actions/runs/40848743495.
- Earlier real failures remain part of the history. The October 19 ledger snapshot-order failure was fixed by `8604baa4e` and followed by a successful run. The October 22 production audit failure was followed by the dependency fix and successful run `39878122814`. Keep those checks enabled.

Do not rerun all historical failures expecting new workflow behavior: those runs use their original commits. Verify a new run on the commit containing the fix and retain historical failures for traceability.
