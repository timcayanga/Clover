import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const authScreen = readFileSync(resolve(process.cwd(), "components/clerk-auth-screen.tsx"), "utf8");
const morePage = readFileSync(resolve(process.cwd(), "app/more/page.tsx"), "utf8");
const signOutButton = readFileSync(resolve(process.cwd(), "components/more-sign-out-button.tsx"), "utf8");

assert.match(authScreen, /Forgot password\?/u, "Sign-in must expose password recovery");
assert.match(authScreen, /reset_password_email_code/u, "Password recovery must use Clerk's supported reset strategy");
assert.match(authScreen, /needs_second_factor/u, "Password sign-in must continue into MFA when Clerk requires it");
assert.match(authScreen, /attemptSecondFactor/u, "MFA codes must be submitted to Clerk");
assert.match(authScreen, /strategy_for_user_invalid/u, "Sign-in errors must explain social-only accounts");
assert.match(morePage, /MoreSignOutButton/u, "The mobile More page must expose logout");
assert.match(signOutButton, /signOutToLanding/u, "Mobile logout must use the safe Clover sign-out flow");
assert.match(signOutButton, /clearAllWorkspaceCaches/u, "Mobile logout must clear private workspace caches");

console.log("Auth access regression checks passed.");
