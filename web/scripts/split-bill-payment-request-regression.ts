import assert from "node:assert/strict";
import { paymentRequestSchema } from "../lib/split-bill-payment-request-schema";
const payload = {
  recipientParticipantId: "bea",
  payeeParticipantId: "alex",
  amount: "450.00",
  paymentProfileId: "gcash",
};
for (const recipientEmail of [undefined, null, "", "   "]) {
  const result = paymentRequestSchema.parse({ ...payload, recipientEmail });
  assert.equal(result.paymentProfileId, "gcash");
  assert.equal(result.amount, "450.00");
  assert(
    !result.recipientEmail,
    "Messaging requests must not require an email.",
  );
}
assert.equal(
  paymentRequestSchema.parse({
    ...payload,
    recipientEmail: " bea@example.com ",
  }).recipientEmail,
  "bea@example.com",
);
assert(
  !paymentRequestSchema.safeParse({
    ...payload,
    recipientEmail: "not an email",
  }).success,
);
assert(
  !paymentRequestSchema.safeParse({ ...payload, recipientParticipantId: "" })
    .success,
);
assert(
  !paymentRequestSchema.safeParse({ ...payload, note: "x".repeat(241) })
    .success,
);
console.log(
  "Payment request validation: email optional for sharing, nonempty invalid addresses rejected, saved option preserved.",
);

import {
  mobileSplitBillInput,
  mobileSplitBillPayload,
} from "../lib/mobile-together-input";
const receipt = {
  fileName: "dinner.pdf",
  mimeType: "application/pdf",
  storageKey: "split-bill-receipts/demo/receipt",
  text: "RAW COFFEE 150 PASTA 450 SERVICE 60",
  confidence: 85,
  items: [
    { description: "COFFEE", amount: "150" },
    { description: "PASTA", amount: "450" },
  ],
};
const dinner = {
  title: "Dinner",
  note: "",
  billDate: "2026-09-30",
  currency: "PHP",
  total: "660",
  participants: [{ name: "Alex" }, { name: "Bea" }],
  paidByIndex: 0,
  receipt,
  reviewedItems: [
    { description: "Coffee", amount: "150" },
    { description: "Pasta", amount: "450" },
    { description: "Service charge", amount: "60" },
  ],
};
const converted = mobileSplitBillPayload(mobileSplitBillInput.parse(dinner));
assert.equal(
  converted.items.length,
  3,
  "Review must preserve assignable items rather than collapsing to a total.",
);
assert.deepEqual(converted.rawPayload?.receipt, {
  text: receipt.text,
  items: receipt.items,
  confidence: 85,
});
assert.equal(
  converted.items.reduce((sum, item) => sum + Number(item.amount), 0),
  660,
);
assert.equal(converted.payments[0].amount, "660");
assert(converted.items.every((item) => item.participantIds.length === 2));
assert(
  !mobileSplitBillInput.safeParse({
    ...dinner,
    reviewedItems: dinner.reviewedItems.slice(0, 2),
  }).success,
  "Missing service charge cannot silently be lost.",
);
assert(
  !mobileSplitBillInput.safeParse({
    ...dinner,
    reviewedItems: [{ description: "Bad", amount: "NaN" }],
  }).success,
);
assert.equal(
  mobileSplitBillPayload(
    mobileSplitBillInput.parse({ ...dinner, reviewedItems: undefined }),
  ).items.length,
  1,
  "Old clients keep their explicitly confirmed total behavior.",
);
console.log(
  "Receipt review: line items retained, totals reconciled, raw extraction untouched, old clients compatible.",
);

import {
  paymentRequestAmounts,
  paymentOptionLabel,
} from "../../shared/payment-request-amount";
assert.deepEqual(
  paymentRequestAmounts({ amount: "900" }, "PHP"),
  { amount: 900, currency: "PHP", billAmount: 900, billCurrency: "PHP" },
  "Existing clients retain same-currency behavior",
);
const agreed = paymentRequestAmounts(
  { amount: "16", currency: "USD", billAmount: "900" },
  "PHP",
);
assert.equal(agreed.amount, 16);
assert.equal(
  agreed.billAmount,
  900,
  "USD payment settles the agreed PHP amount, never USD 16 interpreted as PHP 16",
);
assert.throws(() =>
  paymentRequestAmounts({ amount: "16", currency: "USD" }, "PHP"),
);
assert.throws(() =>
  paymentRequestAmounts(
    { amount: "16", currency: "USD", billAmount: "900", billCurrency: "IDR" },
    "PHP",
  ),
);
assert.throws(() =>
  paymentRequestAmounts(
    { amount: "16", currency: "PHP", billAmount: "900" },
    "PHP",
  ),
);
for (const amount of ["", "0", "-1", "NaN", "Infinity"])
  assert.throws(() => paymentRequestAmounts({ amount }, "PHP"));
