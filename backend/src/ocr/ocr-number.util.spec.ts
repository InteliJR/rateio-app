import { parseOcrNumber, parseOcrQuantity } from './ocr-number.util';

describe('OCR number parsing', () => {
  it('parses Brazilian currency strings', () => {
    expect(parseOcrNumber('R$ 1.234,56')).toBe(1234.56);
    expect(parseOcrNumber('1.234')).toBe(1234);
    expect(parseOcrNumber('5,50')).toBe(5.5);
    expect(parseOcrNumber('11,00')).toBe(11);
  });

  it('parses plain JSON number strings', () => {
    expect(parseOcrNumber('1234.56')).toBe(1234.56);
    expect(parseOcrNumber('10')).toBe(10);
  });

  it('normalizes quantities', () => {
    expect(parseOcrQuantity('2')).toBe(2);
    expect(parseOcrQuantity('2x')).toBe(2);
    expect(parseOcrQuantity(undefined)).toBe(1);
  });
});
