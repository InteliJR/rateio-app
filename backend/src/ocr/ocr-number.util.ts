import { MAX_ITEM_QUANTITY, MIN_ITEM_QUANTITY } from '../common/numeric-limits';

export function parseOcrNumber(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const sanitized = trimmed.replace(/\s/g, '').replace(/[^\d,.-]/g, '');

  if (
    !sanitized ||
    sanitized === '-' ||
    sanitized === ',' ||
    sanitized === '.'
  ) {
    return undefined;
  }

  const hasComma = sanitized.includes(',');
  const hasDot = sanitized.includes('.');
  let normalized = sanitized;

  if (hasComma && hasDot) {
    const lastComma = sanitized.lastIndexOf(',');
    const lastDot = sanitized.lastIndexOf('.');
    const decimalSeparator = lastComma > lastDot ? ',' : '.';
    const thousandsSeparator = decimalSeparator === ',' ? '.' : ',';

    normalized = sanitized
      .replace(new RegExp(`\\${thousandsSeparator}`, 'g'), '')
      .replace(decimalSeparator, '.');
  } else if (hasComma) {
    normalized = normalizeSingleSeparator(sanitized, ',');
  } else if (hasDot) {
    normalized = normalizeSingleSeparator(sanitized, '.');
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseOcrQuantity(value: unknown): number {
  const parsed =
    typeof value === 'string'
      ? parseQuantityString(value)
      : parseOcrNumber(value);

  if (
    parsed === undefined ||
    parsed < MIN_ITEM_QUANTITY ||
    parsed > MAX_ITEM_QUANTITY
  ) {
    return 1;
  }

  return roundQuantity(parsed);
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function roundQuantity(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function parseQuantityString(value: string): number | undefined {
  const sanitized = value
    .trim()
    .replace(/\s/g, '')
    .replace(/[^\d,.-]/g, '');

  // Em quantidades, três casas representam normalmente peso/volume,
  // enquanto em valores monetários o mesmo formato pode ser milhar.
  if (/^-?\d+[,.]\d{1,3}$/.test(sanitized)) {
    const parsed = Number(sanitized.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return parseOcrNumber(value);
}

function normalizeSingleSeparator(value: string, separator: ',' | '.'): string {
  const parts = value.split(separator);

  if (parts.length <= 2) {
    const decimalPart = parts[1];
    if (decimalPart && decimalPart.length === 3) {
      return parts.join('');
    }

    return value.replace(separator, '.');
  }

  const decimalPart = parts[parts.length - 1];
  if (decimalPart.length === 2) {
    return `${parts.slice(0, -1).join('')}.${decimalPart}`;
  }

  return parts.join('');
}
