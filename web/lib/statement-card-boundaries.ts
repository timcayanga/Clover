export type StatementCardSection = {
  role: "primary" | "supplementary" | "unspecified";
  last4: string | null;
};

const roleHeading = /^(primary|principal|basic|main|supplementary|supplemental|additional)\s+card(?:holder)?(?=\s*(?:$|[:#-]|[*Xx•\d]|(?:number|no\.?|ending)\b))/i;
const cardNumberHeading = /^(?:(?:primary|principal|basic|main|supplementary|supplemental|additional)\s+)?(?:credit\s+)?card(?:\s+(?:account\s+)?(?:number|no\.?|ending(?:\s+in)?|#))?\s*[:#-]?\s*(?=[*Xx•\d])/i;
const identifier = /^(?:[\d*Xx•][\d*Xx• -]*)?\d{4}$/;

export function readStatementCardBoundary(line: string, nextLine?: string) {
  const role = line.match(roleHeading);
  const number = line.match(cardNumberHeading);
  if (!role && !number && !/^card\s+(?:number|no\.?)\s*:?$/i.test(line)) return null;

  const inline = number ? line.slice(number[0].length).trim() : "";
  const nextNumber = nextLine?.trim() ?? "";
  const consumesNext = !inline && identifier.test(nextNumber);
  const value = inline || (consumesNext ? nextNumber : "");
  if (!role && !identifier.test(value)) return null;
  return {
    card: {
      role: !role ? "unspecified" : /^(?:supplementary|supplemental|additional)$/i.test(role[1]) ? "supplementary" : "primary",
      last4: identifier.test(value) ? value.slice(-4) : null,
    } satisfies StatementCardSection,
    consumesNext,
  };
}
