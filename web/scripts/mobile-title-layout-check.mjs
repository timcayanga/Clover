import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

// Isolated shell-layout check using the complete stylesheet, not live user data.
const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
try {
  for (const width of [320, 375, 390, 430, 768, 1100]) {
    await page.setViewportSize({ width, height: 844 });
    for (const [key, title] of Object.entries({ dashboard: 'Home', transactions: 'Transactions', accounts: 'Accounts', recurring: 'Recurring', adviser: 'Adviser', reports: 'Reports', investments: 'Investments', budgeting: 'Budgeting', goals: 'Goals', circles: 'Circles', 'split-bills': 'Split Bills' })) {
      for (const compact of [false, true]) {
        const header = compact ? 'shell-compact-bar' : 'topbar';
        const copy = compact ? 'shell-compact-bar__copy' : 'topbar__title-wrap';
        const actions = compact ? 'shell-compact-bar__actions' : 'topbar-actions';
        await page.setContent(`<style>${css}</style><main class="content content--${key}" style="margin:0;width:100%;padding:0 12px"><header class="${header}"><div class="shell-topbar-leading"><button class="shell-mobile-more-link">☰</button><div class="shell-topbar-leading__actions" style="width:40px">◉</div></div><div class="${copy}"><div class="topbar__title-row"><h1>${title}</h1></div></div><div class="${actions}"><button style="width:36px">+</button></div></header></main>`);
        const result = await page.locator('h1').evaluate(el => {
          const r = el.getBoundingClientRect();
          const h = el.closest('header').getBoundingClientRect();
          return { center: r.x + r.width / 2, headerCenter: h.x + h.width / 2, font: getComputedStyle(el).fontSize, visible: r.width > 0 && r.height > 0 };
        });
        assert.equal(result.font, '14px', `${key} ${width}: font`);
        assert.ok(result.visible, `${key} ${width}: visible`);
        assert.ok(Math.abs(result.center - result.headerCenter) < 1, `${key} ${width} ${header}: not centered ${JSON.stringify(result)}`);
      }
    }
  }
  console.log('132 mobile shell title layouts passed (11 pages, 6 widths, both header variants).');
} finally {
  await browser.close();
}
