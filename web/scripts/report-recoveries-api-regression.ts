import assert from "node:assert/strict";
import { GET, POST } from "../app/api/reports/recoveries/route";
const state = (globalThis as any).__recoveryFixture as {
  user: string;
  transactions: any[];
  links: any[];
  locks: number;
};
if (!state) throw Error("Run with the isolated report recoveries fixture.");
const record = (id: string, type: string, amount: number, extra = {}) => ({
  id,
  workspaceId: "profile-a",
  accountId: "a",
  date: new Date("2026-10-05T00:00:00Z"),
  createdAt: new Date(),
  amount,
  currency: "PHP",
  type,
  isTransfer: false,
  isExcluded: false,
  deletedAt: null,
  reviewStatus: "edited",
  merchantRaw: id,
  merchantClean: id,
  categoryId: "c",
  category: { id: "c", name: type === "expense" ? "Dining" : "Other" },
  account: {
    id: "a",
    name: "Bank",
    type: "bank",
    institution: "BPI",
    currency: "PHP",
  },
  transactionTags: [],
  ...extra,
});
state.transactions = [
  record("expense", "expense", 500),
  record("payment", "income", 300),
  record("other-payment", "income", 100),
  record("foreign", "income", 300, { workspaceId: "profile-b" }),
  record("ignored", "income", 100, { isExcluded: true }),
  record("transfer", "transfer", 100, { isTransfer: true }),
  record("dollar", "income", 100, { currency: "USD" }),
];
const snapshot = JSON.stringify(state.transactions);
const request = (
  body?: object,
  profile = "profile-a",
  origin = "https://clover.example",
  query = "",
) =>
  new Request(
    `https://clover.example/api/reports/recoveries?workspaceId=${profile}&${query}`,
    {
      method: body ? "POST" : "GET",
      headers: { origin, "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
  );
const link = {
  action: "create",
  expenseId: "expense",
  incomingId: "payment",
  kind: "refund",
  amount: 200,
};
async function main() {
  assert.equal((await POST(request(link, "profile-b"))).status, 400);
  assert.equal(
    (await POST(request(link, "profile-a", "https://evil.example"))).status,
    400,
  );
  assert.equal(
    (await POST(request({ ...link, incomingId: "foreign" }))).status,
    409,
  );
  assert.equal(
    (await POST(request({ ...link, incomingId: "ignored" }))).status,
    409,
  );
  assert.equal(
    (await POST(request({ ...link, incomingId: "transfer" }))).status,
    409,
  );
  assert.equal(
    (await POST(request({ ...link, incomingId: "dollar" }))).status,
    409,
  );
  assert.equal((await POST(request({ ...link, amount: 500 }))).status, 409);
  assert.equal((await POST(request({ ...link, amount: 0 }))).status, 400);
  assert.equal((await POST(request({ ...link, amount: 1.001 }))).status, 400);
  const concurrent = await Promise.all([
    POST(request(link)),
    POST(request(link)),
  ]);
  assert.deepEqual(concurrent.map((r) => r.status).sort(), [200, 409]);
  assert.equal(state.links.length, 1);
  const found = await (
    await GET(
      request(
        undefined,
        "profile-a",
        "https://clover.example",
        "type=income&currency=PHP&q=payment",
      ),
    )
  ).json();
  assert.equal(
    found.candidates.find((c: any) => c.id === "payment").available,
    100,
  );
  assert(found.candidates.every((c: any) => !("rawPayload" in c)));
  const id = state.links[0].id;
  state.user = "owner-b";
  assert.equal(
    (await POST(request({ action: "delete", id }, "profile-b"))).status,
    409,
  );
  state.user = "owner-a";
  assert.equal((await POST(request({ action: "delete", id }))).status, 200);
  assert.equal(state.links.length, 0);
  assert.equal(
    JSON.stringify(state.transactions),
    snapshot,
    "Neither financial transaction is rewritten",
  );
  state.user = "";
  assert.equal(
    (
      await GET(
        request(
          undefined,
          "profile-a",
          "https://clover.example",
          "type=income&currency=PHP",
        ),
      )
    ).status,
    400,
  );
  assert(state.locks > 0);
  console.log(
    "Recovery API passed: authorization, Profile isolation, cents, currencies, ignored/transfers, duplicate/concurrent allocations and removal without financial writes.",
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
