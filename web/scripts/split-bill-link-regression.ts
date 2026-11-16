import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { paymentAppLink, paymentMessageLink, paymentRequestPath, parsePaymentAppLink, paymentOrigin } from "../../shared/payment-request-links";
import { redirectSystemPath } from "../../mobile/app/+native-intent";
import { GET } from "../app/.well-known/apple-app-site-association/route";

async function main() {
const token = "aB_12-".repeat(6);
for (const origin of ["https://clover.ph", "https://staging.clover.ph"]) {
  const url = origin + paymentRequestPath(token);
  assert.deepEqual(parsePaymentAppLink(url), {token, origin});
  const custom = paymentAppLink(token, origin);
  assert.deepEqual(parsePaymentAppLink(custom), {token, origin});
  const route = redirectSystemPath({path:url,initial:true});
  assert.equal(route, `/payment-request?token=${token}&origin=${encodeURIComponent(origin)}`);
  const intent = paymentAppLink(token, origin, true);
  assert.match(intent, /package=ph\.clover\.app;/);
  const fallback = decodeURIComponent(intent.split("S.browser_fallback_url=")[1].split(";end")[0]);
  assert.equal(fallback, `${url}?browser=1`);
  assert.deepEqual(parsePaymentAppLink(fallback), {token,origin});
}
for (const link of [
  `https://clover.ph.evil.com/split-bill/request/${token}`,
  `http://clover.ph/split-bill/request/${token}`,
  `https://clover.ph:444/split-bill/request/${token}`,
  `https://someone@clover.ph/split-bill/request/${token}`,
  `https://clover.ph/split-bill/request/${token}/extra`,
  "clover://payment-request?token=short",
  `clover://payment-request?token=${token}&origin=https://evil.com`,
  `clover://evil/payment-request?token=${token}`,
]) assert.equal(parsePaymentAppLink(link),null, link);
assert.throws(() => paymentAppLink(token,"https://evil.com"));
assert.throws(() => paymentRequestPath("short"));
assert.equal(paymentOrigin("https://clover.ph/"),null);
assert.equal(redirectSystemPath({path:"clover://sso-callback?created_session_id=untrusted",initial:true}),"/auth?restartSSO=1");
assert.equal(redirectSystemPath({path:"clover://sso-callback?created_session_id=untrusted",initial:false}),null);
const message="Hi Mia! Lunch + taxi: PHP 475 & thanks 🌿\n";
assert.equal(paymentMessageLink("sms","+63 (917) 123-4567",message),`sms:+639171234567?body=${encodeURIComponent(message)}`);
assert.equal(paymentMessageLink("sms","09171234567",message,true),`sms:09171234567&body=${encodeURIComponent(message)}`);
assert.equal(paymentMessageLink("sms","123?body=other",message),null);
assert.equal(paymentMessageLink("email","mia@example.com?bcc=evil@example.com",message),null);
assert.equal(paymentMessageLink("email","mia@example.com\r\nBcc:evil@example.com",message),null);
assert.equal(new URL(paymentMessageLink("email","mia+clover@example.com",message)!).searchParams.get("body"),message);
const response=GET(); assert.equal(response.status,200);
const aasa=await response.json();
assert.deepEqual(aasa.applinks.details[0].appIDs,["6XX38GYURG.ph.clover.app"]);
assert.equal(aasa.applinks.details[0].components[0].exclude,true);
assert.equal(aasa.applinks.details[0].components[0]["?"].browser,"1");
assert.equal(aasa.applinks.details[0].components[1]["/"],"/split-bill/request/*");
const assetlinks=JSON.parse(readFileSync("public/.well-known/assetlinks.json","utf8"));
assert.equal(assetlinks[0].target.package_name,"ph.clover.app");
assert.match(assetlinks[0].target.sha256_cert_fingerprints[0],/^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/);
console.log("PASS payment links: trusted origin and token, Android intent/browser fallback, native routing, OAuth isolation, safe recipient composers, verified website associations.");

}
void main().catch(error => { console.error(error); process.exitCode=1; });
