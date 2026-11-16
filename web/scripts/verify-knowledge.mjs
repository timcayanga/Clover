import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
const base = process.env.KNOWLEDGE_TEST_URL || "http://localhost:3012";
assert(
  ["localhost", "127.0.0.1"].includes(new URL(base).hostname),
  "Use only a disposable local test server",
);
const bin =
  process.env.AGENT_BROWSER_BIN ||
  "/Users/TimCayanga1/.npm/_npx/6de2aa2fded2970c/node_modules/.bin/agent-browser";
const run = (...args) =>
  execFileSync(bin, ["--session", "knowledge-qa", ...args], {
    encoding: "utf8",
    timeout: 60000,
  });
const post = async (body, origin = base) => {
  const response = await fetch(`${base}/api/admin/content`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() };
};
const assertHidden = async (path) => {
  const response = await fetch(`${base}${path}`);
  const html = await response.text();
  assert(
    response.status === 404 || html.includes('name="robots" content="noindex"'),
    "Unavailable pages are 404 or streamed not-found/noindex",
  );
  assert(
    !html.includes("A fictional article testing approval boundaries"),
    "Private draft body not sent",
  );
};
const stamp = Date.now();
const path = `/help/getting-started/editorial-qa-${stamp}`;
const content = {
  title: `Editorial QA ${stamp}`,
  summary:
    "A fictional article testing approval boundaries in a disposable database.",
  kind: "help",
  category: "getting-started",
  market: "all",
  sections: [
    { heading: "First step", body: "Review the original sample records." },
  ],
  questions: [],
  sources: [],
};
assert.equal(
  (
    await post(
      { action: "save", path, version: 0, content },
      "https://untrusted.example",
    )
  ).status,
  403,
);
assert.equal(
  (await post({ action: "save", path, version: 0, content })).status,
  200,
);
await assertHidden(path);
assert.equal(
  (await post({ action: "publish", path, version: 1 })).status,
  400,
  "Approval required",
);
assert.equal(
  (await post({ action: "publish", path, version: 1, verified: true })).status,
  200,
);
assert.equal(
  (await fetch(`${base}${path}`)).status,
  200,
  "Approved draft public",
);
const updated = { ...content, title: `Changed QA ${stamp}` };
assert.equal(
  (
    await post({
      action: "save",
      path,
      version: 2,
      content: updated,
      order: -15000,
    })
  ).status,
  200,
);
const html = await (await fetch(`${base}${path}`)).text();
assert(
  html.includes(content.title),
  "Published snapshot unchanged while draft edited",
);
assert(
  !html.includes(updated.title),
  "Draft title never serialized to public reader",
);
assert.equal(
  (await post({ action: "publish", path, version: 2, verified: true })).status,
  400,
  "Stale approval refused",
);
const race = await Promise.all([
  post({ action: "save", path, version: 3, content: updated }),
  post({ action: "save", path, version: 3, content: updated }),
]);
assert.equal(
  race.filter((result) => result.status === 200).length,
  1,
  "Only one concurrent edit succeeds",
);
const history = await (
  await fetch(`${base}/api/admin/content?history=${encodeURIComponent(path)}`)
).json();
assert.equal(history.revisions.length, 4);
assert.equal((await post({ action: "archive", path, version: 4 })).status, 200);
await assertHidden(path);
assert.equal((await post({ action: "restore", path, version: 5 })).status, 200);
assert.equal((await fetch(`${base}${path}`)).status, 200);
assert.equal((await post({ action: "archive", path, version: 6 })).status, 200);
assert.equal((await fetch(`${base}/api/cron/content-drafts`)).status, 401);
console.log(
  "Editorial API: draft isolation, approval, concurrency, history, archive/restore, CSRF and cron authentication passed.",
);
const routes = [
  "/help",
  "/help/manage-money",
  "/help/getting-started/your-first-upload",
  "/guides",
  "/guides/export-gcash-transaction-history",
  "/guides/track-expenses-multiple-bank-accounts",
  "/admin/content",
];
try {
  for (const width of [320, 390, 768, 1024, 1440, 1920]) {
    run("set", "viewport", String(width), "900");
    for (const route of routes) {
      run("open", `${base}${route}`);
      run("wait", "--fn", 'document.querySelector("h1") !== null');
      const state = JSON.parse(
        run(
          "eval",
          `({overflow:document.documentElement.scrollWidth>innerWidth+1,heading:document.querySelector('h1')?.textContent,error:!!document.querySelector('[data-nextjs-dialog]'),smallText:[...document.querySelectorAll('#knowledge-main article p')].some(p=>parseFloat(getComputedStyle(p).fontSize)<16)})`,
        ),
      );
      assert(!state.overflow, `${route} ${width}px horizontal overflow`);
      assert(!state.error, `${route} ${width}px error`);
      assert(!state.smallText, `${route} ${width}px body text too small`);
      console.log(`${route} ${width}px passed`);
    }
  }
  // Effective CSS viewport sizes above include 200%/400% desktop reflow.
  // Text-only enlargement is an additional independent stress test.
  run("set", "viewport", "640", "900");
  run("open", `${base}/guides/export-gcash-transaction-history`);
  const enlarged = JSON.parse(
    run(
      "eval",
      `(()=>{document.documentElement.style.fontSize='200%';return {overflow:document.documentElement.scrollWidth>innerWidth+1};})()`,
    ),
  );
  assert(!enlarged.overflow, "200% text resize reflows");
  run("screenshot", "/tmp/clover-help-text-zoom.png");
  run("set", "viewport", "1440", "1000");
  run("open", `${base}/help`);
  run("screenshot", "/tmp/clover-help-final-desktop.png");
  run("set", "viewport", "390", "844");
  run("open", `${base}/guides/export-gcash-transaction-history`);
  run("screenshot", "/tmp/clover-guide-final-mobile.png");
  console.log("42 responsive cases and 200% text enlargement passed.");
} finally {
  run("close");
}
