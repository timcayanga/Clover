// Clover Screens, 14 September 2026. Presentation only; never classify balances.
export const avatarGradients = [
  ["#0BAFC1", "#67DFB3"],
  ["#AD8DE9", "#65C5E8"],
  ["#FFB579", "#F18DAD"],
  ["#8CCBCB", "#B3E2CC"],
] as const;
export function avatarGradient(name: string): readonly [string, string] {
  const hash = Array.from(name.trim()).reduce(
    (value, char) => (value * 31 + char.charCodeAt(0)) | 0,
    0,
  );
  return avatarGradients[Math.abs(hash) % avatarGradients.length];
}
export function accountTypeIcon(type: string) {
  const key = type.toLowerCase().replaceAll(" ", "_");
  if (["bank_account", "savings", "checking"].includes(key)) return "bank";
  if (key === "liability") return "loan";
  return [
    "bank",
    "wallet",
    "credit_card",
    "cash",
    "investment",
    "loan",
    "mortgage",
    "line_of_credit",
    "receivable",
    "payable",
    "bnpl",
    "prepaid",
    "insurance",
  ].includes(key)
    ? key
    : "other";
}
export function accountRowColors(
  type: string,
  institution: string,
  dark = false,
): readonly [string, string] {
  const key = accountTypeIcon(type);
  if (["loan", "mortgage", "line_of_credit", "payable", "bnpl"].includes(key))
    return dark ? ["#482E32", "#FFE8E3"] : ["#FAE3DE", "#173B42"];
  if (["cash", "insurance", "receivable", "prepaid", "other"].includes(key))
    return dark ? ["#173E40", "#D6F2ED"] : ["#D6F2ED", "#173B42"];
  if (key === "investment")
    return dark ? ["#263F48", "#E2F8F4"] : ["#BAEAE2", "#173B42"];
  const name = institution.toLowerCase();
  const brand = [
    ["bpi", "#D91F3A"],
    ["metrobank", "#1769B0"],
    ["maya", "#141A20"],
    ["unionbank", "#F97316"],
    ["rcbc", "#279BD1"],
    ["gcash", "#1479F3"],
    ["wise", "#21853D"],
    ["bdo", "#164995"],
  ].find(([label]) => name.includes(label));
  return brand
    ? [brand[1], "#FFFFFF"]
    : dark
      ? ["#193A43", "#E2F8F4"]
      : ["#D6F2ED", "#173B42"];
}
