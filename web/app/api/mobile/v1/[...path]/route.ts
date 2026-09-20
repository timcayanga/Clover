import { NativeInputError } from "@/lib/native-input-error";
import { hasFullFeatureAccess } from "@/lib/beta-access";
import { mobileAccountPatch, mobileRecurringCreate, mobileRecurringPatch, mobileRecurringCompletion, mobileRecurringDismiss } from "@/lib/mobile-organize-input";
import { mobileAdviserInput } from "@/lib/mobile-adviser-input";
import { revalidateTag } from "next/cache";
import { verifyToken, clerkClient } from "@clerk/nextjs/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isAdminOnlyUserId, isConfiguredAdminEmail, isAssignedAdmin } from "@/lib/admin-access";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { withMobileRequestContext } from "@/lib/mobile-request-context";
import {
  mobileOperation,
  mobileResponseHeaders,
  mobileSessionUser,
} from "@/lib/mobile-api-policy";
import { getProAccess } from "@/lib/pro-access";
import { mobileApiResponse } from "@/lib/mobile-api-response";
import { getCurrentUserEnvironment } from "@/lib/user-environment";
import { mobileEditSchema, mobileCreateSchema, mobileAccountCreateSchema } from "@/lib/mobile-edit-schema";
import { mobileHome } from "@/lib/mobile-home";
import { loadActiveInAppNotificationFeed } from "@/lib/in-app-notifications.server";
import { mobileBudgetInput } from "@/lib/mobile-budget-input";
import { mobileCircleInput, mobileSplitBillInput, mobileSplitBillPayload } from "@/lib/mobile-together-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const preferredRegion = "sin1";

const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: mobileResponseHeaders });

