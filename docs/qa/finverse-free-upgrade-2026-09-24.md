# Add account → Connect: Free-plan upgrade gate

Figma: https://www.figma.com/design/FNnCmCj90szZAnZ6twMPCy/Screens?node-id=1563-99238

Desktop, mobile web, iOS and Android now have dedicated Free-plan variants. The four entry selectors remain in one row. Connect shows “Unlock bank connections”, an “Upgrade plan” CTA, and a reminder that Manual and Upload remain available. Existing paid bank-list designs remain intact.

Web and native clients use the authenticated institutions response to determine access. Bank search and bank actions stay hidden until access resolves. The Free CTA opens Plan settings. Callback sync waits for allowed access. The server resolves effective entitlements (including subscriptions, grants, store access and staging access), returns a non-cacheable upgrade state for Free, and rejects direct Free connection requests. Existing paid account quotas remain enforced.

Validation:
- Route regression covers Free bank-list gating and connection rejection, no provider bank calls or connection creation for Free, and Plus/Pro access after upgrade, alongside existing workspace isolation and callback replay checks.
- Browser fixture renders the actual web component with the Free response at desktop and 390px mobile width; CTA and helper text are visible, bank search/list absent, Plan settings link correct.
- Figma screenshot reviewed for all four layouts.
- Native implementation shares the same gate and uses the existing full-width button and native Plan route. Native release bundles are checked by qa:prepush; this is not an installed-device or app-store release verification.
