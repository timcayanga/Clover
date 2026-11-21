export async function displayRates(sources: string[], currency: string) {
  const rates = new Map<string, number>();
  rates.set(currency, 1);
  await Promise.all(
    [...new Set(sources)]
      .filter((c) => c !== currency)
      .map(async (base) => {
        try {
          const response = await fetch(
            `https://api.frankfurter.dev/v2/rates?base=${encodeURIComponent(base)}&quotes=${currency}`,
            { next: { revalidate: 21600 }, signal: AbortSignal.timeout(5000) },
          );
          if (!response.ok) return;
          const result = (await response.json()) as { rate: number }[];
          if (Number.isFinite(result[0]?.rate) && result[0].rate > 0)
            rates.set(base, result[0].rate);
        } catch {
          /* Missing FX is unavailable, never zero. */
        }
      }),
  );
  return rates;
}
