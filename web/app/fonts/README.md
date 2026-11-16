# Bundled Clover brand fonts

Poppins (400/500/600/700) and Raleway (500/600/700), normal style. These replace the build-time `next/font/google` fetch with `next/font/local`; the CSS variable names, selected weights and swap behavior are retained. Next.js still serves the font files from Clover.

The full Google Fonts CSS API TTF responses were losslessly encoded as WOFF2 using FontTools. Glyphs were not subsetted or redesigned. `provenance.json` records source URLs, original SHA-256 checksums and resulting WOFF2 checksums. Both upstream SIL Open Font Licenses are included. This avoids mutable Google CSS URLs without mocking, disabling TLS checks or patching Next.js dependencies.
