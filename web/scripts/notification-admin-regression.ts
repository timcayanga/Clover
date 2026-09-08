import assert from "node:assert/strict";
import { build } from "esbuild";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import {
  defaultNotificationTemplates,
  notificationTemplateSchema,
  applyInAppTemplates,
  eligibleNotificationEmail,
  renderNotificationText,
  triggerForNotification,
  safeNotificationPath,
} from "../lib/notification-template-rules";
import type { InAppNotification } from "../lib/in-app-notifications";

const fixtureRequire = createRequire(resolve(process.cwd(), "package.json"));
const root = process.cwd();
const event: InAppNotification = {
  id: "import:sample:done",
  product: "transactions",
  productLabel: "Transactions",
  productHref: "/transactions",
  title: "Import complete",
  message: "12 transactions added.",
  tone: "positive",
  priority: "normal",
  createdAt: "2026-09-07T10:00:00.000Z",
  href: "/transactions",
  ctaLabel: "View transactions",
};
assert.equal(triggerForNotification(event), "import-done");
assert.equal(triggerForNotification({ id: "unknown:event" }), null);
assert.deepEqual(applyInAppTemplates([event], defaultNotificationTemplates), [
  event,
]);
assert.equal(
  applyInAppTemplates(
    [event],
    defaultNotificationTemplates.map((t) => ({ ...t, inApp: false })),
  ).length,
  0,
);
assert.equal(
  applyInAppTemplates(
    [event],
    defaultNotificationTemplates.map((t) => ({ ...t, archived: true })),
  ).length,
  0,
);
const done = defaultNotificationTemplates.find((t) => t.key === "import-done")!;
assert.equal(
  applyInAppTemplates(
    [event],
    [{ ...done, title: "Ready", key: "custom-example" }],
  )[0].title,
  "Ready",
);
assert.equal(
  applyInAppTemplates([event], [{ ...done, key: "custom-example" }])[0].id,
  "import:sample:done:template:custom-example",
);
assert(
  !eligibleNotificationEmail(
    { ...done, email: true, emailEnabledAt: "2026-09-08T00:00:00Z" },
    event,
  ),
);
assert(
  eligibleNotificationEmail(
    { ...done, email: true, emailEnabledAt: "2026-09-06T00:00:00Z" },
    event,
  ),
);
assert(
  !eligibleNotificationEmail(
    {
      ...done,
      email: true,
      archived: true,
      emailEnabledAt: "2026-09-06T00:00:00Z",
    },
    event,
  ),
);
assert.equal(safeNotificationPath("//evil.example"), null);
assert.equal(safeNotificationPath("/\\evil.example"), null);
assert.equal(safeNotificationPath("javascript:alert(1)"), null);
assert.equal(
  renderNotificationText("{{title}}", {
    title: "{{message}}<script>",
    message: "secret",
    ctaLabel: "",
    actionUrl: "",
  }),
  "{{message}}<script>",
);
const draft = Object.fromEntries(
  [
    "name",
    "triggerKey",
    "enabled",
    "inApp",
    "email",
    "title",
    "body",
    "ctaLabel",
    "emailSubject",
    "emailBody",
  ].map((k) => [k, done[k as keyof typeof done]]),
);
assert(notificationTemplateSchema.safeParse(draft).success);
assert(
  !notificationTemplateSchema.safeParse({ ...draft, body: "{{password}}" })
    .success,
);
assert(
  !notificationTemplateSchema.safeParse({ ...draft, body: "{{title}" }).success,
);
assert(
  !notificationTemplateSchema.safeParse({
    ...draft,
    inApp: false,
    email: false,
  }).success,
);
assert(
  !notificationTemplateSchema.safeParse({
    ...draft,
    emailSubject: "Subject\nBcc: attacker",
  }).success,
);
assert(
  !notificationTemplateSchema.safeParse({
    ...draft,
    triggerKey: "circle-invitation",
    email: true,
    emailBody: "No join link",
  }).success,
);

