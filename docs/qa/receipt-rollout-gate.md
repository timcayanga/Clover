# Receipt rollout gate

Before promoting receipt parser or upload changes, run the gate for the exact candidate release:

```sh
node scripts/receipt-rollout-gate.mjs <release> <speed.json> <verified-blind-score.json>
```

Run this from `web/`. An exit status of 1 holds the receipt rollout. Require both sets of evidence from the candidate, including all enabled platforms and routes. The proposed initial thresholds are:

- At least 30 accepted images per platform. On each of iOS, Android, mobile web and desktop web, at least 90% must show a transaction within 10 seconds on the first attempt. Unresolved, failed, canceled and review-required attempts remain in the denominator. A later successful retry does not replace the first outcome.
- At least 30 fully labeled held-out photos for each required route. At least 95% must automatically extract all four core fields exactly. Each individual core field must also reach 95%. Use the existing `receipt-photo-route-accuracy.ts --claim` verifier with the frozen blind corpus, diagnostic corpus, exposure inventory and candidate run. A route with missing or unavailable results blocks the gate. A simulator OCR probe can diagnose issues but cannot substitute for a required on-device route.
- Keep the scorer's item completeness, false positives and review rates with the release evidence. The gate's numeric thresholds apply to core receipt fields. Review meaningful item regressions before promotion.

Use `receipt-first-attempt.hogql` to tally the candidate's accepted cohort. Restrict the export to the candidate's release or verified isolated rollout cohort before creating `speed.json`, with `release` and a `platforms` array of objects containing `platform`, `acceptedImages`, and `visibleWithin10s`. Mixed releases and synthetic smoke tests cannot qualify. Keep the query window and cohort definition alongside the export.

## Weekly review

Run `receipt-slow-tail-weekly.hogql` on Clover production. The seven-day cohort ends one day before the query so abandoned scans have had time to resolve. Report first-attempt counts, visible within 10 seconds, and the slowest or failing cohorts by platform, parser route, OCR evidence quality, and the largest measured server stage. Also report how many scans lack server attribution and flag small cohorts. The server stage is diagnostic and does not partition the entire client duration, which also includes transfer, polling, and rendering. Keep raw images, OCR text, payment details and account identifiers out of the report.

When choosing fixes, replay a small set of slow or failed cases using approved labeled fixtures. Keep production decisions separate from local timing and blind extraction accuracy.
