import assert from "node:assert/strict";
import { createRequire } from "node:module";

// Use the Playwright installation from the QA runner.
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
const origin = process.env.LANDING_TEST_URL || "http://localhost:3012";
const browser = await chromium.launch();
try {
  for (const [width, height] of [[320, 700], [390, 844], [540, 720], [820, 1180]]) {
    for (const reducedMotion of ["reduce", "no-preference"]) {
      const page = await browser.newPage({ viewport: { width, height }, reducedMotion });
      try {
        await page.goto(origin, { waitUntil: "domcontentloaded" });
        const chapter = page.locator('article[data-chapter="understand"]');
        const heading = chapter.getByRole("heading", { name: /Understand your finances/i });
        await heading.waitFor();
        await page.evaluate(() => document.fonts.ready);
        await heading.evaluate(el => el.scrollIntoView({ block: "center", behavior: "instant" }));
        const center = await page.evaluate(() => scrollY);
        for (const offset of [-120, 0, 120]) {
          await page.evaluate(y => window.scrollTo({ top: y, behavior: "instant" }), center + offset);
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          const measured = await chapter.evaluate(el => {
            const rows = [...el.querySelectorAll("button")].filter(button => /Food & dining|Groceries|Transport|Shopping/i.test(button.innerText));
            const copy = [el.querySelector("h2"), el.querySelector("p")].map(node => node.getBoundingClientRect());
            const collisions = [];
            for (const row of rows) {
              const box = row.getBoundingClientRect();
              if (!box.width || !box.height) throw new Error("Spending row has no visible size");
              if (copy.some(rect => box.left < rect.right && box.right > rect.left && box.top < rect.bottom && box.bottom > rect.top)) collisions.push(row.innerText);
            }
            return { rows: rows.length, collisions };
          });
          assert.deepEqual(measured, { rows: 4, collisions: [] }, JSON.stringify({ width, reducedMotion, offset, measured }));
        }
        console.log(`PASS ${width}×${height} ${reducedMotion}`);
      } finally {
        await page.close();
      }
    }
  }
} finally {
  await browser.close();
}
