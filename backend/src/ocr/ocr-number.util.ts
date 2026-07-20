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

  const sanitized = trimmed
    .replace(/\s/g, '')
    .replace(/[^\d,.-]/g, '');

  if (!sanitized || sanitized === '-' || sanitized === ',' || sanitized === '.') {
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
  const parsed = parseOcrNumber(value);
  if (!parsed || parsed < 1) {
    return 1;
  }

  return Math.max(1, Math.floor(parsed));
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
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
