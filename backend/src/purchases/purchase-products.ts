/**
 * Catálogo de produtos consumíveis, lido de GOOGLE_PLAY_PRODUCTS no formato
 * "productId:créditos,productId:créditos" (ex.: "credits_10:10,credits_30:30").
 */
export function getProductCredits(productId: string): number | undefined {
  const entries = (process.env.GOOGLE_PLAY_PRODUCTS ?? '')
    .split(',')
    .map((entry) => entry.trim().split(':'))
    .filter(([id, credits]) => id && Number.isInteger(Number(credits)));

  const match = entries.find(([id]) => id === productId);
  const credits = match ? Number(match[1]) : undefined;
  return credits && credits > 0 ? credits : undefined;
}