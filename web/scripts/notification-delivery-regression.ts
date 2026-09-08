import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { resolve } from "node:path";
const requireFixture = createRequire(resolve(process.cwd(), "package.json"));

async function main() {
  const fixture = `
import { Prisma } from '@prisma/client';
import { defaultNotificationTemplates } from '${resolve("lib/notification-template-rules.ts")}';
const baseEvent = { id:'import:fixture:done', title:'Import complete', message:'12 transactions added.', createdAt:'2026-09-07T12:00:00Z', href:'/transactions', ctaLabel:'View transactions' };
let templates, deliveries, cursor, sends, fail;
export function reset(options = {}) {
 templates = defaultNotificationTemplates.map(t => ({...t, email: t.key === 'import-done' || t.key === 'circle-invitation', emailEnabledAt:'2026-01-01T00:00:00Z'}));
 deliveries=[]; cursor=null; sends=[]; fail=!!options.fail;
 if(options.disabled) templates=templates.map(t=>({...t,email:false}));
 if(options.inAppOnly) templates=templates.map(t=>({...t,email:false,inApp:true}));
}
export function state() { return { deliveries, sends, cursor }; }
export function setFail(value) { fail=value; }
export const loadNotificationTemplates = async () => templates;
export const loadRuntimeNotificationTemplates = loadNotificationTemplates;
export const buildInAppNotificationCandidates = async () => [baseEvent];
export const getAdminRealUserWhere = () => ({environment:'production',verified:true});
export const getCurrentUserEnvironment = () => 'production';
export async function sendNotificationMail(to,subject,text) { sends.push({to,subject,text}); if(fail) throw Error('simulated ambiguous SMTP timeout'); }
export const prisma = {
 user: { findFirst: async ({where}) => where.id.gt < 'test-user' ? {id:'test-user',email:'fictional@example.com',workspaces:[{id:'sample-profile'}]} : null },
 notificationDispatchCursor: {
  findUnique: async()=>cursor,
  upsert: async({create,update})=>{cursor=cursor?{...cursor,...update}:{leaseUntil:null,...create};return cursor;},
  updateMany: async({where,data})=>{
   if(where.OR && cursor.leaseUntil && cursor.leaseUntil >= new Date()) return {count:0};
   if(where.leaseUntil && +cursor.leaseUntil !== +where.leaseUntil) return {count:0};
   cursor={...cursor,...data};return {count:1};
  }
 },
 notificationEmailDelivery: {
  create: async({data})=>{
   if(deliveries.some(d=>d.userId===data.userId && d.templateKey===data.templateKey && d.eventKey===data.eventKey))
    throw new Prisma.PrismaClientKnownRequestError('duplicate',{code:'P2002',clientVersion:'test'});
   const row={...data,id:String(deliveries.length),status:'sending'};deliveries.push(row);return row;
  },
  updateMany: async({where,data})=>{for(const row of deliveries)if(where.id.in.includes(row.id))Object.assign(row,data);return {count:where.id.in.length};}
 }
};
reset();`;
  const result = await build({
    stdin: {
      contents: `export {dispatchNotificationEmails} from './lib/notification-dispatch.server'; export {sendCircleInvitationEmail} from './lib/circle-invitation-email'; export {reset,state,setFail} from 'delivery-fixture';`,
      resolveDir: process.cwd(),
    },
    bundle: true,
    platform: "node",
    format: "cjs",
    packages: "external",
    write: false,
    plugins: [
      {
        name: "mock-delivery-boundaries",
        setup(b) {
          b.onResolve(
            {
              filter:
                /^(delivery-fixture|@\/lib\/(prisma|in-app-notifications.server|notification-templates.server|notification-mail.server|admin-data-scope|user-environment))$/,
            },
            () => ({ path: "fixture", namespace: "test" }),
          );
          b.onLoad({ filter: /.*/, namespace: "test" }, () => ({
            contents: fixture,
            loader: "ts",
            resolveDir: process.cwd(),
          }));
        },
      },
    ],
  });
  const Module = requireFixture("node:module");
  const module = new Module(resolve("delivery-test.cjs"));
  module.filename = resolve("delivery-test.cjs");
  module.paths = Module._nodeModulePaths(process.cwd());
  module._compile(result.outputFiles[0].text, module.filename);
  const api = module.exports;
  const previousEnv = process.env.VERCEL_ENV,
    previousPassword = process.env.ZOHO_SMTP_PASSWORD;
  try {
    process.env.VERCEL_ENV = "preview";
    assert.equal(
      (await api.dispatchNotificationEmails()).skipped,
      "Production delivery only.",
    );
    assert.equal(api.state().sends.length, 0);
    process.env.VERCEL_ENV = "production";
    process.env.ZOHO_SMTP_PASSWORD = "fictional-test-not-used-by-smtp";
    await api.dispatchNotificationEmails();
    assert.equal(api.state().sends.length, 1);
    assert.equal(api.state().deliveries[0].status, "accepted");
    await api.dispatchNotificationEmails();
    assert.equal(
      api.state().sends.length,
      1,
      "Repeated cron must not resend the same event",
    );
    api.reset({ fail: true });
    await assert.rejects(api.dispatchNotificationEmails());
    assert.equal(api.state().deliveries[0].status, "uncertain");
    api.setFail(false);
    await api.dispatchNotificationEmails();
    assert.equal(
      api.state().sends.length,
      1,
      "Ambiguous SMTP outcomes must not auto-retry",
    );
    api.reset({ disabled: true });
    await api.dispatchNotificationEmails();
    assert.equal(api.state().sends.length, 0);
    const invitation = {
      to: "fictional@example.com",
      circleName: "Sample Circle",
      inviterName: "Sample Person",
      inviteUrl: "https://clover.ph/circles/join/sample",
      expiresAt: new Date("2026-09-21"),
      environment: "production",
    };
    assert.equal(await api.sendCircleInvitationEmail(invitation), false);
    api.reset();
    assert.equal(await api.sendCircleInvitationEmail(invitation), true);
    assert.equal(api.state().sends.length, 1);
    assert.match(
      api.state().sends[0].text,
      /https:\/\/clover.ph\/circles\/join\/sample/,
    );
    assert.match(api.state().sends[0].text, /does not share your accounts/);
    console.log(
      "PASS: actual dispatch and invitation functions with mocked SMTP/storage — environment guard, channels, duplicate suppression, ambiguous-send handling, safe join link and privacy copy.",
    );
  } finally {
    if (previousEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousEnv;
    if (previousPassword === undefined) delete process.env.ZOHO_SMTP_PASSWORD;
    else process.env.ZOHO_SMTP_PASSWORD = previousPassword;
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
