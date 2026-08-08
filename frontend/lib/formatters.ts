const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export const round2 = (value: number) => Math.round(value * 100) / 100;

export const formatCurrency = (value: number) =>
  currencyFormatter.format(Number.isFinite(value) ? value : 0);

export const formatNumberPtBr = (
  value: number,
  minimumFractionDigits = 0,
  maximumFractionDigits = 2,
) =>
  new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(Number.isFinite(value) ? value : 0);

export const formatEditableNumber = (
  value: number,
  maximumFractionDigits = 2,
) => {
  if (!Number.isFinite(value) || value === 0) {
    return "";
  }

  return formatNumberPtBr(value, 0, maximumFractionDigits);
};

export const parsePtBrNumber = (value: string) => {
  const normalized = value
    .trim()
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const sanitizePtBrNumberInput = (
  value: string,
  maximumFractionDigits = 2,
) => {
  const sanitized = value.replace(/[^0-9,.-]/g, "");
  const signal = sanitized.startsWith("-") ? "-" : "";
  const unsigned = sanitized.replace(/-/g, "");
  const separatorIndex = unsigned.search(/[,.]/);

  if (separatorIndex === -1) {
    return signal + unsigned;
  }

  const integerPart = unsigned.slice(0, separatorIndex);
  const decimalPart = unsigned
    .slice(separatorIndex + 1)
    .replace(/[,.]/g, "")
    .slice(0, maximumFractionDigits);

  return `${signal}${integerPart},${decimalPart}`;
};
