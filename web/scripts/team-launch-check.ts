// Explicit one-time launch check, run in Vercel's build environment so sensitive
// production credentials never need to be exported to a developer machine.
import { randomUUID } from "node:crypto";
import { S3Client, GetBucketCorsCommand, PutBucketCorsCommand, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

async function main() {
  if (process.env.CLOVER_TEAM_LAUNCH_CHECK !== "1") return;
  if (process.env.VERCEL_ENV !== "production") throw new Error("Production launch environment required");
  const response = await fetch("https://api.clerk.com/v1/users?email_address=hello%40clover.ph", {
    headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` },
  });
  if (!response.ok) throw new Error(`Clerk launch check failed (${response.status})`);
  const users = await response.json() as Array<{email_addresses: Array<{email_address: string; verification?: {status?: string}}>}>;
  console.log("Team launch: owner account exists:", users.length > 0, "verified:", users.some(u => u.email_addresses.some(e => e.email_address.toLowerCase() === "hello@clover.ph" && e.verification?.status === "verified")));
  const bucket = process.env.CLOVER_TEAM_MEDIA_BUCKET || process.env.R2_BUCKET_NAME;
  if (!bucket || !process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) throw new Error("R2 configuration missing");
  const client = new S3Client({ region: "auto", endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY }});
  try {
    let rules;
    try { rules = (await client.send(new GetBucketCorsCommand({Bucket: bucket}))).CORSRules || []; }
    catch (error) { if ((error as {name?: string}).name !== "NoSuchCORSConfiguration") throw error; rules = []; }
    const launchId = "clover-team-studio";
    const updated = [...rules.filter(r => r.ID !== launchId), {ID: launchId, AllowedOrigins: ["https://team.clover.ph"], AllowedMethods: ["PUT", "GET", "HEAD"], AllowedHeaders: ["Content-Type"], ExposeHeaders: ["ETag"], MaxAgeSeconds: 3600}];
    await client.send(new PutBucketCorsCommand({Bucket: bucket, CORSConfiguration: {CORSRules: updated}}));
    console.log("Team launch: studio CORS configured; existing rules preserved.");
  } catch (error) {
    if ((error as {name?: string}).name !== "AccessDenied") throw error;
    console.log("Team launch: CORS management requires Cloudflare dashboard access. Browser upload verification remains required.");
  }
  const key = `team-staging/launch-check/${randomUUID()}`;
  try {
    await client.send(new PutObjectCommand({Bucket: bucket, Key: key, Body: "Clover private storage launch check", ContentType: "text/plain"}));
    const url = await getSignedUrl(client, new GetObjectCommand({Bucket: bucket, Key: key}), {expiresIn: 60});
    const signed = await fetch(url);
    if (!signed.ok) throw new Error("Signed media read failed");
    await signed.arrayBuffer();
    const unsigned = new URL(url); unsigned.search = "";
    const anonymous = await fetch(unsigned);
    if (anonymous.ok) throw new Error("Anonymous R2 read unexpectedly allowed");
    console.log("Team launch: signed storage access passed; anonymous S3 access denied.");
  } finally { await client.send(new DeleteObjectCommand({Bucket: bucket, Key: key})); }
}
main().catch(error => { console.error("Team launch check failed:", error instanceof Error ? error.name : "unknown"); process.exitCode = 1; });
