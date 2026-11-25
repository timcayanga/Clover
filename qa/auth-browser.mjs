import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const specialist = 'task-flow-accessibility';
import {targetPlan,contextOptions,approvedOrigins} from './access-matrix.mjs';
const privateUi = 'input,textarea,[class*="profile"],[class*="avatar"],[class*="greeting"],header h1,main h1';

// Read only the named tier from the credential file mapped to this exact origin.
export function tierAccount(source, tier) {
  const section = source.match(new RegExp(`^${tier}(?:[^\\n]*)\\n([\\s\\S]*?)(?=^(?:Free|Plus|Pro)(?:[^\\n]*)\\n|$(?![\\s\\S]))`, 'm'))?.[1];
  const email = section?.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  const password = section?.match(/^Password:\s*(.+)$/mi)?.[1]?.trim();
  return email && password ? {tier:tier.toLowerCase(),email,password} : null;
}

export async function signIn(page, origin, account) {
  await page.goto(`${origin}/sign-in`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  if(new URL(page.url()).origin!==origin)throw new Error('Unexpected sign-in origin');
  await page.locator('input[type="email"]').fill(account.email);
  await page.locator('input[autocomplete="current-password"]').fill(account.password);
  if(new URL(page.url()).origin!==origin)throw new Error('Unexpected submit origin');
  await page.locator('button[type="submit"]').filter({ hasText: /^Sign In$/ }).click();
  await page.waitForURL(url => url.origin === origin && !/sign-in|login|sso-callback/.test(url.pathname), { timeout: 15000 });
}

/** Passwords remain in memory only. No storage state, request logs, or login screenshots are saved. */
export async function runAuthenticated({ root, outputDir, baseUrl, credentialsFile, devices, routes, isolatedUrl }) {
  const checks = [], findings = [], artifacts = [];
  const result = { checks, findings, artifacts };
  const block = (id, scope, detail) => checks.push({ id, specialist, status: 'blocked', scope, detail });
  if (!credentialsFile) { block('auth-setup', 'dedicated QA accounts', 'Dedicated QA credentials file is not configured.'); return result; }
  let origin, plan, accounts = [], playwright;
  try {
    plan = targetPlan(baseUrl, isolatedUrl);
    origin = new URL(baseUrl).origin;
    devices = (devices ?? plan.devices).filter(d => plan.devices.some(p => p.name === d.name));
    routes = (routes ?? plan.routes).filter(p => plan.routes.includes(p));
    const source = await readFile(credentialsFile, 'utf8');
    for (const tier of plan.tiers) {
      const account = tierAccount(source,tier);
      if (account) accounts.push(account);
    }
    playwright = createRequire(path.join(root, 'qa', 'package.json'))('playwright');
  } catch { block('auth-setup', 'dedicated QA accounts', 'Credentials file, approved staging/production origin, or Playwright unavailable; no credentials were submitted.'); return result; }
  if (accounts.length !== plan.tiers.length) { block('auth-setup', 'Free, Plus and Pro QA accounts', 'Expected configured tier sections with an email and Password field. No credentials were submitted.'); return result; }
  await mkdir(outputDir, { recursive: true });
  const blockedTiers=new Map();
  let rateLimited=false;
  for (const engine of [...new Set(devices.map(d=>d.engine))]) {
  let browser;
  try { browser = await playwright[engine].launch({headless:true}); }
  catch { for(const d of devices.filter(d=>d.engine===engine))block(`auth-browser-${d.name}`,d.name,`Matching ${engine} unavailable; profile not tested.`);continue; }
  try {
    for (const account of accounts) {
      if(rateLimited||blockedTiers.has(account.tier)) {
        const reason=rateLimited?'Authentication rate limit observed; no further sign-ins attempted in this environment.':blockedTiers.get(account.tier);
        block(`auth-${account.tier}-${engine}-login`,`${origin} · ${account.tier} · ${engine}`,reason);
        for(const device of devices.filter(d=>d.engine===engine))for(const route of routes)
          block(`auth-${account.tier}-${route.slice(1).replaceAll("/","-")}-${device.name}`,`${origin} · ${account.tier} · ${route} · ${device.name}`,reason);
        continue;
      }
      let context = await browser.newContext({ viewport: {width:1440,height:900},locale:'en-PH',timezoneId:'Asia/Manila',serviceWorkers:'block' });
      const pointsAtLive = url => plan.mode === 'isolated-matrix' && approvedOrigins.includes(url.origin);
      if (plan.mode === 'isolated-matrix') {
        await context.route('**/*',route=>pointsAtLive(new URL(route.request().url())) ? route.abort() : route.continue());
      }
      let page = await context.newPage();
      page.setDefaultTimeout(15000);
      let authenticated = false;
      // Permit sign-in during this phase. There are no other user actions or write submissions.
      try {
        await signIn(page,origin,account);
        authenticated = true;
      } catch {
        const signInText=await page.locator('body').innerText().catch(()=> '');
        rateLimited=/too many attempts|rate limit|too many requests/i.test(signInText);
        const reason=rateLimited?'Authentication rate limit observed; no further sign-ins attempted in this environment.':/verification|verify your|authenticator/i.test(signInText)?'Additional verification required; credentials alone did not complete sign-in. No repeat attempts for this account in other browsers.':'Sign-in did not reach the application within 15 seconds. No repeat attempts for this account in other browsers; no sensitive error text retained.';
        blockedTiers.set(account.tier,reason);
        block(`auth-${account.tier}-${engine}-login`, `${origin} · ${account.tier} QA sign-in · ${engine}`, reason);
      }
      if (!authenticated) {
        for(const device of devices.filter(d=>d.engine===engine))for(const route of routes)
          block(`auth-${account.tier}-${route.slice(1).replaceAll("/","-")}-${device.name}`,`${origin} · ${account.tier} · ${route} · ${device.name}`,'Not exercised because sign-in was blocked; no page pass recorded.');
        await context.close();continue;
      }
      checks.push({id:`auth-${account.tier}-${engine}-login`,specialist,status:'passed',scope:`${origin} · ${account.tier} QA sign-in · ${engine}`,detail:'Dedicated QA account reached application; entitlement is not asserted.'});
      // Session state stays in memory; each device gets an isolated context.
      let session = await context.storageState();await context.close();
      for(const device of devices.filter(d=>d.engine===engine)) {
      context=await browser.newContext({...contextOptions(device,playwright),storageState:session});
      await context.route('**/*',route=>{
        const request=route.request(),target=new URL(request.url());
        if (pointsAtLive(target)) return route.abort();
        const read=['GET','HEAD','OPTIONS'].includes(request.method());
        const clerk=target.hostname==='clerk.clover.ph'||target.hostname.endsWith('.clerk.accounts.dev');
        return read||clerk?route.continue():route.abort();
      });
      page=await context.newPage();page.setDefaultTimeout(15000);
      try {
        for (const route of routes) {
          const id = `auth-${account.tier}-${route.slice(1).replaceAll("/","-")}-${device.name}`;
          const scope = `${origin} · ${account.tier} QA account · ${route} · ${device.width}×${device.height} ${engine} web emulation`;
          const start = performance.now();
          try {
            const response = await page.goto(`${origin}${route}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
            await page.locator('body').waitFor({ state: 'visible' });
            await page.waitForFunction(() => document.body.innerText.trim().length > 80 && !/^(loading|please wait)[.\s…]*$/i.test(document.querySelector('main')?.innerText.trim() || ''), undefined, { timeout: 15000 }).catch(() => {});
            await page.evaluate(() => Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 1500))]));
            await page.waitForTimeout(500);
            const current = new URL(page.url());
            if (current.origin !== origin || current.pathname.replace(/\/$/, '') !== route || await page.locator('input[autocomplete="current-password"]').count()) {
              block(id, scope, 'Requested route was not reached, or an authentication screen was shown. No authenticated-page pass recorded.'); continue;
            }
            const observation = await page.evaluate(() => ({
              viewport: innerWidth,
              width: document.documentElement.scrollWidth,
              meaningfulContent: document.body.innerText.trim().length > 80,
              loadingOnly: /^(loading|please wait)[.\s…]*$/i.test(document.querySelector('main')?.innerText.trim() || ''),
              errorOverlay: !!document.querySelector('[data-nextjs-dialog]'),
            }));
            // Mask all email-bearing text leaves as well as profile/greeting controls.
            await page.evaluate(() => {
              for (const el of document.querySelectorAll('body *')) {
                if (el.children.length === 0 && /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(el.textContent || '')) el.setAttribute('data-qa-private', 'true');
              }
            });
            const screenshot = path.join(outputDir, `${id}.png`);
            await page.screenshot({ path: screenshot, fullPage: true, animations: 'disabled', mask: [page.locator(privateUi), page.locator('[data-qa-private]')], timeout: 15000 });
            artifacts.push(screenshot);
            const evidence = path.join(outputDir, `${id}.json`);
            await writeFile(evidence, JSON.stringify({ scope, captureEnvironment:{engine,browserVersion:browser.version(),device:device.name,viewport:{width:device.width,height:device.height},emulated:true}, statusCode: response?.status(), observation }, null, 2));
            artifacts.push(evidence);
            const defects = [];
            if ((response && response.status() >= 400) || !observation.meaningfulContent || observation.loadingOnly || observation.errorOverlay) defects.push({ key: 'render', title: 'Authenticated page did not render usable content', actual: `HTTP ${response?.status()}; content: ${observation.meaningfulContent}; loading-only: ${observation.loadingOnly}; error overlay: ${observation.errorOverlay}.`, expected: 'Requested page renders usable application content.', severity: 'high' });
            if (observation.width > observation.viewport + 2) defects.push({ key: 'overflow', title: 'Authenticated page exceeds viewport', actual: `Document ${observation.width}px; viewport ${observation.viewport}px.`, expected: 'Document fits viewport without unintended horizontal scrolling.', severity: 'medium' });
            for (const defect of defects) findings.push({ id: `${id}-${defect.key}`, checkId: id, specialist, ...defect, steps: [`Sign in using the dedicated ${account.tier} QA account.`, `Open ${route} at ${device.width}×${device.height}.`, 'Inspect the attached masked screenshot.'], suggestion: 'Inspect the page layout and loading/error handling using the reproduction above.', acceptance: 'The same QA account reaches usable content at this route with document width no more than viewport + 2px.', confidence: 0.9, evidence: [screenshot, evidence], surface: `${origin} ${device.name} authenticated`, destination: 'General Chat' });
            checks.push({ id, specialist, status: defects.length ? 'failed' : 'passed', scope, detail: `${defects.length} rendering/overflow issue(s). Read-only visit; financial values, entitlement enforcement, native clients and task completion were not tested. Application write requests blocked after sign-in.`, durationMs: Math.round(performance.now() - start) });
          } catch { block(id, scope, 'Read-only page observation could not complete within its timeout. No sensitive error text was saved.'); }
        }
      } finally { await context.close(); }
      }
      session=null;
    }
  } finally { await browser.close(); }
  }
  accounts=[];
  return result;
}
