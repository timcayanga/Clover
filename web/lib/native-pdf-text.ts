/** PostgreSQL text/JSON cannot contain NUL. Keep its source glyph losslessly. */
export function encodeNativePdfNullGlyphs(text: string): string {
  return text.includes('\x00')
    ? text.replaceAll('\\', '\\\\').replaceAll('\x00', '\\u0000') + '\nNATIVE_PDF_NULL_GLYPHS_ENCODED'
    : text;
}

/** Decode only fields known to carry the explicit native encoding marker. */
export function decodeNativePdfNullGlyphField(field: string): string {
  return field.replace(/\\(\\|u0000)/g, (_, code: string) => code === '\\' ? '\\' : '\x00');
}
