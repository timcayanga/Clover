# Paddle Plus / Pro configuration

Updated 24 September 2026. Public PHP prices remain Plus ₱169 / ₱1,259 and Pro ₱349 / ₱2,999. Paddle charges Philippine customers in USD until a PHP payment provider is available. The subscription screen discloses the selected USD charge before checkout.

| Plan | Global monthly / annual | Philippines monthly / annual |
| --- | --- | --- |
| Plus | USD 7.99 / 59.99 | USD 2.69 / 19.99 |
| Pro | USD 12.99 / 99.99 | USD 5.99 / 49.99 |

## Vercel mapping

Use the same key names with environment-specific values. Preview overrides are scoped to `staging`. Production values do not take effect until a production deployment containing this integration.

| Variable | Preview / staging (sandbox) | Production (live) |
| --- | --- | --- |
| `PADDLE_PLUS_MONTHLY_PRICE_ID` | `pri_01m38seffh7ybcsn29n2ph3sg8` | `pri_01m38tw9q0b3zr3kc6m6ffbt19` |
| `PADDLE_PLUS_ANNUAL_PRICE_ID` | `pri_01m38sfr2q9jznwe0ew6tz8a2n` | `pri_01m38txf86458pf1dp9bqsb2ve` |
| `PADDLE_PRO_MONTHLY_PRICE_ID` | `pri_01kysj2ttkfgsxx5h5d27wkzpd` | `pri_01kysm46x9fyt7vetvnk66mc3m` |
| `PADDLE_PRO_ANNUAL_PRICE_ID` | `pri_01kysj480s5fjggfp2cp10jtp5` | `pri_01kysm4mb2k0zgync87j4jdsc2` |
| `PADDLE_PLUS_PRODUCT_ID` (optional) | `pro_01m38sc31r9megv9pt3k3yr6c9` | Not required; price IDs identify the tier |
| `PADDLE_PRO_PRODUCT_ID` (optional) | `pro_01kyshzb7darv8p35shb06kj7p` | Not required; price IDs identify the tier |
| `PADDLE_ENV` | `sandbox` | `live` |

`PADDLE_API_KEY`, `PADDLE_CLIENT_TOKEN`, and `PADDLE_WEBHOOK_SECRET` retain their existing generic names and environment-specific values. API keys must be able to read prices. Secrets must never be committed or put in public variables.

## Safe transition

- The owner confirmed there are no live subscribers. The previous Paddle Pro product has been repriced for the current Pro tier; the newly created product is Plus.
- Stored Clover tier `pro` remains Plus. Stored tier `premium` is the current Pro. Verified price IDs, not product display names or client custom data, determine entitlements.
- Explicit tier configuration disables all generic price-ID fallbacks. Duplicate configured IDs fail closed. Optional product IDs are enforced when configured.
- Legacy-only configuration is supported for deployments that have not adopted the new catalog. Leave the generic variables in Vercel during rollout; do not change them to new meanings or remove them before production migration is verified.
- Do not start a second checkout when an existing subscription is active/pending/suspended. Use subscription management instead. This change does not implement an automatic paid-plan upgrade or alter existing charges.
- Cancellation retains the purchased tier for verified remaining paid-through time; access expires normally.
- Sandbox prices, currencies, country overrides, intervals, active state and absence of trials were verified against Paddle's read API. Live IDs/amounts are owner-provided; live API verification remains pending because the exported production API key was not readable locally. This is not evidence of a broken production key.
- Deploy and verify staging first. Production deployment is a separate rollout; configuring the live variables does not publish the code.

## Checks

`npm --prefix web run qa:billing-lifecycle` includes tier/price validation, verified offer generation, environment isolation and actual webhook-handler tests with mocked storage. `npm run qa:prepush` runs this plus the full release gate.
