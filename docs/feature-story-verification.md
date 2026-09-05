# Feature landing stories

The main landing journey remains the public home page. Six focused stories reuse its navigation, branding, actions, and regional Pro comparison:

| Route | Products | Lead and setting |
| --- | --- | --- |
| /features/manage-money | Transactions · Accounts · Recurring | Asian woman organizing records after errands |
| /features/understand-your-money | Adviser · Reports | Black woman reviewing her money at a park-side café |
| /features/plan-ahead | Investments · Budgeting · Goals | Asian man reviewing longer-term finances and planning a workspace upgrade |
| /features/manage-money-together | Circles · Split Bills | Light-skinned man hosting dinner with the same four friends |
| /features/security | Data review and account controls | Asian woman reviewing records privately in a library alcove |
| /features/pro | Free and Pro comparison | Black woman managing a more involved financial life from her studio |

Each story has five chapters, scroll-linked background motion, a closing outcome photograph, an unframed chapter tracker, and reduced-motion handling. Portrait assets are composed separately and inset beneath the mobile header; product overlays are omitted on mobile. Images cannot be dragged. Pricing rows enter progressively.

The old /features hub redirects home. gain-insights, grow-together, and older feature aliases resolve to the renamed pages. Product names beneath dropdown tasks use regular weight.

Supporting visuals use captured Clover UI with fictional records in the same shared phone component as the main landing page: Transactions, Accounts, Recurring, Reports, Adviser, Investments, Budgeting, Goals, Circles, and Split Bills. Reports captures the actual Money over time section; Goals captures the actual goal setup section. These are not AI-generated app screens or separately drawn marketing cards. No user records, account storage, or workspace requests are used by the public feature page. PHP and USD captures follow the landing page's country selection. See [capture provenance](feature-screen-captures.md).

The phone is limited to the clear far-right strip on desktop and hidden on mobile. Pro comparison uses a translucent wash and blurred background. Extra chapter eyebrows and product subtitles are removed from the story copy; product subtitles remain in the Features dropdown. Outside pointer presses dismiss the dropdown independently of the rest of the header.

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

Main story scroll distance remains 2.8 screen heights. Feature chapters each receive a full 42svh reading interval (2.1 screen heights total across five chapters). Chapter selection uses equal intervals, independent of photo interpolation. The final content chapter is tested throughout its 60–80% scroll interval. The closing photograph starts transitioning only when the final CTA enters, so it cannot intrude behind the preceding product screen. Background scene timing has explicit holds for both main tables and the feature Pro table.

landing-polish-browser-check.mjs checks all nine main chapters at desktop and two mobile sizes, identical type sizes by role, viewport bounds, dashed-path removal, and identical scene transforms/opacity at three points inside each table chapter. The 180-check feature browser matrix was repeated after the shared typography change.
