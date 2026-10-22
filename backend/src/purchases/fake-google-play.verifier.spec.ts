import { FakeGooglePlayVerifier } from './fake-google-play.verifier';

describe('FakeGooglePlayVerifier', () => {
  let verifier: FakeGooglePlayVerifier;

  beforeEach(() => {
    verifier = new FakeGooglePlayVerifier();
  });

  it('trata token comum como compra paga', async () => {
    const info = await verifier.getProductPurchase('credits_10', 'abc');

    expect(info.state).toBe('PURCHASED');
    expect(info.consumed).toBe(false);
    expect(info.obfuscatedAccountId).toBeUndefined();
  });

  it('trata o prefixo pending- como pendente', async () => {
    const info = await verifier.getProductPurchase('credits_10', 'pending-1');

    expect(info.state).toBe('PENDING');
  });

  it('trata o prefixo canceled- como cancelada', async () => {
    const info = await verifier.getProductPurchase('credits_10', 'canceled-1');

    expect(info.state).toBe('CANCELED');
  });

  it('trata o prefixo other-account- como compra de outra conta', async () => {
    const info = await verifier.getProductPurchase(
      'credits_10',
      'other-account-1',
    );

    expect(info.state).toBe('PURCHASED');
    expect(info.obfuscatedAccountId).toBe('another-user');
  });

  it('lembra que a compra foi consumida', async () => {
    await verifier.consumeProductPurchase('credits_10', 'abc');

    const info = await verifier.getProductPurchase('credits_10', 'abc');
    expect(info.consumed).toBe(true);
  });
});
