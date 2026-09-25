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

## Final iOS refresh

The final native bundle was re-exported locally, re-signed and installed. After clearing disposable build-cache files to restore computer-use startup, the normal device controls verified Home cold launch, the menu, loaded Reports with the small information controls and premium styling, and Add Transaction drag dismissal back to Reports. The Android blur-target correction is included. No alternative iOS control tools or EAS builds were used.

## Automated checks

`npm run qa:prepush` passed on September 25 after adding the new modal route to analytics coverage. It includes native typechecking, API regressions, offline checks, native bundle exports, web regressions/typechecking and production build. The normal pre-push gate passed again on merged revision `b42dd99c` and CSS follow-up `61d35789`.

## Local Android verification

Local release APK, API 35 emulator, disposable staging QA profile. No EAS builds.

- Found and fixed a RenderThread crash when opening Reports: the blur target enclosed its own navigation blur. Detail navigation now sits outside the content blur target. Reports, Insights, transaction details, and Circles open successfully afterward.
- Home shows the correct Home/Adviser assets and combined Income/Expenses without a month heading.
- Menu is narrow; Settings and Help are present after scrolling.
- Add Transaction opens above the prior page; dragging the handle returns to Home. Account choices include account icons without a search field, and Table Entry uses an icon.
- Accounts switches USD to PHP with one summary set and matching cards. Add Account has four equal methods and a proper-case type dropdown.
- Reports premium labels are colored, headings use section typography, and detail screens retain bottom navigation.
- Recurring header remains fixed while scrolling the calendar. Detail fields are compact inline-edit rows; Add Recurring uses the shared sheet and dropdowns.
- Budget and Goal cards open their named detail headers, with distinct tab icons. Creation sheets use row dropdowns; Add Goal has no Cancel.
- Investments has aligned header controls, matching history selectors, colored premium tabs, and a dedicated Add Investment sheet. Ask Clover shows in-field plus/microphone; Upload shows three large tiles.
- Create Circle shows the centered photo placeholder and type dropdown; dragging its handle returns to Circles.
- Bill Details keeps its header fixed while scrolling. The full group card opens its named detail. Add Split Bill opens with shared methods; dragging the handle returns to the previous Groups view.

## Staging verification

`61d3578904d14972bec969772b0604b78c642e61` is READY and aliased to `https://staging.clover.ph` (deployment `dpl_8ddQEMqi89EKB2PNVMz2iJ6QAKP8`).

- Browser: Reports and Investments premium labels compute to `rgb(133, 97, 175)` with no visible Plus badge. Reports information buttons measure 20 × 20 pixels at a 390-pixel viewport. Desktop and mobile views checked; temporary viewport override cleared.
- Mobile API: created a synthetic QA bond with principal, rate, start/maturity dates, and maturity value. A duplicate creation attempt with a different balance returned 409; a subsequent read retained the original balance and all investment fields. No real financial records were edited.

## Figma completion

Updated the shared light/dark designs and creation variants in `FNnCmCj90szZAnZ6twMPCy`. Changes cover premium labels, information controls, report headings, compact detail rows and header actions, grouped creation controls, shared Ask composers and upload tiles, circle invitations/Create treatment, portfolio icons and dedicated investment entry.

Final visual review checked Transaction Details, Recurring Details, Add Split Bill Ask, Add Investment Ask, and the Circle directory. The review caught and corrected the remaining creation close controls, older separate-send composer variants, and Recurring's left-positioned Adviser action. Earlier reviews covered Reports cards and the other canonical creation/detail frames. Hidden Goal card labels were restored.

The shared mobile components feed the mobile web/iOS/Android comparison frames. Native gesture/animation behavior was checked in the apps; Figma's drawer uses a push prototype transition. The optional All Currencies aggregate view was not added: Accounts uses the selected owned currency and one summary set.


No real confirmed financial records were changed during testing.
