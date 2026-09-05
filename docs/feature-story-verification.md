# Feature landing stories

The main landing journey remains the public home page. Six focused stories reuse its navigation, branding, actions, and regional Pro comparison:

| Route | Products | Lead and setting |
| --- | --- | --- |
| /features/manage-money | Transactions · Accounts · Recurring | Asian woman organizing records after errands |
| /features/understand-your-money | Adviser · Reports | Black woman reviewing her money at a park-side café |
| /features/plan-ahead | Budgeting · Goals | Asian man planning a workspace upgrade |
| /features/manage-money-together | Circles · Split Bills | Light-skinned man hosting dinner with the same four friends |
| /features/security | Data review and account controls | Asian woman reviewing records privately in a library alcove |
| /features/pro | Free and Pro comparison | Black woman managing a more involved financial life from her studio |

Each story has five chapters, scroll-linked background motion, a closing outcome photograph, an unframed chapter tracker, and reduced-motion handling. Portrait assets are composed separately and inset beneath the mobile header; product overlays are omitted on mobile. Images cannot be dragged. Pricing rows enter progressively.

The old /features hub redirects home. gain-insights, grow-together, and older feature aliases resolve to the renamed pages. Product names beneath dropdown tasks use regular weight.

Supporting visuals use the existing fictional Transactions capture, FinancialAccountCard, ReportsMoneyOverTimeChart, GoalIllustration, and SplitBillEntityAvatar. Other read-only cards illustrate sample Adviser, budget, recurring, and source-record states. No user records, account storage, or workspace requests are used. PHP and USD demonstrations follow the landing page's country selection.

## Verification

- Browser matrix: all five chapters on all six stories at 1440×900, 390×844, 320×568, 1024×768, 1440×600, and 820×1180 (180 checks).
- Checked title visibility, horizontal overflow, loaded image assets, mobile overlay suppression, and chapter progression.
- Visually reviewed desktop and mobile opening/closing scenes, the pricing table, Transactions, Accounts, and Adviser illustrations.
- Checked the mobile menu, regular-weight product subtitles, legacy URL redirects, original home journey, country rendering, and absence of private-data API requests.
- Critical-page-loading regression covers story count, chapter identifiers, navigation products, all 24 image assets, aliases, reduced motion, and non-draggable images.

Run the browser matrix against a local server with:

    AGENT_BROWSER_BIN=/absolute/path/to/agent-browser node web/scripts/feature-story-browser-check.mjs

The default test origin is http://localhost:3012; override FEATURE_TEST_URL when needed.

Image generation prompts and repository asset paths are recorded in feature-story-art-direction.md. The 24 optimized WebP assets total approximately 2.6 MB.

## Shared landing polish

Main and feature stories share title, body, action, and table type scales through landing-type.module.css. Desktop copy is vertically centered and left aligned. The decorative dashed path is removed.

Main story scroll distance is 280 viewport heights in percent units (2.8 screen heights total), down from 4.2 on desktop / 4.4 on mobile. Each feature transition uses 35svh instead of 55svh. Background scene timing has explicit holds for both main tables and the feature Pro table; table entry/exit animation does not alter the held photograph.

landing-polish-browser-check.mjs checks all nine main chapters at desktop and two mobile sizes, identical type sizes by role, viewport bounds, dashed-path removal, and identical scene transforms/opacity at three points inside each table chapter. The 180-check feature browser matrix was repeated after the shared typography change.