async function handle(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  // Launch separately from the web app. Never inherit staging/local guest auth.
  if (process.env.CLOVER_MOBILE_API_ENABLED !== "true")
    return reply({ error: "Mobile account access is not enabled yet." }, 503);
  // Reject local fixtures before authentication, entitlement reads, or dispatch.
  if (getCurrentUserEnvironment() === "local")
    return reply({ error: "Use the configured staging API for native account testing." }, 503);
  const { path } = await context.params;
  const operation = mobileOperation(request.method, path);
  if (!operation || path.some((part) => !/^[a-zA-Z0-9_-]+$/.test(part)))
    return reply({ error: "Not found" }, 404);
  const bearer = request.headers
    .get("authorization")
    ?.match(/^Bearer ([^\s]+)$/)?.[1];
  if (!bearer) return reply({ error: "Sign in to Clover." }, 401);
  let userId: string;
  try {
    const claims = await verifyToken(bearer, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });
    const verifiedUser = mobileSessionUser(claims);
    if (!verifiedUser)
      return reply({ error: "A valid Clover session is required." }, 401);
    userId = verifiedUser;
  } catch {
    return reply({ error: "Your session expired. Please sign in again." }, 401);
  }
  try {
    if (isAdminOnlyUserId(userId) || (await isConfiguredAdminEmail(userId)) || (await isAssignedAdmin(userId)))
      return reply({ error: "Use the Admin website for this account." }, 403);
    if (operation === "onboarding") {
      const body = z.object({ experience: z.enum(["beginner", "comfortable", "advanced"]), currency: z.string().regex(/^[A-Z]{3}$/), locale: z.string().min(2).max(40).default("en-PH"), timeZone: z.string().min(1).max(100).default("Asia/Manila") }).strict().parse(await request.json());
      const { getCurrencyCatalogCodes } = await import("@/lib/currencies");
      if (!getCurrencyCatalogCodes().some(code => code === body.currency)) return reply({ error: "Choose a supported currency." }, 400);
      const forwarded = new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify({ experience: body.experience, startAction: "native", regionalPreferences: { baseCurrency: body.currency, dateFormat: "MM/DD/YYYY", numberFormat: "1,234.56", timeZone: body.timeZone, locale: body.locale, countryCode: null, detectionSource: "manual" } }) });
      return await withMobileRequestContext(userId, forwarded, async () => {
        const { getOrCreateCurrentUser } = await import("@/lib/user-context");
        const current = await getOrCreateCurrentUser(userId);
        // Replay must never change the currency of an already configured account.
        if (current.onboardingCompletedAt) return reply({ completed: true });
        const { ensureStarterWorkspace } = await import("@/lib/starter-data");
        await ensureStarterWorkspace(current, undefined, undefined, body.currency);
        const result = await (await import("@/app/api/onboarding/route")).POST(forwarded);
        if (!result.ok) return reply({ error: "Unable to finish setup. Please try again." }, result.status);

        return reply({ completed: true });
      });
    }
    const user = await prisma.user.findUnique({
      where: { clerkUserId: userId },
      select: { id: true, firstName: true, lastName: true, email: true, clerkUserId: true, planTier: true, accountLimit:true, monthlyUploadLimit:true, transactionLimit:true, dataWipedAt: true, onboardingCompletedAt: true },
    });
    const catalog = operation === "bootstrap" ? await import("@/lib/currencies") : null;
    const currencyChoices = catalog ? catalog.getCurrencyCatalogOptions(catalog.getCurrencyCatalogCodes()) : undefined;
    if (!user && operation === "bootstrap") return reply({ currencyChoices, apiVersion: 1, firstName: null, needsOnboarding: true, profiles: [], entitlement: { planTier: "free", fullFeatureAccess: false, accessEndsAt: null, renewing: false, nativePurchasesAvailable: false } });
    if (!user)
      return reply(
        {
          error:
            "Please finish setting up your Clover account on the website first.",
        },
        409,
      );
    if (operation === "store-billing") {
      const { storeBillingConfig, syncStoreAccess } = await import("@/lib/store-access");
      const config = storeBillingConfig();
      if (request.method === "POST") {
        z.object({}).strict().parse(await request.json());
        if (!config.enabled) return reply({ error: "Store purchases are not configured yet." }, 503);
        await syncStoreAccess(user.id);
      }
      const access = await getProAccess(user.id);
      return reply({ available: config.enabled && !(access.user.planTierLocked && access.planTier === "free"), appUserId: userId, entitlementId: config.entitlementId, productIds: config.products, planTier: access.planTier, accessEndsAt: access.accessEndsAt, renewing: access.renewing });
    }
    if (operation === "settings-preferences") {
      const { getAppPreferences, updateAppPreferences } = await import("@/lib/app-preferences");
      const preferences = request.method === "GET" ? await getAppPreferences(user.id) : await updateAppPreferences(user.id, await request.json());
      return reply({ preferences });
    }
    if (operation === "settings-account") {
      if (request.method === "GET") return reply({ firstName: user.firstName, lastName: user.lastName, email: user.email });
      const data = z.object({ firstName: z.string().trim().max(80), lastName: z.string().trim().max(80) }).strict().parse(await request.json());
      await (await clerkClient()).users.updateUser(userId, data);
      revalidateTag("clover-clerk-user");
      const updated = await prisma.user.update({ where: { id: user.id }, data, select: { firstName: true, lastName: true, email: true } });
      return reply(updated);
    }
    if (["settings-data", "settings-export", "settings-delete-account", "settings-wipe-data"].includes(operation)) {
      const { handleMobileDataSettings } = await import("@/lib/mobile-data-settings");
      const result = await handleMobileDataSettings(request, userId, operation, path[2]);
      const headers = new Headers(result.headers);
      for (const [key, value] of Object.entries(mobileResponseHeaders)) headers.set(key, value);
      return new Response(result.body, { status: result.status, headers });
    }
    if (["settings-profiles", "settings-profile", "settings-categories"].includes(operation)) {
      const { handleMobileSettings } = await import("@/lib/mobile-settings");
      const result = await handleMobileSettings(request, userId, operation, path[2]);
      return reply(await result.json(), result.status);
    }
    if (operation === "settings-regional") {
      return await withMobileRequestContext(userId, request, async () => {
        const route = await import("@/app/api/settings/regional/route");
        const result = request.method === "GET" ? await route.GET() : await route.PATCH(request);
        const data = await result.json();
        return reply(result.ok ? { regionalPreferences: data.regionalPreferences } : { error: "Unable to update regional preferences." }, result.status);
      });
    }
    if (operation === "bootstrap") {
      const [profiles, access, preferences] = await Promise.all([
        prisma.workspace.findMany({
          where: { userId: user.id },
          select: { id: true, name: true },
          orderBy: { createdAt: "asc" },
        }),
        getProAccess(user.id),
        (await import("@/lib/app-preferences")).getAppPreferences(user.id),
      ]);
      return reply({
        apiVersion: 1,
        offlineEpoch: user.dataWipedAt?.toISOString()??null,
        preferences,
        needsOnboarding: !user.onboardingCompletedAt,
        currencyChoices,
        firstName: user.firstName,
        profiles,
        entitlement: {
          planTier: access.planTier,
          fullFeatureAccess: hasFullFeatureAccess(access.planTier),
          accessEndsAt: access.accessEndsAt,
          renewing: access.renewing,
          nativePurchasesAvailable: (await import("@/lib/store-access")).storeBillingConfig().enabled && !(access.user.planTierLocked && access.planTier === "free"),
        },
      });
    }
    if (["circle-invitations", "circle-invitation", "circle-invite", "circle-invite-manage"].includes(operation)) {
      const result = await withMobileRequestContext(userId, request, async () => {
        if (operation === "circle-invitations") return (await import("@/app/api/circle-invitations/route")).GET();
        if (operation === "circle-invitation") {
          const route = await import("@/app/api/circle-invitations/[token]/route");
          const params = { params: Promise.resolve({ token: path[1] }) };
          return request.method === "POST" ? route.POST(request, params) : route.GET(request, params);
        }
        const { getCircleAccess } = await import("@/lib/circle-access");
        await getCircleAccess(path[1], user.id, "organizer");
        if (operation === "circle-invite") {
          if (request.method === "GET") return Response.json({ invitations: await prisma.circleInvitation.findMany({where:{circleId:path[1],status:"pending",expiresAt:{gt:new Date()}},select:{id:true,email:true,displayName:true,role:true,expiresAt:true},orderBy:{createdAt:"desc"},take:50}) });
          return (await import("@/app/api/circles/[circleId]/invitations/route")).POST(request,{params:Promise.resolve({circleId:path[1]})});
        }
        const route = await import("@/app/api/circles/[circleId]/invitations/[invitationId]/route");
        const params = {params:Promise.resolve({circleId:path[1],invitationId:path[3]})};
        return request.method === "DELETE" ? route.DELETE(request,params) : route.PATCH(request,params);
      });
      return reply(await result.json(),result.status);
    }
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspaceId");
    if (!workspaceId) return reply({ error: "Choose a Profile first." }, 400);
    await assertWorkspaceAccess(userId, workspaceId);
    if (operation === "native-upload") {
      if(path[2]==="start"){
        const limit=(await import("@/lib/user-limits")).getEffectiveUserLimits(user).monthlyUploadLimit;
        if(limit!==null && await (await import("@/lib/plan-access")).countWorkspaceOwnerImportFilesThisMonth(workspaceId)>=limit)return reply({error:"You have reached this month’s upload limit. Manage your plan to add more files."},403);
      }
      const result = await (await import("@/lib/native-upload-store")).nativeUploadRequest(request,path[1],userId,workspaceId,path[2]);
      const data = await result.json();
      return reply(path[2] === "complete" && result.ok ? mobileApiResponse("import-process",data) : data,result.status);
    }
    if (operation === "adviser-attachments") {
      const response = await withMobileRequestContext(userId,request,async()=> (await import("@/app/api/adviser/attachments/route")).POST(request));
      return reply(await response.json(),response.status);
    }
    if (operation === "transaction-batch") {
      const response = await withMobileRequestContext(userId, request, async () => (await import("@/app/api/transactions/batch/route")).POST(request));
      return reply(await response.json(), response.status);
    }
    if (operation === "adviser-entries") {
      const text = request.method === "POST" ? await request.text() : undefined;
      if (text && new TextEncoder().encode(text).length > 100000) return reply({error:"Please shorten this draft."},413);
      const headers = new Headers(request.headers); headers.delete("cookie"); headers.delete("content-length"); headers.set("content-type","application/json");
      const forwarded = new Request(request.url,{method:request.method,headers,body:text});
      const response = await withMobileRequestContext(userId,forwarded,async()=>{
        const route = await import("@/app/api/adviser/entries/route");
        return request.method === "POST" ? route.POST(forwarded) : route.GET(forwarded);
      });
      return reply(await response.json(),response.status);
    }
    if (operation === "adviser-conversations") {
      const response = await withMobileRequestContext(userId, request, async () => {
        const route = await import("@/app/api/adviser/conversations/route");
        return request.method === "POST" ? route.POST(request) : route.GET(request);
      });
      return reply(await response.json(), response.status);
    }
    if (operation === "adviser-chat") {
      const text = await request.text();
      if (new TextEncoder().encode(text).length > 100000) return reply({ error: "Please shorten the conversation." }, 413);
      let input: unknown;
      try { input = JSON.parse(text); } catch { return reply({ error: "Please check your message." }, 400); }
      const body = mobileAdviserInput.parse(input);
      // Resolve record references inside the authorized Profile. No raw payloads,
      // client-provided amounts, or cross-Profile identifiers enter the prompt.
      let selectedRecord: unknown;
      if (body.selection?.kind === "account") {
        selectedRecord = await prisma.account.findFirst({
          where: { id: body.selection.id, workspaceId },
          select: { name: true, type: true, currency: true, balance: true },
        });
      } else if (body.selection?.kind === "transaction") {
        selectedRecord = await prisma.transaction.findFirst({
          where: { id: body.selection.id, workspaceId, deletedAt: null },
          select: { date: true, amount: true, currency: true, type: true, merchantClean: true, reviewStatus: true, isExcluded: true },
        });
      }
      if (body.selection && !selectedRecord) return reply({ error: "This record is not available in the selected Profile." }, 404);
      const surface = ["accounts", "transactions", "recurring", "budgeting", "goals", "investments"].includes(body.page ?? "") ? body.page : "general";
      const headers = new Headers(request.headers);
      headers.delete("content-length");
      headers.delete("cookie");
      headers.set("content-type", "application/json");
      const forwarded = new Request(request.url, { method: "POST", headers, body: JSON.stringify({ ...body, stream: false, surface, pageLabel: body.page ?? "general", selectedRecord }) });
      const response = await withMobileRequestContext(userId, forwarded, async () =>
        (await import("@/app/api/adviser/chat/route")).POST(forwarded));
      return reply(mobileApiResponse(operation, await response.json()), response.status);
    }

    if (operation === "offline-allowance") {
      const { reserveLocalAllowance } = await import("@/lib/mobile-local-allowance");
      const text = await request.text();
      if(new TextEncoder().encode(text).length>2048)return reply({error:"Request too large."},413);
      return reply(await reserveLocalAllowance(user.id, JSON.parse(text)));
    }
    if (operation === "offline-sync") {
      if (Number(request.headers.get("content-length") ?? 0) > 16384) return reply({error:"Change is too large."},413);
      const { applyMobileOfflineMutation } = await import("@/lib/mobile-offline-sync");
      const text = await request.text();
      if(new TextEncoder().encode(text).length>16384)return reply({error:"Change is too large."},413);
      const result = await applyMobileOfflineMutation(userId, workspaceId, JSON.parse(text));
      if(result.status===200){
        (await import("@/lib/workspace-summary-cache")).invalidateWorkspaceSummaryCache(workspaceId);
        if('committed' in result && result.committed && result.kind === 'create') {
          const row=(result.body as {transaction:{id:string;categoryId:string|null;categoryName:string|null;merchantRaw:string;merchantClean:string|null;type:"income"|"expense"}}).transaction;
          if(row.categoryId)void import("@/lib/data-engine").then(({recordTrainingSignal})=>recordTrainingSignal({workspaceId,transactionId:row.id,merchantText:row.merchantClean??row.merchantRaw,categoryId:row.categoryId!,categoryName:row.categoryName,source:"manual_transaction_creation",type:row.type,confidence:100,actorUserId:userId})).catch(()=>{});
        }
      }
      return reply(result.body,result.status);
    }

    if (operation === "reports") {
      const currency = z.string().regex(/^[A-Z]{3}$/).parse(url.searchParams.get("currency") ?? "PHP");
      const {mobileHome} = await import("@/lib/mobile-home");
      const {loadReportNetWorth} = await import("@/lib/report-net-worth");
      const { mobileReportBalances } = await import("@/lib/mobile-report-balances");
      const {nativeReportWindow,nativeReportDetails}=await import("@/lib/native-report-details");
      const window=nativeReportWindow(url.searchParams);
      const access=await getProAccess(user.id);
      const details=await nativeReportDetails(workspaceId,currency,window,hasFullFeatureAccess(access.planTier));
      const now = new Date();
      const [data, netWorth, balances] = await Promise.all([mobileHome(workspaceId,currency),loadReportNetWorth(workspaceId,currency,window.start,window.end),mobileReportBalances(workspaceId,currency,now,window)]);
      return reply({...data,netWorth,balances,details});
    }
    if (operation === "together-options") {
      const [groups, people, profiles] = await Promise.all([
        prisma.splitBillGroup.findMany({ where:{ OR:[{userId:user.id},{collaborators:{some:{userId:user.id}}}], archivedAt:null }, select:{id:true,name:true,avatarUrl:true,members:{select:{id:true,name:true}},_count:{select:{bills:true}}} }),
        prisma.splitBillPerson.findMany({where:{userId:user.id},select:{id:true,name:true,avatarUrl:true}}),
        prisma.splitBillPaymentProfile.findMany({where:{userId:user.id},select:{id:true,label:true,provider:true,currency:true,accountName:true,accountNumber:true,qrImageData:true,isDefault:true}}),
      ]);
      return reply({groups,people,profiles});
    }
    if (operation === "investments") {
      return reply(await (await import("@/lib/mobile-investment-data")).loadMobileInvestments(workspaceId));
    }
    if(operation === "investment-position-history")return reply(await (await import("@/lib/investment-position-store")).investmentPositionHistory(workspaceId,path[1]));
    if(operation === "investment-positions")return reply({positions:await (await import("@/lib/investment-position-store")).listInvestmentPositions(workspaceId)});
    if(operation === "investment-position-save") {
      const text=await request.text();if(text.length>8000)return reply({error:"Asset details are too long."},413);
      const {positionInput,saveInvestmentPosition}=await import("@/lib/investment-position-store");
      const result=await saveInvestmentPosition(workspaceId,path[1],user.id,positionInput.parse(JSON.parse(text)));
      (await import("@/lib/workspace-summary-cache")).invalidateWorkspaceSummaryCache(workspaceId);
      return reply(result);
    }
    if(operation === "investment-trades") {
      const account=await prisma.account.findFirst({where:{id:path[1],workspaceId,type:"investment"},select:{id:true}});
      if(!account)return reply({error:"Investment account not found."},404);
      const {listInvestmentTrades,saveInvestmentTrade}=await import("@/lib/investment-trade-store");
      if(request.method==="GET")return reply(await listInvestmentTrades(account.id,z.coerce.number().int().min(1).max(10000).parse(url.searchParams.get("page")??1),url.searchParams.get("positionId")??undefined));
      const text=await request.text();if(new TextEncoder().encode(text).length>8000)return reply({error:"Trade details are too long."},413);
      const {investmentTradeInput}=await import("@/lib/investment-trade-input");
      const body=JSON.parse(text);
      const positions=await import("@/lib/investment-position-store");
      const result=body.positionId
        ? await positions.savePositionTrade(workspaceId,account.id,user.id,positions.positionTradeInput.parse(body),request.method==="DELETE")
        : await saveInvestmentTrade(workspaceId,account.id,user.id,investmentTradeInput.parse(body),request.method==="DELETE");
      (await import("@/lib/workspace-summary-cache")).invalidateWorkspaceSummaryCache(workspaceId);
      return reply(result);
    }
    if (["account-history", "investment-purchase-create", "investment-purchase-delete"].includes(operation)) {
      const account = await prisma.account.findFirst({where:{id:path[1],workspaceId},select:{id:true,type:true,currency:true,balance:true,updatedAt:true}});
      if (!account) return reply({error:"Account not found in this Profile."},404);
      if(operation === "account-history") {
        const kind = z.enum(["activity","purchases","dividends","valuations"]).parse(url.searchParams.get("kind")??"activity");
        const page = z.coerce.number().int().min(1).max(10000).parse(url.searchParams.get("page")??1);
        if(kind === "activity") {
          const query = new URL(request.url); query.search="";
          query.searchParams.set("workspaceId",workspaceId); query.searchParams.set("accounts",account.id); query.searchParams.set("page",String(page)); query.searchParams.set("pageSize","30"); query.searchParams.set("summaryMode","light");
          const forwarded = new Request(query,{headers:request.headers});
          const result = await withMobileRequestContext(userId,forwarded,async()=> (await import("@/app/api/transactions/route")).GET(forwarded));
          const data = await result.json();
          return reply(mobileApiResponse("transactions",data),result.status);
        }
        if(account.type !== "investment") return reply({error:"Choose an investment account."},400);
        if(kind === "valuations") {
          const rows=await prisma.investmentSnapshot.findMany({where:{workspaceId,accountId:account.id},orderBy:[{snapshotDate:"desc"},{updatedAt:"desc"}],take:201,select:{snapshotDate:true,updatedAt:true,totalValue:true,currency:true}});
          const history=rows.slice(0,200).filter(r=>r.totalValue!==null).map(r=>({accountId:account.id,date:(r.snapshotDate??r.updatedAt).toISOString(),currency:r.currency,value:Number(r.totalValue)}));
          if(!rows.length && account.balance!==null) history.push({accountId:account.id,date:account.updatedAt.toISOString(),currency:account.currency,value:Number(account.balance)});
          return reply({history,limited:rows.length>200});
        }
        const skip=(page-1)*30;
        if(kind === "purchases") {
          const [rows,totalCount]=await Promise.all([prisma.investmentPurchase.findMany({where:{accountId:account.id},orderBy:[{purchasedAt:"desc"},{id:"desc"}],skip,take:30,select:{id:true,purchasedAt:true,quantity:true,totalCost:true,currency:true,note:true}}),prisma.investmentPurchase.count({where:{accountId:account.id}})]);
          return reply({items:rows.map(r=>({id:r.id,date:r.purchasedAt.toISOString(),quantity:r.quantity?.toString()??null,amount:r.totalCost?.toString()??null,currency:r.currency,note:r.note,label:"Buy"})),totalCount,page});
        }
        const [rows,totalCount]=await Promise.all([prisma.investmentDividend.findMany({where:{accountId:account.id},orderBy:[{paidAt:"desc"},{id:"desc"}],skip,take:30,select:{id:true,paidAt:true,amount:true,currency:true,note:true}}),prisma.investmentDividend.count({where:{accountId:account.id}})]);
        return reply({items:rows.map(r=>({id:r.id,date:r.paidAt.toISOString(),amount:r.amount?.toString()??null,currency:r.currency,note:r.note,label:"Dividend"})),totalCount,page});
      }
      if(account.type !== "investment") return reply({error:"Choose an investment account."},400);
      if(operation === "investment-purchase-delete") {
        if(!(await prisma.investmentPurchase.findFirst({where:{id:path[3],accountId:account.id},select:{id:true}}))) return reply({error:"Trade not found in this account."},404);
        const result=await withMobileRequestContext(userId,request,async()=> (await import("@/app/api/accounts/[accountId]/investment-purchases/[purchaseId]/route")).DELETE(request,{params:Promise.resolve({accountId:account.id,purchaseId:path[3]})}));
        return reply(result.ok?{ok:true}:{error:"Unable to delete this purchase."},result.status);
      }
      const schema=z.object({purchasedAt:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v),totalCost:z.coerce.number().finite().positive(),quantity:z.coerce.number().finite().positive().optional(),note:z.string().trim().max(1000).optional()}).strict();
      const text=await request.text(); if(new TextEncoder().encode(text).length>4096)return reply({error:"Trade details are too long."},413);
      let input:unknown; try { input=JSON.parse(text); } catch { return reply({error:"Please check the purchase details."},400); }
      const payload=schema.parse(input);
      const headers = new Headers(request.headers); headers.delete("cookie"); headers.delete("content-length"); headers.set("content-type","application/json");
      const forwarded=new Request(request.url,{method:"POST",headers,body:JSON.stringify({...payload,currency:account.currency})});
      const result=await withMobileRequestContext(userId,forwarded,async()=> (await import("@/app/api/accounts/[accountId]/investment-purchases/route")).POST(forwarded,{params:Promise.resolve({accountId:account.id})}));
      return reply(result.ok?{ok:true}:{error:"Unable to save this purchase."},result.status);
    }
    if (operation === "market-history" || operation === "market-news") {
      const access = await getProAccess(user.id);
      if (!hasFullFeatureAccess(access.planTier)) return reply({ error:"Market tools require Clover Pro." }, 403);
      const response = await withMobileRequestContext(userId, request, async () => operation === "market-history" ? (await import("@/app/api/market-history/route")).GET(request) : (await import("@/app/api/market-news/route")).GET(request));
      return reply(await response.json(), response.status);
    }
    if (operation === "budgets" && request.method === "GET") {
      const { loadCachedBudgetWorkspaceData } = await import("@/lib/budgeting-data");
      const { getBudgetAppearance } = await import("@/lib/budget-appearance");
      const { overview } = await loadCachedBudgetWorkspaceData(workspaceId, { directory: true });
      return reply({ budgets: [...overview.budgets, ...overview.inactiveBudgets].map(budget => { const { emoji, color } = getBudgetAppearance(budget); return { ...budget, appearance: { emoji, color } }; }), uncategorizedTransactionCount: overview.uncategorizedTransactionCount });
    }
    if (operation === "budget-options") {
      const { loadBudgetEditorOptions } = await import("@/lib/budgeting-data");
      return reply(await loadBudgetEditorOptions(workspaceId));
    }
    if (operation === "goals") {
      const { mobileGoals, saveMobileGoal } = await import("@/lib/mobile-goals");
      if (request.method === "GET") return reply(await mobileGoals(workspaceId, user.id));
      if (request.method === "DELETE") {
        const { id } = z.object({ id: z.string().min(1).max(240) }).strict().parse(await request.json());
        const result = await prisma.personalGoal.deleteMany({ where: { id, workspaceId } });
        if (!result.count) return reply({ error: "Goal not found in this Profile." }, 404);
        const { invalidateWorkspaceSummaryCache } = await import("@/lib/workspace-summary-cache");
        invalidateWorkspaceSummaryCache(workspaceId);
        return reply({ deleted: true });
      }
      const text = await request.text();
      if (new TextEncoder().encode(text).length > 4096) return reply({ error: "Goal details are too large." }, 413);
      let input: unknown;
      try { input = JSON.parse(text); } catch { return reply({ error: "Check the goal details." }, 400); }
      const result = await saveMobileGoal(workspaceId, input);
      return result ? reply(result) : reply({ error: "Goal not found in this Profile." }, 404);
    }
    if (operation === "notifications") {
      const feed = await loadActiveInAppNotificationFeed(user, workspaceId);
      if (request.method === "PATCH") {
        const body = z.object({ ids: z.array(z.string().min(1).max(240)).min(1).max(40), action: z.enum(["read", "dismiss"]).default("read") }).strict().parse(await request.json());
        const allowed = new Set(feed.notifications.map(item => item.id));
        if (body.ids.some(id => !allowed.has(id))) return reply({ error: "Notification not found in this Profile." }, 400);
        const records = { data: [...new Set(body.ids)].map(notificationKey => ({ userId: user.id, notificationKey })), skipDuplicates: true };
        if (body.action === "dismiss") await prisma.inAppNotificationDismissal.createMany(records);
        else await prisma.inAppNotificationRead.createMany(records);
        const refreshed = await loadActiveInAppNotificationFeed(user, workspaceId);
        return reply({ notifications: refreshed.notifications, count: refreshed.unreadCount, readIds: (await prisma.inAppNotificationRead.findMany({ where: { userId: user.id, notificationKey: { in: refreshed.notifications.map(item => item.id) } }, select: { notificationKey: true } })).map(row => row.notificationKey) });
      }
      return reply({ notifications: feed.notifications, count: feed.unreadCount, readIds: (await prisma.inAppNotificationRead.findMany({ where: { userId: user.id, notificationKey: { in: feed.notifications.map(item => item.id) } }, select: { notificationKey: true } })).map(row => row.notificationKey) });
    }
    if (operation === "options") {
      const [accounts, categories, tags] = await Promise.all([
        prisma.account.findMany({ where: { workspaceId, type: { not: "investment" } }, select: { id: true, name: true, currency: true, institution: true, type: true }, orderBy: { name: "asc" } }),
        prisma.category.findMany({ where: { workspaceId, isArchived: false }, select: { id: true, name: true, type: true }, orderBy: { name: "asc" } }),
        prisma.tag.findMany({ where: { workspaceId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      ]);
      return reply({ accounts, categories, tags });
    }
    if (operation === "recurring") {
      const now = new Date();
      const year = z.coerce.number().int().min(2000).max(2200).parse(url.searchParams.get("year") ?? now.getFullYear());
      const month = z.coerce.number().int().min(0).max(11).parse(url.searchParams.get("month") ?? now.getMonth());
      return reply(await (await import("@/lib/mobile-recurring")).mobileRecurring(workspaceId, year, month));
    }
    if (operation === "home") {
      const currency = z.string().regex(/^[A-Z]{3}$/).parse(url.searchParams.get("currency") ?? "PHP");
      return reply(await mobileHome(workspaceId, currency));
    }
    if (operation === "transaction") {
      const row = await prisma.transaction.findFirst({
        where: { id: path[1], workspaceId, deletedAt: null },
        select: { id: true },
      });
      if (!row) return reply({ error: "Transaction not found" }, 404);
    }
    if (operation.startsWith("import-")) {
      const row = await prisma.importFile.findFirst({
        where: { id: path[1] },
        select: { workspaceId: true },
      });
      if (
        row ? row.workspaceId !== workspaceId : operation !== "import-process"
      )
        return reply({ error: "Import not found" }, 404);
    }
    if (operation === "import-review") {
      const page=z.coerce.number().int().min(1).max(10000).parse(url.searchParams.get("page")??1);
      const [items,totalCount,accounts,file]=await Promise.all([
        prisma.parsedTransaction.findMany({where:{importFileId:path[1],workspaceId},orderBy:[{createdAt:"asc"},{id:"asc"}],skip:(page-1)*30,take:30,select:{id:true,date:true,amount:true,currency:true,merchantRaw:true,merchantClean:true,type:true,categoryName:true,confidence:true,categoryReason:true}}),
        prisma.parsedTransaction.count({where:{importFileId:path[1],workspaceId}}),
        prisma.account.findMany({where:{workspaceId},select:{id:true,name:true,currency:true}}),
        prisma.importFile.findFirst({where:{id:path[1],workspaceId},select:{status:true,processingPhase:true,accountId:true}})
      ]);
      return reply({items,totalCount,page,accounts,file});
    }
    if (operation === "import-confirm") {
      const text=await request.text();if(new TextEncoder().encode(text).length>8000)return reply({error:"Details are too large."},413);
      const payload=z.object({accountId:z.string().min(1).max(200).nullable().optional()}).strict().parse(JSON.parse(text));
      if(payload.accountId && !await prisma.account.findFirst({where:{id:payload.accountId,workspaceId},select:{id:true}}))return reply({error:"Choose an account in this Profile."},400);
      const forwarded=new Request(request.url,{method:"POST",headers:request.headers,body:JSON.stringify(payload)});
      const result=await withMobileRequestContext(userId,forwarded,async()=> (await import("@/app/api/imports/[importId]/confirm/route")).POST(forwarded,{params:Promise.resolve({importId:path[1]})}));
      const body=await result.json();
      return reply(result.ok?{ok:true,status:body.result?.status,imported:body.result?.imported}:{error:body.error??"Unable to confirm import."},result.status);
    }
    if(operation === "circle-archive") {
      const {getCircleAccess}=await import("@/lib/circle-access");
      const access=await getCircleAccess(path[1],user.id,"organizer");
      if(!access.isOwner)return reply({error:"Only the Circle owner can archive this Circle."},403);
      await prisma.$transaction(async tx=>{await tx.circle.update({where:{id:path[1]},data:{archivedAt:new Date()}});await tx.circleActivity.create({data:{circleId:path[1],actorUserId:user.id,action:"circle_archived",summary:"Circle archived. Shared history is preserved."}});});
      (await import("@/lib/workspace-summary-cache")).invalidateUserSummaryCache(user.id,"circles");return reply({ok:true});
    }
    if(operation === "circle-resource") {
      const text=await request.text();if(new TextEncoder().encode(text).length>100000)return reply({error:"Details are too large."},413);
      const forwarded=new Request(request.url,{method:"POST",headers:request.headers,body:text});
      const result=await withMobileRequestContext(userId,forwarded,async()=> (await import("@/app/api/circles/[circleId]/resources/route")).POST(forwarded,{params:Promise.resolve({circleId:path[1]})}));
      const body=await result.json();
      if(result.ok)(await import("@/lib/workspace-summary-cache")).invalidateUserSummaryCache(user.id,"circles");
      return reply(result.ok?{ok:true}:{error:body.error??"Unable to update Circle."},result.status);
    }
    let forwarded = request;
    if ((operation === "circles" && request.method === "POST") || (operation === "circle" && request.method === "PATCH") || (operation === "split-bills" && request.method === "POST")) {
      const text = await request.text();
      if (new TextEncoder().encode(text).length > (operation === "split-bills" ? 300000 : 250000)) return reply({ error: "Details are too large." }, 413);
      let input: unknown;
      try { input = JSON.parse(text); } catch { return reply({ error: "Check the entered details." }, 400); }
      const body = operation === "split-bills" ? mobileSplitBillPayload(mobileSplitBillInput.parse(input)) : mobileCircleInput.parse(input);
      forwarded = new Request(request.url, { method: request.method, headers: request.headers, body: JSON.stringify(body) });
    }
    if ((operation === "circles" || operation === "circle") && request.method === "GET") {
      url.searchParams.delete("circle"); url.searchParams.delete("view");
      if (operation === "circles") url.searchParams.set("view", "directory");
      else url.searchParams.set("circle", path[1]);
      forwarded = new Request(url, { headers: request.headers });
    }
    if ((operation === "budgets" && request.method === "POST") || (operation === "budget" && request.method === "PATCH")) {
      const text = await request.text();
      if (new TextEncoder().encode(text).length > 4096) return reply({ error: "Budget details are too large." }, 413);
      let input: unknown;
      try { input = JSON.parse(text); } catch { return reply({ error: "Check the budget details." }, 400); }
      const body = mobileBudgetInput.parse(input);
      if (body.scope === "account") {
        const account = await prisma.account.findFirst({ where: { id: body.accountId!, workspaceId, type: { not: "investment" } }, select: { currency: true } });
        if (!account || account.currency !== body.currency) return reply({ error: "Choose an account in this Profile and use its currency." }, 400);
      }
      forwarded = new Request(request.url, { method: request.method, headers: request.headers, body: JSON.stringify(body) });
    }
    if (["account", "recurring-edit", "recurring-completion"].includes(operation)) {
      const exists = operation === "account"
        ? await prisma.account.findFirst({ where: { id: path[1], workspaceId }, select: { id: true } })
        : await prisma.financialCommitment.findFirst({ where: { id: path[1], workspaceId }, select: { id: true } });
      if (!exists) return reply({ error: "Record not found in this Profile." }, 404);
    }
    if (["account", "recurring-create", "recurring-edit", "recurring-completion", "recurring-dismiss"].includes(operation)) {
      const headers = new Headers(request.headers);
      headers.delete("cookie"); headers.delete("content-length");
      let payload: string | undefined;
      if (["POST", "PATCH"].includes(request.method)) {
        const raw = await request.text();
        if (new TextEncoder().encode(raw).length > 16384) return reply({ error: "Details are too large." }, 413);
        let input: unknown;
        try { input = JSON.parse(raw); } catch { return reply({ error: "Please check the entered fields." }, 400); }
        const schema = operation === "account" ? mobileAccountPatch : operation === "recurring-create" ? mobileRecurringCreate : operation === "recurring-edit" ? mobileRecurringPatch : operation === "recurring-completion" ? mobileRecurringCompletion : mobileRecurringDismiss;
        const body = schema.parse(input);
        if ("accountId" in body && body.accountId && !(await prisma.account.findFirst({ where: { id: body.accountId, workspaceId }, select: { id: true } }))) return reply({ error: "Choose an account in this Profile." }, 400);
        if ("statementCheckpointId" in body && body.statementCheckpointId && !(await prisma.accountStatementCheckpoint.findFirst({ where: { id: body.statementCheckpointId, workspaceId }, select: { id: true } }))) return reply({ error: "Statement not found in this Profile." }, 400);
        if ("tracking" in body && body.tracking?.liabilityAccountId && !(await prisma.account.findFirst({ where: { id: body.tracking.liabilityAccountId, workspaceId }, select: { id: true } }))) return reply({ error: "Choose a liability account in this Profile." }, 400);
        // Transaction evidence is also checked
        // by the shared commitment handlers inside this verified request context.
        payload = JSON.stringify({ ...body, workspaceId });
        headers.set("content-type", "application/json");
      }
      forwarded = new Request(request.url, { method: request.method, headers, body: payload });
    }
    if (operation === "account-create") {
      if (Number(request.headers.get("content-length") ?? 0) > 4096)
        return reply({ error: "Account details are too large." }, 413);
      const body = mobileAccountCreateSchema.parse(await request.json());
      forwarded = new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify({ ...body, workspaceId, source: "manual" }) });
    }
    if (operation === "transaction-create") {
      const body = mobileCreateSchema.parse(await request.json());
      forwarded = new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify({ ...body, workspaceId, merchantClean: body.merchantRaw, preserveType: true, isTransfer: body.type === "transfer" }) });
    }
    if (operation === "transaction" && request.method === "PATCH") {
      if (Number(request.headers.get("content-length") ?? 0) > 16384)
        return reply({ error: "Edit is too large." }, 413);
      const body = mobileEditSchema.parse(await request.json());
      if (body.accountId && !(await prisma.account.findFirst({ where: { id: body.accountId, workspaceId, type: { not: "investment" } }, select: { id: true } })))
        return reply({ error: "Choose an account in this Profile." }, 400);
      if (body.categoryId && !(await prisma.category.findFirst({ where: { id: body.categoryId, workspaceId, isArchived: false }, select: { id: true } })))
        return reply({ error: "Choose a category in this Profile." }, 400);
      forwarded = new Request(request.url, {
        method: "PATCH",
        headers: request.headers,
        body: JSON.stringify({ ...body, ...(body.type ? { isTransfer: body.type === "transfer" } : {}) }),
      });
    }
    if (["transactions", "accounts", "imports"].includes(operation)) {
      // Do not expose unbounded list queries to mobile.
      url.searchParams.set("pageSize", "30");
      url.searchParams.set("summaryMode", "light");
      const page = Number(url.searchParams.get("page") ?? 1);
      url.searchParams.set(
        "page",
        String(Number.isInteger(page) && page > 0 && page < 100000 ? page : 1),
      );
      forwarded = new Request(url, { headers: request.headers });
    }
    if (operation === "import-process" || operation === "split-receipt-preview") {
      if (!request.headers.get("content-type")?.includes("multipart/form-data"))
        return reply({ error: "Choose a file to upload." }, 400);
      // This first native transport respects the host's 4.5 MB request limit.
      if (Number(request.headers.get("content-length") ?? 0) > 4_000_000)
        return reply(
          { error: "For files over 3.5 MB, use Clover on the web for now." },
          413,
        );
      const data = await request.formData();
      const file = data.get("file");
      if (!(file instanceof File) || file.size > 3_500_000)
        return reply(
          { error: "Choose a file smaller than 3.5 MB for this preview." },
          413,
        );
      // Reconstruct only supported fields; no training/duplicate bypass flags.
      const safe = new FormData();
      safe.set("file", file);
      safe.set("workspaceId", workspaceId);
      safe.set("fileName", file.name);
      safe.set("fileType", file.type);
      if (typeof data.get("password") === "string")
        safe.set("password", String(data.get("password")));
      const headers = new Headers(request.headers);
      headers.delete("content-type");
      headers.delete("content-length");
      forwarded = new Request(request.url, {
        method: "POST",
        headers,
        body: safe,
      });
    }
    if (operation === "split-group-create" || (operation === "split-group-edit" && request.method === "PATCH")) {
      const text = await request.text();
      if (new TextEncoder().encode(text).length > 10000) return reply({error:"Group details are too large."},413);
      const { mobileGroupInput } = await import("@/lib/mobile-together-input");
      const body = mobileGroupInput.parse(JSON.parse(text));
      forwarded = new Request(request.url,{method:request.method,headers:request.headers,body:JSON.stringify(body)});
    }
    const response = await withMobileRequestContext(
      userId,
      forwarded,
      async () => {
        switch (operation) {
          case "circles":
            return request.method === "POST" ? (await import("@/app/api/circles/route")).POST(forwarded) : (await import("@/app/api/circles/route")).GET(forwarded);
          case "circle":
            return request.method === "PATCH" ? (await import("@/app/api/circles/[circleId]/route")).PATCH(forwarded, { params: Promise.resolve({ circleId: path[1] }) }) : (await import("@/app/api/circles/route")).GET(forwarded);
          case "split-receipt-preview":
            return (await import("@/app/api/split-bill-receipts/preview/route")).POST(forwarded);
          case "split-bills":
            return request.method === "POST" ? (await import("@/app/api/split-bills/route")).POST(forwarded) : (await import("@/app/api/split-bills/route")).GET(forwarded);
          case "split-group-create":
            return (await import("@/app/api/split-bill-groups/route")).POST(forwarded);
          case "split-group-edit": {
            const route=await import("@/app/api/split-bill-groups/[groupId]/route");
            const params={params:Promise.resolve({groupId:path[1]})};
            return request.method === "PATCH" ? route.PATCH(forwarded,params) : route.DELETE(forwarded,params);
          }
          case "resolution":
            return (await import("@/app/api/split-bills/[billId]/resolution/route")).POST(forwarded,{params:Promise.resolve({billId:path[1]})});
          case "payment-profile-delete":
            return (await import("@/app/api/split-bill-payment-profiles/[profileId]/route")).DELETE(forwarded, { params: Promise.resolve({ profileId: path[1] }) });
          case "payment-requests":
            return (await import("@/app/api/split-bills/[billId]/payment-requests/route")).POST(forwarded, { params: Promise.resolve({ billId: path[1] }) });
          case "transfer-settlements":
            return (await import("@/app/api/split-bills/[billId]/transfer-settlements/route")).POST(forwarded, { params: Promise.resolve({ billId: path[1] }) });
          case "preview":
          case "split-bill": {
            const route = await import("@/app/api/split-bills/[billId]/route");
            const params = { params: Promise.resolve({ billId: path[1] }) };
            if (request.method === "DELETE") return route.DELETE(forwarded, params);
            if (request.method === "PATCH" || operation === "preview") {
              const saved = await route.GET(forwarded,params);
              if (!saved.ok) return saved;
              const { bill } = await saved.json();
              const text = await request.text();
              if (new TextEncoder().encode(text).length > 200000) return reply({error:"Bill edit is too large."},413);
              const { mergeMobileBillEdit } = await import("@/lib/mobile-split-bill-edit");
              const body = mergeMobileBillEdit(bill,JSON.parse(text));
              if (operation === "preview") {
                const { previewSplitBillItems } = await import("@/lib/split-bill");
                return reply({ settlement: previewSplitBillItems(body) });
              }
              return route.PATCH(new Request(request.url,{method:"PATCH",headers:request.headers,body:JSON.stringify(body)}),params);
            }
            return route.GET(forwarded,params);
          }
          case "budgets":
            return (await import("@/app/api/budgets/route")).POST(forwarded);
          case "budget": {
            const route = await import("@/app/api/budgets/[budgetId]/route");
            const params = { params: Promise.resolve({ budgetId: path[1] }) };
            return request.method === "PATCH" ? route.PATCH(forwarded, params) : request.method === "DELETE" ? route.DELETE(forwarded, params) : route.GET(forwarded, params);
          }
          case "transactions":
            return (await import("@/app/api/transactions/route")).GET(
              forwarded,
            );
          case "transaction-create":
            return (await import("@/app/api/transactions/route")).POST(forwarded);
          case "account": {
            const route = await import("@/app/api/accounts/[accountId]/route");
            const params = { params: Promise.resolve({ accountId: path[1] }) };
            return request.method === "PATCH" ? route.PATCH(forwarded, params) : request.method === "DELETE" ? route.DELETE(forwarded, params) : route.GET(forwarded, params);
          }
          case "recurring-create":
            return (await import("@/app/api/commitments/route")).POST(forwarded);
          case "recurring-edit": {
            const route = await import("@/app/api/commitments/[commitmentId]/route");
            const params = { params: Promise.resolve({ commitmentId: path[1] }) };
            return request.method === "PATCH" ? route.PATCH(forwarded, params) : route.DELETE(forwarded, params);
          }
          case "recurring-completion":
            return (await import("@/app/api/commitments/[commitmentId]/completion/route")).PATCH(forwarded, { params: Promise.resolve({ commitmentId: path[1] }) });
          case "recurring-dismiss":
            return (await import("@/app/api/recurring-suggestions/dismiss/route")).POST(forwarded);
          case "accounts":
            return (await import("@/app/api/accounts/route")).GET(forwarded);
          case "account-create":
            return (await import("@/app/api/accounts/route")).POST(forwarded);
          case "imports":
            return (await import("@/app/api/imports/route")).GET(forwarded);
          case "transaction": {
            const route = await import(
              "@/app/api/transactions/[transactionId]/route"
            );
            const params = {
              params: Promise.resolve({ transactionId: path[1] }),
            };
            return request.method === "PATCH"
              ? route.PATCH(forwarded, params)
              : request.method === "DELETE" ? route.DELETE(forwarded, params)
              : route.GET(forwarded, params);
          }
          case "import-process":
            return (
              await import("@/app/api/imports/[importId]/process/route")
            ).POST(forwarded, {
              params: Promise.resolve({ importId: path[1] }),
            });
          case "import-status":
            return (
              await import("@/app/api/imports/[importId]/status/route")
            ).GET(forwarded, {
              params: Promise.resolve({ importId: path[1] }),
            });
          case "import-resume":
            return (
              await import("@/app/api/imports/[importId]/resume/route")
            ).POST(forwarded, {
              params: Promise.resolve({ importId: path[1] }),
            });
          default:
            return reply({ error: "Not found" }, 404);
        }
      },
    );
    const responseData = await response.json();
    if (response.ok && operation === "import-status") {
      // An ImportFile row can precede durable source storage. Only release the
      // encrypted device original after the resumable transport acknowledges it.
      const [upload] = await prisma.$queryRaw<{state:string;leaseUntil:Date|null}[]>`SELECT "state","leaseUntil" FROM "NativeUploadSession" WHERE "id"=${path[1]} AND "workspaceId"=${workspaceId} AND "userId"=${userId}`;
      responseData.nativeUploadReceived = upload?.state === "done" || responseData.importFile?.status === "done";
      responseData.nativeUploadFinalizing = upload?.state === "finalizing" && Boolean(upload.leaseUntil && upload.leaseUntil > new Date());
    }
    if (response.ok && request.method === "GET" && (operation === "accounts" || operation === "account")) {
      const rows = operation === "accounts" ? responseData.accounts : [responseData.account];
      const { mobileAccountBalances } = await import("@/lib/mobile-account-balances");
      const balances = await mobileAccountBalances(workspaceId, rows.map((row: { id: string }) => row.id));
      for (const row of rows) row.displayBalance = balances.has(row.id) ? balances.get(row.id) : row.balance;
    }
    return reply(mobileApiResponse(operation, responseData), response.status);
  } catch (error) {
    if(error instanceof NativeInputError)return reply({error:error.message},400);
    if (error instanceof z.ZodError)
      return reply({ error: "Please check the entered fields." }, 400);
    if (error instanceof Error && error.message === "WORKSPACE_NOT_FOUND")
      return reply({ error: "Profile not found" }, 404);
    return reply(
      { error: "Clover could not complete this request. Please retry." },
      503,
    );
  }
}

export { handle as GET, handle as PATCH, handle as POST, handle as DELETE };
