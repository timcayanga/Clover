# Quality-gate recovery — September 19, 2026

GitHub run [600](https://github.com/timcayanga/Clover/actions/runs/35452825138) failed during web TypeScript checking. The dependency installs, Prisma generation and high-risk dependency audits passed.

`shared/use-adviser-history.ts` imported React types from outside both independently installed application directories. A local parent `node_modules` masked the missing dependency; the clean GitHub runner correctly reported TS2307 and cascading implicit-any errors. This began with the shared Adviser history change in `6ccbbfc` after successful run587.

The shared factory now accepts a small structural hook contract. Each application still supplies its own React hooks, with no runtime behavior change or duplicate React installation. Both application's type checks verify their hook implementations satisfy the contract.

A new `qa:shared-boundaries` check type-checks all shared source with strict types and without resolving application/parent packages. It reproduces the original failure before the fix and passes afterward. It is part of root `qa:prepush`, which the existing GitHub workflow also executes, preventing local dependency leakage from hiding the same mistake again.

Verification: targeted shared check, web/native type checks and full pre-push gate; GitHub and staging deployment results will be recorded after the fix is pushed.
