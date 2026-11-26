import { randomUUID } from 'crypto';
import { CreditsService } from '../../src/credits/credits.service';
import { GooglePlayVerifier } from '../../src/purchases/google-play-verifier';
import {
  FAKE_RECEIPT_IMAGE,
  SmokeApp,
  SmokeUser,
  createSmokeApp,
  fakeOcrResult,
  registerUser,
  waitForBillStatus,
  waitUntil,
} from '../support/smoke-app';

// Compra no Google Play → crédito no ledger, contra Postgres real. O Google
// Play é o verificador falso (GOOGLE_PLAY_VERIFIER=fake): o prefixo do token
// decide o resultado (pending-, canceled-, other-account-; o resto é pago).
describe('Fumaça: compra → crédito', () => {
  let smoke: SmokeApp;
  let credits: CreditsService;
  let verifier: GooglePlayVerifier;
  let verifierSpy: jest.SpyInstance | undefined;
  const PRODUCT = 'credits_10';
  const PRODUCT_CREDITS = 10;
  const previousEnv = {
    CREDITS_ENFORCEMENT_ENABLED: process.env.CREDITS_ENFORCEMENT_ENABLED,
    CREDITS_FREE_QUOTA: process.env.CREDITS_FREE_QUOTA,
    GOOGLE_PLAY_VERIFIER: process.env.GOOGLE_PLAY_VERIFIER,
    GOOGLE_PLAY_PRODUCTS: process.env.GOOGLE_PLAY_PRODUCTS,
  };

  beforeAll(async () => {
    // Lidos na criação dos serviços, então precisam vir antes da aplicação.
    // Sem cota gratuita, todo crédito do usuário vem da compra.
    process.env.CREDITS_ENFORCEMENT_ENABLED = 'true';
    process.env.CREDITS_FREE_QUOTA = '0';
    process.env.GOOGLE_PLAY_VERIFIER = 'fake';
    process.env.GOOGLE_PLAY_PRODUCTS = `${PRODUCT}:${PRODUCT_CREDITS}`;

    smoke = await createSmokeApp();
    credits = smoke.app.get(CreditsService);
    verifier = smoke.app.get(GooglePlayVerifier);
  });

  afterEach(() => {
    // Só o verificador: restoreAllMocks desfaria também o mock do rate limit.
    verifierSpy?.mockRestore();
    verifierSpy = undefined;
  });

  afterAll(async () => {
    await smoke.close();
    // As suítes rodam no mesmo processo: não vazar a configuração para as outras.
    for (const [name, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  });

  function buy(user: SmokeUser, purchaseToken: string, productId = PRODUCT) {
    return smoke
      .http()
      .post('/purchases/google')
      .set(user.auth)
      .send({ productId, purchaseToken });
  }

  /** A loja passa a responder que toda compra foi paga. */
  function storeConfirmsPayment() {
    verifierSpy = jest
      .spyOn(verifier, 'getProductPurchase')
      .mockResolvedValue({ state: 'PURCHASED', consumed: false });
  }

  async function available(userId: string) {
    return (await credits.getBalance(userId)).available;
  }

  function purchaseRows(userId: string) {
    return smoke.prisma.creditTransaction.findMany({
      where: { userId, type: 'PURCHASE' },
    });
  }

  it('compra paga soma exatamente os créditos do produto', async () => {
    const user = await registerUser(smoke, 'compra-ok');
    const token = `paid-${randomUUID()}`;

    const response = await buy(user, token).expect(201);

    expect(response.body).toMatchObject({
      status: 'CREDITED',
      productId: PRODUCT,
      credits: PRODUCT_CREDITS,
      alreadyCredited: false,
    });
    expect(await available(user.id)).toBe(PRODUCT_CREDITS);

    const purchase = await smoke.prisma.purchase.findUniqueOrThrow({
      where: { purchaseToken: token },
    });
    expect(purchase.consumedAt).not.toBeNull();

    const rows = await purchaseRows(user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      amount: PRODUCT_CREDITS,
      idempotencyKey: `purchase:${purchase.id}`,
      // O token fica só na tabela de compras.
      purchaseToken: null,
    });
  });

  it('o mesmo token enviado 10 vezes em paralelo credita uma vez', async () => {
    const user = await registerUser(smoke, 'compra-10x');
    const token = `paid-${randomUUID()}`;

    const responses = await Promise.all(
      Array.from({ length: 10 }, () => buy(user, token)),
    );

    for (const response of responses) {
      expect(response.status).toBe(201);
    }
    expect(await available(user.id)).toBe(PRODUCT_CREDITS);
    expect(await purchaseRows(user.id)).toHaveLength(1);
    expect(
      await smoke.prisma.purchase.count({ where: { purchaseToken: token } }),
    ).toBe(1);
  });

  it('reenviar o token depois de creditado não soma de novo', async () => {
    const user = await registerUser(smoke, 'compra-replay');
    const token = `paid-${randomUUID()}`;

    await buy(user, token).expect(201);
    const replay = await buy(user, token).expect(201);

    expect(replay.body).toMatchObject({
      status: 'CREDITED',
      alreadyCredited: true,
    });
    expect(await available(user.id)).toBe(PRODUCT_CREDITS);
  });

  it('token já usado por outro usuário → 403 e nada creditado', async () => {
    const owner = await registerUser(smoke, 'compra-dono');
    const intruder = await registerUser(smoke, 'compra-intruso');
    const token = `paid-${randomUUID()}`;

    await buy(owner, token).expect(201);
    await buy(intruder, token).expect(403);

    expect(await available(owner.id)).toBe(PRODUCT_CREDITS);
    expect(await available(intruder.id)).toBe(0);
  });

  it('compra vinculada a outra conta na loja → 403 e REJECTED', async () => {
    const user = await registerUser(smoke, 'compra-outra-conta');
    const token = `other-account-${randomUUID()}`;

    await buy(user, token).expect(403);

    const purchase = await smoke.prisma.purchase.findUniqueOrThrow({
      where: { purchaseToken: token },
    });
    expect(purchase.status).toBe('REJECTED');
    expect(await available(user.id)).toBe(0);
  });

  it('compra cancelada → 400 e nada creditado', async () => {
    const user = await registerUser(smoke, 'compra-cancelada');
    const token = `canceled-${randomUUID()}`;

    await buy(user, token).expect(400);

    const purchase = await smoke.prisma.purchase.findUniqueOrThrow({
      where: { purchaseToken: token },
    });
    expect(purchase.status).toBe('CANCELED');
    expect(await available(user.id)).toBe(0);
  });

  it('produto desconhecido → 400 e nenhuma compra registrada', async () => {
    const user = await registerUser(smoke, 'compra-produto');
    const token = `paid-${randomUUID()}`;

    await buy(user, token, 'produto_inexistente').expect(400);

    expect(
      await smoke.prisma.purchase.count({ where: { purchaseToken: token } }),
    ).toBe(0);
  });

  it('pendente não credita; depois de paga, o reconcile credita uma vez', async () => {
    const user = await registerUser(smoke, 'compra-pendente');
    const token = `pending-${randomUUID()}`;

    const pending = await buy(user, token).expect(201);
    expect(pending.body).toMatchObject({ status: 'PENDING' });
    expect(await available(user.id)).toBe(0);

    storeConfirmsPayment();

    const first = await smoke
      .http()
      .post('/purchases/reconcile')
      .set(user.auth)
      .expect(201);
    expect(first.body).toEqual([
      expect.objectContaining({ status: 'CREDITED' }),
    ]);

    // Nada mais pendente: um segundo reconcile não credita de novo.
    await smoke.http().post('/purchases/reconcile').set(user.auth).expect(201);

    expect(await available(user.id)).toBe(PRODUCT_CREDITS);
    expect(await purchaseRows(user.id)).toHaveLength(1);
  });

  it('reconcile só mexe nas compras do próprio usuário', async () => {
    const owner = await registerUser(smoke, 'reconcile-dono');
    const other = await registerUser(smoke, 'reconcile-outro');

    await buy(owner, `pending-${randomUUID()}`).expect(201);
    storeConfirmsPayment();

    const response = await smoke
      .http()
      .post('/purchases/reconcile')
      .set(other.auth)
      .expect(201);

    expect(response.body).toEqual([]);
    expect(await available(owner.id)).toBe(0);
    expect(await available(other.id)).toBe(0);
  });

  it('sem login → 401', async () => {
    await smoke
      .http()
      .post('/purchases/google')
      .send({ productId: PRODUCT, purchaseToken: `paid-${randomUUID()}` })
      .expect(401);
  });

  it('crédito comprado paga a leitura da nota', async () => {
    const user = await registerUser(smoke, 'compra-leitura');
    smoke.ocr.processImage.mockResolvedValue(fakeOcrResult());

    await buy(user, `paid-${randomUUID()}`).expect(201);

    const upload = await smoke
      .http()
      .post('/bills')
      .set(user.auth)
      .attach('image', FAKE_RECEIPT_IMAGE, {
        filename: 'nota.jpg',
        contentType: 'image/jpeg',
      })
      .expect(201);

    await waitForBillStatus(smoke, user, upload.body.id, 'REVIEWING');
    const job = await smoke.prisma.ocrJob.findUniqueOrThrow({
      where: { billId: upload.body.id },
    });
    await waitUntil(`reserva do job ${job.id} consumida`, () =>
      smoke.prisma.creditReservation
        .findUnique({ where: { ocrJobId: job.id } })
        .then((reservation) => reservation?.status === 'CONSUMED'),
    );

    const balance = await smoke
      .http()
      .get('/credits/balance')
      .set(user.auth)
      .expect(200);
    expect(balance.body).toMatchObject({
      available: PRODUCT_CREDITS - 1,
      held: 0,
    });
  });
});
