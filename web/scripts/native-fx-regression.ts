import assert from "node:assert/strict";
import { GET, POST } from "../app/api/mobile/v1/[...path]/route";
const state = (globalThis as any).__nativeFxFixture as { active: boolean; user: boolean; admin: boolean; workspaceChecks: number; userReads: number; fetches: number };
if (!state) throw Error("Use the isolated native FX provider fixture.");
async function main() {
  const oldEnabled = process.env.CLOVER_MOBILE_API_ENABLED, oldFetch = global.fetch;
  process.env.CLOVER_MOBILE_API_ENABLED = "true";
  global.fetch = async input => { state.fetches++; assert(String(input).startsWith("https://api.frankfurter.dev/v2/rates?")); return Response.json([{base:"USD",quote:"PHP",rate:56,date:"2026-10-07"}]); };
  const request = (token="test-token", operation="fx-rate", query="base=USD&quote=PHP", method="GET") => new Request(`https://clover.example/api/mobile/v1/${operation}?${query}`,{method,headers:token?{Authorization:`Bearer ${token}`}:{}});
  const context = (path="fx-rate") => ({params:Promise.resolve({path:[path]})});
  try {
    const result = await GET(request(),context());
    assert.equal(result.status,200,"authenticated FX quotes must work without a Profile ID");
    assert.equal((await result.json()).rate,56);
    assert.equal(result.headers.get("Cache-Control"),"private, no-store, max-age=0");
    assert.equal(state.workspaceChecks,0);
    const fetched = state.fetches;
    assert.equal((await GET(request(""),context())).status,401);
    assert.equal((await GET(request("invalid"),context())).status,401);
    state.active=false;assert.equal((await GET(request(),context())).status,401);state.active=true;
    state.user=false;assert.equal((await GET(request(),context())).status,409);state.user=true;
    state.admin=true;assert.equal((await GET(request(),context())).status,403);state.admin=false;
    assert.equal((await POST(request("test-token","fx-rate","base=USD&quote=PHP","POST"),context())).status,404);
    assert.equal(state.fetches,fetched,"authentication/operation failures must not reach the provider");
    assert.equal((await GET(request("test-token","accounts",""),context("accounts"))).status,400,"financial data still requires a Profile");
    assert.equal((await GET(request("test-token","accounts","workspaceId=other"),context("accounts"))).status,404);
    assert.equal(state.workspaceChecks,1,"financial data still checks ownership");
    console.log("Native FX dispatch passed: real handler, no Profile required for reference quotes, authentication and financial Profile isolation retained.");
  } finally { global.fetch=oldFetch; if(oldEnabled===undefined)delete process.env.CLOVER_MOBILE_API_ENABLED;else process.env.CLOVER_MOBILE_API_ENABLED=oldEnabled; }
}
void main().catch(error=>{console.error(error);process.exitCode=1});
