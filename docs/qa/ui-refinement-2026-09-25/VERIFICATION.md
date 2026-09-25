# September 25 UI refinement verification

## Local iOS verification

Device Hub: iPhone 17 Pro, iOS 26.5, Clover Preview; disposable staging QA profile. No EAS builds.

Verified in the UI:
- Cold launch lands on Home. Correct Home/Adviser icons and combined Income/Expenses remain present.
- Narrow menu contains Settings and Help; navigation opens/closes through the animated drawer.
- Home Money quick-access switches to its child shortcuts.
- Accounts currency dropdown switches to PHP and displays one summary set and matching accounts; account cards have subdued backgrounds.
- Reports summary information buttons are small and upper right. Premium Insights text is purple with no visible Plus badge. Trends and Insights use section headings.
- Transaction details show title and amount together, eight compact editable rows, small Add To heading, and shared bottom navigation. Saving the existing Notes value on a synthetic transaction completed successfully.
- Budget and Goal cards open details; actual names appear in headers with Back/Adviser, distinct tabs, and red delete actions. Goal shows Monthly Target. Creation forms use sheets and row dropdowns; Goal has no Cancel.
- Circles directory has white dotted Create card, full-card opening, and invitations after the directory. Circle detail shows the name and distinct tabs.
- Bill and group details show Back/Adviser headers and shared navigation; group card opens its detail.
- Add Account: grouped type options, shared Ask composer, upload tiles, and bottom-nav dismissal.
- Add Recurring: shared sheet/method controls and type/repeat/account dropdowns. Recurring detail shows inline fields.
- Add Investment: dedicated title, Stock fields, and Bond-specific principal/date/rate/maturity fields.
- Add Transaction: drag dismissal returned to the previous Home screen.
- Add Split Bill: corrected directory overlay mounting; verified opening, shared Ask composer, three upload tiles, and drag dismissal returning to Split Bills.

## Automated checks

`npm run qa:prepush` passed on September 25 after adding the new modal route to analytics coverage. It includes native typechecking, API regressions, offline checks, native bundle exports, web regressions/typechecking and production build. The subsequent Split Bill overlay placement correction was verified in the local iOS app; normal pre-push hook will rerun the full gate on final commit.

## Pending completion

- Android device verification of this revision.
- Final Figma visual review across affected shared frames/variants.
- Staging deployment and deployed web/API verification.

No real confirmed financial records were changed during testing.
