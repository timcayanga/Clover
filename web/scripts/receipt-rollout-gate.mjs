import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const platforms = ["ios", "android", "mobile_web", "desktop_web"];
const routes = ["server_receipt_reader", "server_local_ppocr", "ios_vision", "android_ml_kit", "backup_visual"];
const fields = ["merchant", "date", "currency", "total"];
const minimumSample = 30;
const speedFloor = 0.90;
const coreAccuracyFloor = 0.95;
const fieldAccuracyFloor = 0.95;

function meets(exact, total, floor) {
  return Number.isSafeInteger(exact) && Number.isSafeInteger(total) &&
    total >= minimumSample && exact >= 0 && exact <= total && exact / total >= floor;
}

export function evaluateReceiptRollout(release, speed, accuracy) {
  const blockers = [];
  if (!release || speed?.release !== release || accuracy?.release !== release) {
    blockers.push("Speed and accuracy evidence must both identify the candidate release.");
  }
  if (!/^[a-f0-9]{64}$/i.test(accuracy?.manifestSha256 ?? "")) {
    blockers.push("A verified blind-manifest digest is required.");
  }
  for (const platform of platforms) {
    const records = speed?.platforms?.filter(row => row.platform === platform) ?? [];
    const result = records[0];
    if (records.length !== 1 || !meets(result?.visibleWithin10s, result?.acceptedImages, speedFloor)) {
      blockers.push(`${platform}: at least ${minimumSample} accepted attempts and 90% visible within 10 seconds on first attempt required.`);
    }
  }
  for (const route of routes) {
    const records = accuracy?.reports?.filter(row => row.route === route) ?? [];
    const result = records[0];
    if (records.length !== 1 || result?.outcomes?.unavailable !== 0 ||
        !meets(result?.automaticCore?.exact, result?.automaticCore?.eligible, coreAccuracyFloor)) {
      blockers.push(`${route}: complete blind run and 95% automatically extracted with every core field exact required.`);
    }
    for (const field of fields) {
      const score = result?.fields?.[field];
      if (!meets(score?.exact, score?.labeled, fieldAccuracyFloor)) {
        blockers.push(`${route}/${field}: at least ${minimumSample} labels and 95% exact required.`);
      }
    }
  }
  return { release, passed: blockers.length === 0, blockers };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [release, speedPath, accuracyPath] = process.argv.slice(2);
    if (!release || !speedPath || !accuracyPath) throw new Error("Usage: receipt-rollout-gate.mjs <release> <speed.json> <verified-blind-score.json>");
    const [speed, accuracy] = await Promise.all([speedPath, accuracyPath].map(async path => JSON.parse(await readFile(path, "utf8"))));
    const gate = evaluateReceiptRollout(release, speed, accuracy);
    console.log(JSON.stringify(gate, null, 2));
    if (!gate.passed) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
