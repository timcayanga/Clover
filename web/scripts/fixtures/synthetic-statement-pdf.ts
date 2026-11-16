export function statementPdf(lines: string[], paddingBytes = 0, nextPages: string[][] = []) {
  const pages = [lines, ...nextPages];
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, index) => `${4 + index * 2} 0 R`).join(" ")}] >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ...pages.flatMap((page, index) => {
      const content = " ".repeat(index === 0 ? paddingBytes : 0) +
        `BT /F1 11 Tf 50 750 Td 18 TL ${page.map(line => `(${line.replace(/([\\()])/g, "\\$1")}) Tj T*`).join("\n")} ET`;
      return [
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + index * 2} 0 R >>`,
        `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
      ];
    }),
  ];
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