// Real Admin route + template loader, with an in-memory Prisma adapter. No live
// database credentials are read and no SMTP client is bundled into this test.
async function main() {
  const temporary = await mkdtemp(join(tmpdir(), "clover-notification-qa-"));
  const mockDb = `
const rows = new Map(); const audits = []; let deny = false;
exports.setDenied = value => { deny = value; };
exports.auth = async () => { if (deny) throw Error('FORBIDDEN'); return { userId: 'test-admin' }; };
const matches = (row, where) => Object.entries(where || {}).every(([k,v]) => row[k] === v);
const key = w => w.environment_key.environment + ':' + w.environment_key.key;
const prisma = {
 notificationTemplate: {
  findMany: async ({where}) => [...rows.values()].filter(r=>matches(r,where)),
  findUnique: async ({where}) => rows.get(key(where)) || null,
  create: async ({data}) => { const row={...data,createdAt:new Date(),updatedAt:new Date()}; rows.set(data.environment+':'+data.key,row); return row; },
  update: async ({where,data}) => { const row={...rows.get(key(where)),...data,updatedAt:new Date()}; rows.set(key(where),row); return row; }
 },
 notificationTemplateAudit: { create: async ({data}) => { audits.push({...data,id:String(audits.length),createdAt:new Date()}); }, findMany: async()=>audits },
 notificationEmailDelivery: { findMany: async()=>[] },
 notificationDispatchCursor: { findUnique: async()=>null },
 $transaction: async fn => { const snapshot = new Map(rows); const length=audits.length; try { return await fn(prisma); } catch(e) { rows.clear(); for (const [k,v] of snapshot) rows.set(k,v); audits.length=length; throw e; } }
}; exports.prisma = prisma;`;
  await build({
    stdin: {
      contents: `export { GET, POST } from './app/api/admin/notifications/route'; export { setDenied } from 'test-db';`,
      resolveDir: root,
    },
    outfile: join(temporary, "route.cjs"),
    bundle: true,
    platform: "node",
    format: "cjs",
    packages: "external",
    plugins: [
      {
        name: "isolated-notification-storage",
        setup(b) {
          b.onResolve({ filter: /^test-db$/ }, () => ({
            path: "db",
            namespace: "fixture",
          }));
          b.onResolve({ filter: /^@\/lib\/prisma$/ }, () => ({
            path: "db",
            namespace: "fixture",
          }));
          b.onResolve({ filter: /^@\/lib\/admin$/ }, () => ({
            path: "admin",
            namespace: "fixture",
          }));
          b.onResolve({ filter: /^@\/lib\/mobile-request-context$/ }, () => ({
            path: "mobile",
            namespace: "fixture",
          }));
          b.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({
            contents:
              args.path === "db"
                ? mockDb
                : args.path === "admin"
                  ? `export { auth as requireAdminAuth } from 'test-db'; export const getAdminDataEnvironment = () => 'production';`
                  : `export const getMobileRequestContext = () => undefined;`,
            loader: "js",
          }));
        },
      },
    ],
  });
  // Dependencies resolve from Clover, not from a temporary directory.
  const Module = fixtureRequire("node:module");
  const apiModule = new Module(join(root, "notification-test.cjs"));
  apiModule.filename = join(root, "notification-test.cjs");
  apiModule.paths = Module._nodeModulePaths(root);
  apiModule._compile(
    await readFile(join(temporary, "route.cjs"), "utf8"),
    apiModule.filename,
  );
  const api = apiModule.exports;
  async function mutate(payload: unknown, origin = "http://127.0.0.1:8133") {
    return api.POST(
      new Request("http://127.0.0.1:8133/api/admin/notifications", {
        method: "POST",
        headers: { origin },
        body: JSON.stringify(payload),
      }),
    );
  }
  api.setDenied(true);
  assert.equal((await api.GET()).status, 403);
  assert.equal(
    (await mutate({ action: "create", version: 0, template: draft })).status,
    403,
  );
  api.setDenied(false);
  assert.equal(
    (
      await mutate(
        { action: "create", version: 0, template: draft },
        "https://evil.example",
      )
    ).status,
    403,
  );
  assert.equal((await api.GET()).status, 200);
  assert.equal((await (await api.GET()).json()).templates.length, 14);
  let result = await mutate({
    action: "create",
    version: 0,
    template: { ...draft, name: "Test notification", enabled: false },
  });
  assert.equal(result.status, 200);
  const { key } = await result.json();
  result = await mutate({
    action: "update",
    key,
    version: 1,
    template: { ...draft, name: "Updated", email: true, inApp: false },
  });
  assert.equal(result.status, 200);
  let saved = (await (await api.GET()).json()).templates.find(
    (t: { key: string }) => t.key === key,
  );
  assert.equal(saved.name, "Updated");
  assert.equal(saved.inApp, false);
  assert(saved.emailEnabledAt);
  assert.equal(
    (await mutate({ action: "update", key, version: 1, template: draft }))
      .status,
    409,
  );
  assert.equal(
    (await mutate({ action: "delete", key, version: 2 })).status,
    200,
  );
  saved = (await (await api.GET()).json()).templates.find(
    (t: { key: string }) => t.key === key,
  );
  assert(saved.archived);
  assert.equal(
    (await mutate({ action: "restore", key, version: 3 })).status,
    200,
  );
  assert.equal(
    (await mutate({ action: "delete", key: "import-done", version: 0 })).status,
    200,
  );
  saved = (await (await api.GET()).json()).templates.find(
    (t: { key: string }) => t.key === "import-done",
  );
  assert(saved.archived);
  assert.equal(saved.version, 1);
  assert.equal(
    (await mutate({ action: "restore", key: "import-done", version: 1 }))
      .status,
    200,
  );
  assert.equal(
    (
      await mutate({
        action: "update",
        key,
        version: 4,
        template: { ...draft, triggerKey: "billing" },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await mutate({
        action: "update",
        key,
        version: 4,
        template: { ...draft, emailSubject: "Hi\nBcc: test@example.com" },
      })
    ).status,
    400,
  );
  assert.equal((await (await api.GET()).json()).history.length, 6);
  console.log(
    "PASS: notification defaults, rendering, channels, validation, no-backfill, auth/origin, CRUD, archival/restore, concurrency and audit (isolated storage).",
  );

  if (process.argv.includes("--serve")) {
    await build({
      stdin: {
        contents: `import React from 'react'; import { createRoot } from 'react-dom/client'; import { AdminNotifications } from './components/admin-notifications'; createRoot(document.getElementById('root')).render(<AdminNotifications />);`,
        resolveDir: root,
        loader: "tsx",
      },
      bundle: true,
      platform: "browser",
      format: "iife",
      jsx: "automatic",
      outfile: join(temporary, "preview.js"),
      define: { "process.env.NODE_ENV": '"development"' },
    });
    const server = createServer(async (req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1:8133");
      if (url.pathname === "/api/admin/notifications") {
        let body = "";
        for await (const chunk of req) body += chunk;
        const reply =
          req.method === "POST"
            ? await api.POST(
                new Request(url, {
                  method: "POST",
                  headers: { origin: req.headers.origin ?? "" },
                  body,
                }),
              )
            : await api.GET();
        res.writeHead(reply.status, { "Content-Type": "application/json" });
        res.end(await reply.text());
        return;
      }
      if (["/preview.js", "/preview.css"].includes(url.pathname)) {
        res.setHeader(
          "Content-Type",
          url.pathname.endsWith("css") ? "text/css" : "text/javascript",
        );
        res.end(await readFile(join(temporary, url.pathname.slice(1))));
        return;
      }
      res.setHeader("Content-Type", "text/html");
      res.end(
        `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Clover notification QA</title><link rel="stylesheet" href="/preview.css"><style>body{font:16px system-ui;margin:0;background:#f5fafb}main{max-width:1180px;margin:auto;padding:24px}*{box-sizing:border-box}</style></head><body><main><p>LOCAL QA · fictional storage · no emails sent</p><div id="root"></div></main><script src="/preview.js"></script></body></html>`,
      );
    }).listen(8133, "127.0.0.1", () =>
      console.log("Isolated browser QA: http://127.0.0.1:8133"),
    );
    process.on("SIGINT", () =>
      server.close(async () => {
        await rm(temporary, { recursive: true, force: true });
        process.exit(0);
      }),
    );
  } else await rm(temporary, { recursive: true, force: true });
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
