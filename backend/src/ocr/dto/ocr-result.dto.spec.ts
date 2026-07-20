import 'reflect-metadata';
import { OcrResultDto } from './ocr-result.dto';

describe('OcrResultDto', () => {
  it('normalizes pt-BR currency strings before validation', async () => {
    const dto = await OcrResultDto.fromOpenAiResponse({
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
    });

    expect(dto.totalAmount).toBe(11);
    expect(dto.items).toHaveLength(1);
    expect(dto.items[0]).toMatchObject({
      name: 'Coca Cola',
      quantity: 2,
      unitPrice: 5.5,
      totalPrice: 11,
    });
  });

  it('accepts common Portuguese field aliases', async () => {
    const dto = await OcrResultDto.fromOpenAiResponse({
      establishmentName: 'Padaria Teste',
      items: [
        {
          nome: 'Pao frances',
          quantidade: '3',
          valorTotal: 'R$ 9,00',
        },
      ],
      totalGeral: '9,00',
    });

    expect(dto.totalAmount).toBe(9);
    expect(dto.items[0]).toMatchObject({
      name: 'Pao frances',
      quantity: 3,
      unitPrice: 3,
      totalPrice: 9,
    });
  });
});
