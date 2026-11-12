import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { VerifyGooglePurchaseDto } from './verify-google-purchase.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const errors = await validate(
    plainToInstance(VerifyGooglePurchaseDto, payload),
  );
  return errors.map((error) => error.property);
}

describe('VerifyGooglePurchaseDto', () => {
  it('aceita produto e token válidos', async () => {
    expect(
      await errorsFor({ productId: 'credits_10', purchaseToken: 'abc' }),
    ).toEqual([]);
  });

  it('exige produto e token', async () => {
    expect(await errorsFor({})).toEqual(['productId', 'purchaseToken']);
  });

  it('recusa valores que não são texto', async () => {
    expect(
      await errorsFor({ productId: 10, purchaseToken: { a: 1 } }),
    ).toEqual(['productId', 'purchaseToken']);
  });

  it('recusa token maior que 4096 caracteres', async () => {
    expect(
      await errorsFor({
        productId: 'credits_10',
        purchaseToken: 'a'.repeat(4097),
      }),
    ).toEqual(['purchaseToken']);
  });
});
