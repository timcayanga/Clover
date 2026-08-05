import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const onboardingForm = readFileSync(resolve(process.cwd(), "components/onboarding-form.tsx"), "utf8");
const onboardingRoute = readFileSync(resolve(process.cwd(), "app/api/onboarding/route.ts"), "utf8");
const onboardingPage = readFileSync(resolve(process.cwd(), "app/onboarding/page.tsx"), "utf8");
const continuePage = readFileSync(resolve(process.cwd(), "app/continue/page.tsx"), "utf8");

const uploadOpenHandler = onboardingForm.slice(
  onboardingForm.indexOf("const openImportFiles"),
  onboardingForm.indexOf("const handleFilePickerChange"),
);

assert.doesNotMatch(
  uploadOpenHandler,
  /persistOnboarding/u,
  "Opening or cancelling an import must not complete onboarding",
);
assert.match(
  onboardingForm,
  /if \(summary\.optimistic\) \{[\s\S]*?return;[\s\S]*?await persistOnboarding\("import"\)/u,
  "A completed, non-optimistic import must finish onboarding",
);
assert.match(onboardingForm, /capture="environment"/u, "Mobile onboarding must offer the rear camera");
assert.match(onboardingForm, /Upload photos/u, "Onboarding must offer photo upload");
assert.match(onboardingForm, /Upload files/u, "Onboarding must offer file upload");
assert.doesNotMatch(onboardingForm, /Set a goal/u, "Onboarding must not include goal setup");
assert.doesNotMatch(
  onboardingRoute,
  /planTier:\s*"free"/u,
  "Completing onboarding must not overwrite a paid or admin-assigned plan",
);
assert.match(onboardingRoute, /assertTrustedRequestOrigin/u, "Onboarding completion must reject untrusted origins");
assert.match(onboardingRoute, /requireAuth/u, "Onboarding completion must require authentication");
assert.match(onboardingPage, /hasCompletedOnboarding/u, "Completed users must skip onboarding");
assert.match(continuePage, /hasCompletedOnboarding/u, "Post-auth routing must resolve onboarding status directly");
assert.match(continuePage, /redirect\(hasCompletedOnboarding\(user\) \? "\/home" : "\/onboarding"\)/u);

console.log("Onboarding regression checks passed.");
