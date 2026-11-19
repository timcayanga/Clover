export function statementPdf(lines: string[], paddingBytes = 0, nextPages: string[][] = [], size: { width: number; height: number; unicode?: boolean } = { width: 612, height: 792 }) {
  const pages = [lines, ...nextPages];
  const cidFontId = 4 + pages.length * 2;
  const descriptorId = cidFontId + 1;
  const unicodeId = cidFontId + 2;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, index) => `${4 + index * 2} 0 R`).join(" ")}] >>`,
    size.unicode
      ? `<< /Type /Font /Subtype /Type0 /BaseFont /Helvetica /Encoding /Identity-H /DescendantFonts [${cidFontId} 0 R] /ToUnicode ${unicodeId} 0 R >>`
      : "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ...pages.flatMap((page, index) => {
      const content = " ".repeat(index === 0 ? paddingBytes : 0) +
        `BT /F1 11 Tf 50 ${size.height - 42} Td 18 TL ${page.map((line, lineIndex) => size.unicode
          ? `1 0 0 1 ${line === 'Receipt Summary' ? 350 : 50} ${size.height - 42 - lineIndex * 18} Tm <${line.split('').map(char=>char.charCodeAt(0).toString(16).padStart(4,'0')).join('')}> Tj`
          : `(${line.replace(/([\\()])/g, "\\$1")}) Tj T*`).join("\n")} ET`;
      return [
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${size.width} ${size.height}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + index * 2} 0 R >>`,
        `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
      ];
    }),
  ];
  if (size.unicode) {
    const cmap = "/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /FixtureUnicode def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n1 beginbfrange\n<0000> <FFFF> <0000>\nendbfrange\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend";
    objects.push(
      `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /Helvetica /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${descriptorId} 0 R /DW 500 /CIDToGIDMap /Identity >>`,
      "<< /Type /FontDescriptor /FontName /Helvetica /Flags 32 /FontBBox [-100 -250 1000 1000] /ItalicAngle 0 /Ascent 800 /Descent -200 /CapHeight 700 /StemV 80 >>",
      `<< /Length ${cmap.length} >>\nstream\n${cmap}\nendstream`,
    );
  }
  let pdf = "%PDF-1.4\n";
  const offsets = objects.map((object, index) => {
    const offset = pdf.length;
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  return new TextEncoder().encode(pdf + `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets.map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("") +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${pdf.length}\n%%EOF\n`);
}
