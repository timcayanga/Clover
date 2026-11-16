import { getAccountWalletBrand } from "./account-brand";
/** Reuse the exact Accounts identity; payment options do not invent bank colors. */
export function paymentOptionBrand(provider: string, label: string) {
  const brand = getAccountWalletBrand({
    institution: provider,
    name: label,
    type: "bank",
  });
  const stops = [
    ...brand.background.matchAll(/(#[0-9a-f]{6})(?:\s+(\d+(?:\.\d+)?)%)?/gi),
  ];
  const colors = stops.map((stop) => stop[1]);
  return {
    brandLogoUrl: brand.logoSrc,
    brandPalette: {
      colors: colors.length >= 2 ? colors : [brand.accent, brand.accent],
      foreground: brand.foreground,
    },
  };
}
