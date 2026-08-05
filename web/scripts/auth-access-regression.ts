import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const authScreen = readFileSync(resolve(process.cwd(), "components/clerk-auth-screen.tsx"), "utf8");
const clerkProvider = readFileSync(resolve(process.cwd(), "components/clerk-app-provider.tsx"), "utf8");
const morePage = readFileSync(resolve(process.cwd(), "app/more/page.tsx"), "utf8");
const signOutButton = readFileSync(resolve(process.cwd(), "components/more-sign-out-button.tsx"), "utf8");

assert.match(authScreen, /Forgot password\?/u, "Sign-in must expose password recovery");
assert.ok(
  authScreen.indexOf("Forgot password?") > authScreen.indexOf('className="clover-auth-password"'),
  "Password recovery must appear below the password input",
);
assert.match(
  authScreen,
  /That email or password isn’t right\. Please try again\./u,
  "Invalid credentials must use short, privacy-safe copy",
);
assert.match(clerkProvider, /supportEmail="hello@clover\.ph"/u, "Clerk must use Clover's support email");
assert.match(authScreen, /id="clerk-captcha"/u, "Custom sign-up must mount Clerk Smart CAPTCHA");
assert.match(authScreen, /firstName: trimmedFirstName/u, "Sign-up must submit Clerk's required first name");
assert.match(authScreen, /lastName: trimmedLastName/u, "Sign-up must submit Clerk's required last name");
assert.doesNotMatch(authScreen, /oauth_facebook/u, "Disabled social providers must not be shown");
assert.match(authScreen, /reset_password_email_code/u, "Password recovery must use Clerk's supported reset strategy");
assert.match(authScreen, /needs_second_factor/u, "Password sign-in must continue into MFA when Clerk requires it");
assert.match(authScreen, /attemptSecondFactor/u, "MFA codes must be submitted to Clerk");
assert.match(authScreen, /strategy_for_user_invalid/u, "Sign-in errors must explain social-only accounts");
assert.doesNotMatch(
  authScreen,
  /continueSign(In|Up): true/u,
  "Social sign-in must start a fresh Clerk attempt instead of continuing stale authentication state",
);
assert.match(authScreen, /message\.includes\("response: 0"\)/u, "Clerk response-state errors must be handled safely");
assert.match(morePage, /MoreSignOutButton/u, "The mobile More page must expose logout");
assert.match(signOutButton, /signOutToLanding/u, "Mobile logout must use the safe Clover sign-out flow");
assert.match(signOutButton, /clearAllWorkspaceCaches/u, "Mobile logout must clear private workspace caches");

console.log("Auth access regression checks passed.");
