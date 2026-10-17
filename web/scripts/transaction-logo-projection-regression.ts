import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { transactionMerchantLogo } from "../lib/transaction-merchant-logo";
import { enrichMerchantIdentityPayload, resolveMerchantIdentity } from "../lib/merchant-identity";
import { mobileApiResponse } from "../lib/mobile-api-response";

const merchant = { merchantRaw: "STARBUCKS PH", merchantClean: "Starbucks", currency: "PHP", categoryName: "Food & Dining" };
const row = { ...merchant, normalizedPayload: enrichMerchantIdentityPayload(merchant) };
const logo = transactionMerchantLogo(row);
assert.ok(logo.merchantLogoUrl?.includes("starbucks"));
assert.equal(logo.merchantLogoNameKey, JSON.stringify([row.merchantRaw, row.merchantClean]));
assert.equal(transactionMerchantLogo({ ...row, merchantRaw: "Unknown Merchant", merchantClean: "Unknown Merchant" }).merchantLogoUrl, null);
assert.equal(transactionMerchantLogo({ merchantRaw: "PADDLE.NET * OTHER PRODUCT" }).merchantLogoUrl, null);
const projected = mobileApiResponse("transactions", { transactions: [row] }) as { transactions: Record<string, unknown>[] };
assert.equal(projected.transactions[0].merchantLogoUrl, logo.merchantLogoUrl);
assert.equal(projected.transactions[0].merchantLogoNameKey, logo.merchantLogoNameKey);
assert.ok(!("normalizedPayload" in projected.transactions[0]));
assert.ok(!("rawPayload" in projected.transactions[0]));
const ambiguous = { legalName: "First Financial Bank", merchantCountry: "US", industry: "financial-services" };
assert.equal(transactionMerchantLogo(ambiguous).merchantLogoUrl, null);
for (const merchantRaw of ["grab lunch", "Apple juice", "Target savings", "Shellfish lunch", "Transfer to John"]) {
  assert.equal(transactionMerchantLogo({ merchantRaw, currency: "PHP", categoryName: "Food & Dining" }).merchantLogoUrl, null, merchantRaw);
}
assert.ok(transactionMerchantLogo({ merchantRaw: "GRAB *GRABFOOD", currency: "PHP" }).merchantLogoUrl, "An explicit Grab descriptor keeps its logo");
assert.equal(transactionMerchantLogo({ ...row, merchantClean: "Unidentified seller", reviewStatus: "edited" }).merchantLogoUrl, null, "A user correction must not inherit the imported merchant logo");
console.log("Transaction logo projection passed: confident match, stale edits, ambiguous merchant, provider safety, compact native response.");

const ledgerBrands: Record<string,string> = {
  'InstaPay Cash-in':'instapay','Insta Pay Transfer Fee':'instapay',
  'Bills Payment TO Bankard/RCBC FOR 1234':'rcbc','Glorietta':'ayala-malls',
  'Brunos Barbers Makati PH':'brunos-barbers','BOS Coffee Launchpad Mandaluyong PH':'bos-coffee',
  'Chatramue-Huahin Market Prachuap Khirth':'chatramue','MRT-BEM Bangkok TH':'mrt-bangkok',
  'BIG C Pure ONE Bangkok TH':'big-c','THE Marketplace Rock Makati PH':'the-marketplace',
  'Ippudo Rockwell Makati PH':'ippudo','Tsujiri Rockwell Makati PH':'tsujiri',
  'Payment to Bancnet P 2 M Send':'bancnet','Payment to DOTR MRT 3 QR':'mrt-3',
  'Received from Maya reference':'maya','LinkedIn*P Singapore SG':'linkedin',
  'Harlan Coffee Uptown Taguig PH':'harlan-holden','Mary Grace Estancia Pasig City PH':'mary-grace',
  'Payment to OCC ESTANCIA PARKING':'estancia','Wild Flour Greenbelt Makati PH':'wildflour',
  'Yardstick Esteban Makati City PH':'yardstick','Gadc 9 Greenbelt FC Makati PH':'mcdonalds',
  'Hertz Rent A CAR Maun BW':'hertz','Bonifacio High Street':'ayala-malls',
  'Mercury Drug':'mercury-drug','Payment to Fruitas':'fruitas','15-Ppass Lounge Visit':'priority-pass',
  'Viatortripadvisor UK London GB':'viator','Woolworth Maun BW':'woolworths-south-africa',
  'Mitsukoshi BGC Parking Taguig PH':'mitsukoshi','Airalo Singapore SG':'airalo','NowServing':'now-serving',
  'Mystery Manila Quezon City PH':'mystery-manila','Payment to Greenbelt':'ayala-malls',
  'KEY Coffee Kissaten Taguig PH':'key-coffee','Scribd R Scribd.com US':'scribd',
};
for (const [merchantRaw,brand] of Object.entries(ledgerBrands)) {
  const match=resolveMerchantIdentity({merchantRaw});
  assert.equal(match.brandId,brand,merchantRaw);
  assert.ok(transactionMerchantLogo({merchantRaw}).merchantLogoUrl,merchantRaw);
}
for (const merchantRaw of ['Lunch with Mary Grace','Now serving dinner','Fruitasgroup Incorp','Brunos Restaurant','Unknown shop in Glorietta']) {
  assert.equal(transactionMerchantLogo({merchantRaw}).merchantLogoUrl,null,merchantRaw);
}
assert.equal(resolveMerchantIdentity({merchantRaw:'Ippudo Glorietta Makati PH'}).brandId,'ippudo','A venue must not replace the actual restaurant');
assert.equal(resolveMerchantIdentity({merchantRaw:'Gadc 491 Taguig PH',merchantClean:'Tsokolateria',reviewStatus:'confirmed'}).logoPath,null,'Conflicting confirmed merchant labels are preserved');
const old={merchantRaw:'BOS Coffee Launchpad Mandaluyong PH',normalizedPayload:{merchantIdentity:{version:'old',status:'unmatched',inputKey:''}}};
assert.ok(transactionMerchantLogo(old).merchantLogoUrl?.includes('bos-coffee'),'An old unmatched suggestion is re-evaluated against the updated catalog');
console.log(`Ledger logos passed: ${Object.keys(ledgerBrands).length} descriptors, venue precedence, ambiguous-label fallback, confirmed labels and old catalog recovery.`);

const artwork = require("../lib/merchant-logo-additions.json") as { entries: Array<{ iconPath:string; artworkHash:string }> };
for (const entry of artwork.entries) {
  const file=readFileSync(resolve(process.cwd(),"../assets",entry.iconPath.replace("/assets/","")));
  assert.equal(file.subarray(1,4).toString(),"PNG");
  assert.equal(file.readUInt32BE(16),128); assert.equal(file.readUInt32BE(20),128);
  assert.equal(createHash("sha256").update(file).digest("hex"),entry.artworkHash,"Published artwork must match the reviewed source hash");
}