assert.equal(paymentOptionLabel("BPI", "BPI"), "BPI");
assert.equal(paymentOptionLabel("BPI", "Personal"), "BPI · Personal");
console.log(
  "Agreed foreign-currency requests preserve original bill amounts, reject missing/changed mapping, and de-duplicate bank labels.",
);

// Exercise the real HTTP handlers with isolated persistence; no customer records.
import { build } from "esbuild";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
async function requestRouteRegression() {
  const fixture = readFileSync(
    resolve("scripts/fixtures/payment-request-route.txt"),
    "utf8",
  );
  const bundle = await build({
    stdin: {
      contents: `export {POST} from './app/api/split-bills/[billId]/payment-requests/route';export {PATCH} from './app/api/split-bills/[billId]/payment-requests/[requestId]/route';export {requests,settlements,changeBillCurrency} from 'fixture';`,
      resolveDir: process.cwd(),
    },
    bundle: true,
    platform: "node",
    format: "cjs",
    packages: "external",
    write: false,
    plugins: [
      {
        name: "isolated-payment-requests",
        setup(b) {
          b.onResolve(
            {
              filter:
                /^(fixture|@\/lib\/(prisma|split-bill-access|split-bill-loaders|split-bill-transfer-settlements|split-bill))$/,
            },
            () => ({ path: "fixture", namespace: "fixture" }),
          );
          b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            contents: fixture,
            loader: "ts",
            resolveDir: process.cwd(),
          }));
        },
      },
    ],
  });
  const mod = { exports: {} as any };
  new Function("require", "module", "exports", bundle.outputFiles[0].text)(
    createRequire(resolve("package.json")),
    mod,
    mod.exports,
  );
  const api = mod.exports;
  const post = (data: any) =>
    api.POST(
      new Request("https://clover.test", {
        method: "POST",
        body: JSON.stringify({
          recipientParticipantId: "bea",
          payeeParticipantId: "alex",
          ...data,
        }),
      }),
      { params: Promise.resolve({ billId: "bill" }) },
    );
  const body = {
    amount: "16",
    currency: "USD",
    billAmount: "900",
    paymentProfileId: "usd",
  };
  const created = await post(body);
  assert.equal(created.status, 201);
  assert.equal((await created.json()).request.currency, "USD");
  assert.equal(api.requests[0].billAmount, "900.00");
  assert.equal((await post(body)).status, 200);
  assert.equal(api.requests.length, 1, "Retry reuses the same request");
  assert.equal(
    (await post({ amount: "1", currency: "PHP" })).status,
    400,
    "Reserved bill amount is PHP 900, not USD 16",
  );
  const patch = (status: string) =>
    api.PATCH(
      new Request("https://clover.test", {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
      { params: Promise.resolve({ billId: "bill", requestId: "r0" }) },
    );
  api.changeBillCurrency("IDR");
  assert.equal((await patch("paid")).status, 400);
  assert.equal(
    api.settlements.length,
    0,
    "Changing bill currency must not reinterpret an existing request",
  );
  api.changeBillCurrency("PHP");
  assert.equal((await patch("paid")).status, 200);
  assert.equal(api.settlements[0].amount, "900.00");
  assert.equal((await patch("paid")).status, 200);
  assert.equal(
    api.settlements.length,
    1,
    "Confirmation retry must not duplicate the settlement",
  );
  assert.equal(
    (await patch("requested")).status,
    400,
    "Recorded payment cannot be reopened",
  );
  console.log(
    "Real payment-request routes: agreed currency, original balance reservation, safe retry, original-currency settlement and immutable paid state passed.",
  );
}
void requestRouteRegression().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
