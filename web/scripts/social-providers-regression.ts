import assert from "node:assert/strict";
import { getSocialProviders, isAndroidDevice } from "../lib/social-providers";

const cases = [
  ["Android phone", "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36", "", true],
  ["Android tablet", "Mozilla/5.0 (Linux; Android 14; SM-X910) AppleWebKit/537.36 Chrome/130 Safari/537.36", "", true],
  ["Android desktop mode with client hints", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130 Safari/537.36", "Android", true],
  ["iPhone", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile Safari/604.1", "", false],
  ["iPad desktop mode", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15", "", false],
  ["Windows", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36", "Windows", false],
  ["unknown browser", "", "", false],
] as const;

for (const [name, userAgent, platform, android] of cases) {
  assert.equal(isAndroidDevice(userAgent, platform), android, name);
  assert.deepEqual(getSocialProviders(isAndroidDevice(userAgent, platform)).map(p => p.strategy),
    android ? ["oauth_google"] : ["oauth_google", "oauth_apple"], name);
}
console.log("Social provider platform regression passed.");
