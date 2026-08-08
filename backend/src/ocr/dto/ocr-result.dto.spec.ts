import 'reflect-metadata';
import { OcrResultDto } from './ocr-result.dto';
import { MeasurementUnit } from '@prisma/client';

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

  it('preserves fractional quantities and normalizes measurement units', async () => {
    const dto = await OcrResultDto.fromOpenAiResponse({
      items: [
        {
          name: 'Comida por quilo',
          quantity: '0,750',
          unit: 'kg',
          unitPrice: 'R$ 80,00',
          totalPrice: 'R$ 60,00',
        },
      ],
      totalAmount: 'R$ 60,00',
    });

    expect(dto.items[0]).toMatchObject({
      quantity: 0.75,
      measurementUnit: MeasurementUnit.KILOGRAM,
      unitPrice: 80,
      totalPrice: 60,
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
