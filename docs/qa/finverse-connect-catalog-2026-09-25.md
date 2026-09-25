# Connect country and bank presentation

- Country tiles now come only from eligible returned bank connections; empty countries and unknown country codes are omitted.
- Citibank coverage is restricted to Southeast Asia per the requested product policy and intersected with the provider's countries. No countries are added based on a logo's presence.
- Existing Finverse live/test, status and product filters remain enforced; the public website is not used as a catalogue.
- Country labels use full names. Supplied country PNGs are shipped on web and bundled on native. Countries without supplied artwork (including Thailand) retain their flag emoji if an eligible connection is returned because no Thailand image was supplied.
- Bank labels omit personal/business qualifiers. Authentication still uses the original institution ID; distinct login routes are not merged.
- Regional logo files are preferred; existing multi-logo brand definitions now resolve a real logo instead of the generic bank icon.
- Regression coverage includes empty lists, Citi outside Southeast Asia, full names, bundled flag existence, short bank labels, regional logo selection, and the existing authorization/connection route suite.

Admin can retrieve the full institution catalogue at `/api/admin/finverse/catalog` or download `?format=csv`. This calls Finverse on the server using its configured credentials and exports only display metadata, provider status, supported products and exclusion reasons. Hidden entries remain in the report, but no unsupported connection is enabled. The founder-provided list can be reconciled against this export.

## September 25 coverage reconciliation

Connect is limited to Hong Kong, Indonesia, Malaysia, Philippines, Singapore,
and Vietnam. Thailand is excluded even when provider institutions include THA.
`shared/finverse-coverage.ts` records named banks from
https://www.finverse.com/bank-data-api and the founder's PH/VN table supplied by
Tim. “Other Banks” is not an institution and cannot be fabricated as a link.
The website's Maya/SCB entries are retained only if the live API supports them.
BDO, Vietcombank, ACB, Techcombank and other beta entries are not force-enabled;
HSBCnet's Q3 target is not evidence of current availability. Live links require
real tags, SUPPORTED status, account and transaction products, and an actual ID.
Test banks remain available in test mode, limited to the same six countries.
Business-only country-specific labels survive abbreviated brand names on web
and native. Existing links and confirmed financial records are untouched.
