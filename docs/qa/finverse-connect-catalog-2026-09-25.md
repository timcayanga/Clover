# Connect country and bank presentation

- Country tiles now come only from eligible returned bank connections; empty countries and unknown country codes are omitted.
- Citibank coverage is restricted to Southeast Asia per the requested product policy and intersected with the provider's countries. No countries are added based on a logo's presence.
- Existing Finverse live/test, status and product filters remain enforced; the public website is not used as a catalogue.
- Country labels use full names. Supplied country PNGs are shipped on web and bundled on native. Countries without supplied artwork (including Thailand) retain their flag emoji if an eligible connection is returned because no Thailand image was supplied.
- Bank labels omit personal/business qualifiers. Authentication still uses the original institution ID; distinct login routes are not merged.
- Regional logo files are preferred; existing multi-logo brand definitions now resolve a real logo instead of the generic bank icon.
- Regression coverage includes empty lists, Citi outside Southeast Asia, full names, bundled flag existence, short bank labels, regional logo selection, and the existing authorization/connection route suite.

The full unfiltered Finverse catalogue could not be retrieved locally: downloaded Vercel environment exports omit sensitive credential values. A founder-provided list still needs reconciliation with API statuses and supported products; no unsupported connection has been enabled on that basis.
