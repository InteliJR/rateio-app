import 'reflect-metadata';
import { OcrService } from './ocr.service';

describe('OcrService parsing fallback', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_MODEL = 'gpt-4.1-mini';
  });

  it('keeps items when fallback JSON contains pt-BR currency strings', () => {
    const service = new OcrService();
    const parsed = (service as any).parseJsonResponseUnvalidated(
      {
        establishmentName: 'Mercado Teste',
        items: [
          {
            name: 'Coca Cola',
            quantity: '2',
            unitPrice: 'R$ 5,50',
            totalPrice: 'R$ 11,00',
          },
        ],
        totalAmount: 'R$ 11,00',
      },
      '',
    );

    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]).toMatchObject({
      name: 'Coca Cola',
      quantity: 2,
      unitPrice: 5.5,
      totalPrice: 11,
    });
    expect(parsed.totalAmount).toBe(11);
  });

  it('keeps items when fallback JSON uses Portuguese field names', () => {
    const service = new OcrService();
    const parsed = (service as any).parseJsonResponseUnvalidated(
      {
        establishmentName: 'Padaria Teste',
        items: [
          {
            nome: 'Pao frances',
            quantidade: '3',
            valorTotal: 'R$ 9,00',
          },
        ],
        totalGeral: 'R$ 9,00',
      },
      '',
    );

    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]).toMatchObject({
      name: 'Pao frances',
      quantity: 3,
      unitPrice: 3,
      totalPrice: 9,
    });
    expect(parsed.totalAmount).toBe(9);
  });
});
