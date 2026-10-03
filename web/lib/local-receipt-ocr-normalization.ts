/** Review-only repairs for optical spacing and narrowly bounded label damage.
 * Raw OCR lines and the original image remain in the extraction audit trail.
 * Never repair a digit, infer a currency, or replace a recognized total.
 */
export function normalizeLocalReceiptOcrText(source: string) {
  const spaced = source
    // Printed decimal cents and thousands groups can be separated by OCR
    // whitespace. Join only existing digits, never manufacture or correct one.
    .replace(/(\d)([.,])[ \t]+(?=\d{2,3}(?:\D|$))/g, "$1$2")
    .replace(/^(\s*\d[\d,]*[.,])\r?\n[ \t]*(\d{2})[ \t]*$/gm, "$1$2")
    .replace(/^([ \t]*(?:sub[ \t]*total|grand[ \t]+total|total|amount[ \t]+due|vat[ \t]+amount|tax|service[ \t]+charge|discount|tip)[ \t]*[:：]?)[ \t]*\r?\n[ \t]*(\d[\d.,]*)[ \t]*$/gim, "$1 $2");
  const lines = spaced.split(/\r?\n/);
  const strictKoreanTotal =
    /^(?:총결제금액|실결제금액|결제금액|결제액|합계|총합계(?!액))\s*[:：]?\s*\d/m.test(
      spaced.replace(/([가-힣])\s+(?=[가-힣])/g, "$1"),
    );
  return lines
    .map((line) => {
      // Common l/I/1/r confusion on the final letter. A whole final-total label
      // and a complete integer token are required; never match item descriptions.
      const final = line.match(
        /^grand\s+tota[Il1r]\s*[:：]?\s*((?:\d{1,3}(?:[.,]\d{3})+|\d+))$/i,
      );
      if (final) return `Grand Total ${final[1]}`;
      if (!strictKoreanTotal) {
        const damaged = line.match(
          /^결[\s"'·-]*제[\s"'·-]*[약의엑악][\s"'·:：-]+((?:\d{1,3}(?:,\d{3})+|\d+))(?:\s*원)?$/,
        );
        if (damaged) {
          const amount = damaged[1]!;
          // A second independently printed occurrence must corroborate the
          // unchanged amount. Ambiguous or conflicting totals still go to review.
          const repeated = lines.filter(
            (other) =>
              other !== line &&
              new RegExp(`(^|[^0-9,])${amount}(?=[^0-9,]|$)`).test(other),
          ).length;
          if (repeated) return `결제액 ${amount}`;
        }
      }
      return line;
    })
    .join("\n");
}
