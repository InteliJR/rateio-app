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

  it('lê a quantidade do prefixo qty<N>-', async () => {
    const info = await verifier.getProductPurchase('credits_1', 'qty5-abc');

    expect(info.state).toBe('PURCHASED');
    expect(info.quantity).toBe(5);
  });

  it('deixa a quantidade vazia em token comum', async () => {
    const info = await verifier.getProductPurchase('credits_1', 'abc');

    expect(info.quantity).toBeUndefined();
  });

  it('devolve a conta informada como dona da compra paga', async () => {
    const info = await verifier.getProductPurchase(
      'credits_1',
      'abc',
      'user-1',
    );

    expect(info.obfuscatedAccountId).toBe('user-1');
  });

  it('trata o prefixo no-account- como compra sem identificação', async () => {
    const info = await verifier.getProductPurchase(
      'credits_1',
      'no-account-1',
      'user-1',
    );

    expect(info.state).toBe('PURCHASED');
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
