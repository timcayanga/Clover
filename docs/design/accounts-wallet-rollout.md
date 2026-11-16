# Accounts: approved refined wallets

Approved October 8, 2026. Presentation-only rollout; balances, grouping, edits,
imports, deletion confirmation and bank-linking behavior retain their existing logic.

- Playground source: `46Gkv8RNuwrOAfjStef58m`, desktop `8:280`, refined light
  `42:3369`, refined dark `43:3680`.
- Main Screens: `FNnCmCj90szZAnZ6twMPCy`, Accounts desktop `1243:503144` /
  `1247:536055`; mobile `1243:503143` / `1247:536054`; expanded `266:220` /
  `759:283152`; currency states `266:402` / `759:283353`.
- Main Screens wallet variables: `VariableCollectionId:2173:100234`, Light / Dark.
- Shared finishes: warm stone leather in light mode, graphite leather in dark mode.
  Radius 22, rim 6, overlapping cards 16, continuous 16-pixel front pocket. The
  pocket uses the same leather color and has no independent shadow or dark band.
- Card colors follow institution logos and generic account icons. Registered
  custom logos and institution resolution remain intact. Desktop keeps full
  satin cards; mobile keeps grouped, expandable wallet rows.
- Porcelain summary: four columns on desktop, two by two on mobile.

Validation: web/native TypeScript, iOS and Android bundle exports, account-logo,
account-card gallery, mobile-balance, native account-deletion/adaptive-layout,
swipe-delete browser and Accounts wallet browser checks. The wallet browser check
uses the production row function and real components with fictional balances and
no live financial writes, at 320/390/768/1100/1440 pixels in light and dark mode.

Vercel deployments update desktop/mobile web and the native API. Installed native
apps need new signed builds; a web deployment alone does not update native UI.


## October 9 sleeve refinement

Main Screens light/dark collapsed, expanded and currency states now use editable card pockets and the shared rounded sleeve component (2182:100235). The approved full card ratio is 85.6:53.98. Collapsed rows expose 60px with no inter-row gap; opening grows the wallet downward and reveals all four card corners. Sleeve edges are 6px, clipped inside the stitching, including the last card. Wallets have no outer shadow; empty-slot contact shadows fade away when a card is pulled out.

Web and native reuse the existing institution/generic brand resolver and account details actions. The web card stays mounted through motion and swipe deletion retains its confirmation. Shared geometry and spring regression coverage live in `web/scripts/wallet-motion-regression.ts`; the browser harness additionally checks both themes, 320–1440px layouts, physical proportions, sleeve clearance, rapid reversal, reduced motion, details access, selected-logo palettes, and deletion cancellation.
