import { MAX_MONEY_VALUE } from '../common/numeric-limits';
import { OcrResult } from './dto/ocr-result.dto';
import {
  CREDIT_RELEASE_REASONS,
  creditRunKey,
  failedReleaseReason,
  isCreditsEnforcementEnabled,
  isUsableOcrResult,
} from './ocr-credits';

describe('ocr-credits', () => {
  const item = (over: Record<string, unknown> = {}) => ({
    name: 'Chopp',
    quantity: 2,
    measurementUnit: 'UNIT',
    unitPrice: 5,
    totalPrice: 10,
    ...over,
  });
  const result = (over: Partial<OcrResult> = {}): OcrResult =>
    ({
      rawText: 'texto bruto de teste suficientemente longo',
      source: 'MODEL_JSON',
      totalAmount: 10,
      items: [item()],
      ...over,
    }) as OcrResult;

  describe('isUsableOcrResult', () => {
    it('aceita JSON validado do modelo com itens válidos', () => {
      expect(isUsableOcrResult(result())).toBe(true);
    });

    it('aceita quando o total não foi lido', () => {
      expect(isUsableOcrResult(result({ totalAmount: undefined }))).toBe(true);
    });

    it.each([['JSON_UNVALIDATED'], ['TEXT_FALLBACK'], [undefined]])(
      '(a) rejeita origem %p',
      (source) => {
        expect(isUsableOcrResult(result({ source: source as never }))).toBe(
          false,
        );
      },
    );

    it('(b) rejeita sem itens', () => {
      expect(isUsableOcrResult(result({ items: [] }))).toBe(false);
    });

    it.each([
      ['nome vazio', { name: '   ' }],
      ['quantidade zero', { quantity: 0 }],
      ['quantidade negativa', { quantity: -1 }],
      ['preço total zero', { totalPrice: 0 }],
      ['preço total NaN', { totalPrice: NaN }],
    ])('(b) rejeita item com %s', (_name, over) => {
      expect(isUsableOcrResult(result({ items: [item(over)] }))).toBe(false);
    });

    it('(b) um item ruim entre bons invalida a leitura', () => {
      expect(
        isUsableOcrResult(result({ items: [item(), item({ totalPrice: 0 })] })),
      ).toBe(false);
    });

    it('(d) rejeita valores acima de MAX_MONEY_VALUE', () => {
      expect(
        isUsableOcrResult(
          result({ items: [item({ totalPrice: MAX_MONEY_VALUE + 0.01 })] }),
        ),
      ).toBe(false);
      expect(
        isUsableOcrResult(result({ totalAmount: MAX_MONEY_VALUE + 0.01 })),
      ).toBe(false);
    });

    it('(d) aceita exatamente MAX_MONEY_VALUE', () => {
      expect(
        isUsableOcrResult(
          result({
            items: [
              item({ unitPrice: MAX_MONEY_VALUE, totalPrice: MAX_MONEY_VALUE }),
            ],
            totalAmount: MAX_MONEY_VALUE,
          }),
        ),
      ).toBe(true);
    });
  });

  describe('creditRunKey', () => {
    it('execução 1 usa o próprio jobId (compatível com reserve:${jobId})', () => {
      expect(creditRunKey({ id: 'job-1', creditRun: 1 })).toBe('job-1');
      expect(creditRunKey({ id: 'job-1' })).toBe('job-1');
    });

    it('execução n > 1 usa jobId:n', () => {
      expect(creditRunKey({ id: 'job-1', creditRun: 2 })).toBe('job-1:2');
      expect(creditRunKey({ id: 'job-1', creditRun: 10 })).toBe('job-1:10');
    });
  });

  describe('motivos de release', () => {
    it('são códigos fixos', () => {
      expect(CREDIT_RELEASE_REASONS).toEqual({
        unusableResult: 'UNUSABLE_RESULT',
        discardedBillChanged: 'DISCARDED_BILL_CHANGED',
      });
      expect(failedReleaseReason('TIMEOUT')).toBe('OCR_FAILED_TIMEOUT');
    });
  });

  describe('isCreditsEnforcementEnabled', () => {
    afterEach(() => {
      delete process.env.CREDITS_ENFORCEMENT_ENABLED;
    });

    it('só liga com exatamente "true"; o padrão é desligado', () => {
      expect(isCreditsEnforcementEnabled()).toBe(false);
      for (const value of ['false', '', '1', 'TRUE', 'yes']) {
        process.env.CREDITS_ENFORCEMENT_ENABLED = value;
        expect(isCreditsEnforcementEnabled()).toBe(false);
      }
      process.env.CREDITS_ENFORCEMENT_ENABLED = 'true';
      expect(isCreditsEnforcementEnabled()).toBe(true);
    });
  });
});
