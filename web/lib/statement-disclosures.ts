const disclosureHeading = /^(?:unbilled installments?(?: purchases?| principal| schedule)?|installments?\s*purchases?|installment (?:balance|plan) summary|(?:rewards?|loyalty|points|miles) (?:summary|balance|activity summary)|portfolio (?:snapshot|valuation|holdings|summary)|(?:investment|holdings) (?:snapshot|valuation|summary))\s*:?$/i;
const movementHeading = /^(?:installment\s*amortization\s*:?|(?:posted\s+)?transaction (?:details|history|activity)\s*:?|(?:sale date|transaction date|transaction post date|posted date|date)\b.*\b(?:description|details|particulars)\b.*\b(?:amount|debit|credit|balance)\b.*)$/i;

export function statementMovementLines(lines: string[]) {
  let inDisclosure = false;
  return lines.filter(line => {
    const heading = line.trim().replace(/\s+/g, " ");
    if (disclosureHeading.test(heading)) {
      inDisclosure = true;
      return false;
    }
    if (movementHeading.test(heading)) inDisclosure = false;
    return !inDisclosure;
  });
}

export const isStatementDisclosureDescription = (description: string) =>
  /^(?:(?:prior|previous|opening|beginning|starting|closing|ending)(?: statement)? balance|balance (?:brought|carried) forward|balance this statement|(?:rewards?|loyalty|points|miles) (?:summary|balance|available|expiring)|(?:points|miles) (?:earned|redeemed)|(?:portfolio|holdings|investment) (?:snapshot|valuation|summary)|unbilled installment (?:amount|balance|principal)|installment (?:balance|principal) (?:outstanding|remaining|summary))$/i.test(description.trim().replace(/\s+/g, " ").replace(/\s*[:–-]$/, ""));
