import { randomUUID } from 'crypto';
import { CreditsService } from '../../src/credits/credits.service';
import { OcrQueueService } from '../../src/ocr/ocr-queue.service';
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

// Ledger contra Postgres real: concorrência, saldo não negativo e idempotência.
// Os testes unitários de credits.service.spec.ts usam Prisma simulado e não
// enxergam travas, transações nem índices únicos.
describe('Fumaça: ledger de créditos', () => {
  let smoke: SmokeApp;
  let credits: CreditsService;
  let queue: OcrQueueService;
  const previousEnv = {
    enforcement: process.env.CREDITS_ENFORCEMENT_ENABLED,
    quota: process.env.CREDITS_FREE_QUOTA,
  };

  beforeAll(async () => {
    // Lidos no construtor dos serviços, então precisam vir antes da aplicação.
    process.env.CREDITS_ENFORCEMENT_ENABLED = 'true';
    process.env.CREDITS_FREE_QUOTA = '3';

    smoke = await createSmokeApp();
    credits = smoke.app.get(CreditsService);
    queue = smoke.app.get(OcrQueueService);
  });

  beforeEach(() => {
    smoke.ocr.processImage.mockReset();
  });

  afterAll(async () => {
    await smoke.close();
    // As suítes rodam no mesmo processo: não vazar a configuração para as outras.
    restoreEnv('CREDITS_ENFORCEMENT_ENABLED', previousEnv.enforcement);
    restoreEnv('CREDITS_FREE_QUOTA', previousEnv.quota);
  });

  function restoreEnv(name: string, value: string | undefined) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }

  async function available(userId: string) {
    return (await credits.getBalance(userId)).available;
  }

  async function ledgerRows(userId: string) {
    return smoke.prisma.creditTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async function uploadReceipt(user: SmokeUser, expectedStatus = 201) {
    const response = await smoke
      .http()
      .post('/bills')
      .set(user.auth)
      .attach('image', FAKE_RECEIPT_IMAGE, {
        filename: 'nota.jpg',
        contentType: 'image/jpeg',
      })
      .expect(expectedStatus);

    return response.body.id as string;
  }

  async function jobFor(billId: string) {
    return smoke.prisma.ocrJob.findUniqueOrThrow({ where: { billId } });
  }

  function waitForReservation(ocrJobId: string, status: string) {
    return waitUntil(`reserva do job ${ocrJobId} com status ${status}`, () =>
      smoke.prisma.creditReservation
        .findUnique({ where: { ocrJobId } })
        .then((reservation) =>
          reservation?.status === status ? reservation : undefined,
        ),
    );
  }

  describe('serviço, chamadas simultâneas', () => {
    it('10 reservas simultâneas com saldo 3: exatamente 3 passam', async () => {
      const user = await registerUser(smoke, 'reserva-10');
      await credits.ensureFreeGrant(user.id);

      const results = await Promise.allSettled(
        Array.from({ length: 10 }, () =>
          credits.reserve(user.id, randomUUID()),
        ),
      );

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );

      expect(fulfilled).toHaveLength(3);
      expect(rejected).toHaveLength(7);
      for (const result of rejected) {
        expect((result.reason as Error).name).toBe('InsufficientCreditsError');
      }

      expect(await available(user.id)).toBe(0);
      expect(
        await smoke.prisma.creditReservation.count({
          where: { userId: user.id, status: 'HELD' },
        }),
      ).toBe(3);

      // Saldo acumulado nunca negativo, em nenhum ponto do ledger.
      let running = 0;
      for (const row of await ledgerRows(user.id)) {
        running += row.amount;
        expect(running).toBeGreaterThanOrEqual(0);
      }
    });

    it('mesma reserva (mesmo ocrJobId) disparada 5 vezes debita uma vez', async () => {
      const user = await registerUser(smoke, 'reserva-dup');
      const ocrJobId = randomUUID();

      await Promise.all(
        Array.from({ length: 5 }, () => credits.reserve(user.id, ocrJobId)),
      );

      const reserves = (await ledgerRows(user.id)).filter(
        (row) => row.type === 'RESERVE',
      );
      expect(reserves).toHaveLength(1);
      expect(await available(user.id)).toBe(2);
    });

    it('grant com a mesma referência 10 vezes concede uma vez', async () => {
      const user = await registerUser(smoke, 'grant-dup');
      const reference = `purchase:${randomUUID()}`;

      await Promise.all(
        Array.from({ length: 10 }, () =>
          credits.grant({ userId: user.id, credits: 5, reference }),
        ),
      );

      expect(
        await smoke.prisma.creditTransaction.count({
          where: { idempotencyKey: reference },
        }),
      ).toBe(1);
      expect(await available(user.id)).toBe(3 + 5);
    });

    it('cota gratuita pedida 10 vezes ao mesmo tempo é concedida uma vez', async () => {
      const user = await registerUser(smoke, 'free-dup');

      await Promise.all(
        Array.from({ length: 10 }, () => credits.getBalance(user.id)),
      );

      const grants = (await ledgerRows(user.id)).filter(
        (row) => row.type === 'FREE_GRANT',
      );
      expect(grants).toHaveLength(1);
      expect(await available(user.id)).toBe(3);
    });

    // BUG-015: settle lê a reserva sem trava. consume e release simultâneos
    // passam os dois pela checagem de HELD; a reserva fica CONSUMED e o crédito
    // volta mesmo assim (leitura de graça).
    it.failing(
      'consume e release simultâneos: só um tem efeito (BUG-015)',
      async () => {
        const user = await registerUser(smoke, 'settle-race');
        const outcomes: string[] = [];

        for (let round = 0; round < 50; round += 1) {
          const ocrJobId = randomUUID();
          await credits.reserve(user.id, ocrJobId);
          const before = await available(user.id);

          await Promise.allSettled([
            credits.consume(ocrJobId),
            credits.release(ocrJobId),
          ]);

          const reservation =
            await smoke.prisma.creditReservation.findUniqueOrThrow({
              where: { ocrJobId },
            });
          const after = await available(user.id);
          outcomes.push(`${reservation.status}:${after - before}`);

          // Libera a próxima rodada sem depender do resultado desta.
          await credits.grant({
            userId: user.id,
            credits: 1,
            reference: `topup:${ocrJobId}`,
          });
        }

        // Consumido não devolve nada; liberado devolve exatamente 1.
        for (const outcome of outcomes) {
          expect(['CONSUMED:0', 'RELEASED:1']).toContain(outcome);
        }
      },
    );

    // releaseExpired passa pelo mesmo settle do BUG-015, então em paralelo com
    // um consume herda a corrida. Lá a janela é pequena (findMany antes) e o
    // teste oscilaria; aqui fica só a garantia sequencial.
    it('releaseExpired devolve só reservas vencidas e ainda abertas', async () => {
      const user = await registerUser(smoke, 'expired');
      const expired = randomUUID();
      const consumed = randomUUID();
      const fresh = randomUUID();

      for (const ocrJobId of [expired, consumed, fresh]) {
        await credits.reserve(user.id, ocrJobId);
      }
      await credits.consume(consumed);
      await smoke.prisma.creditReservation.updateMany({
        where: { ocrJobId: { in: [expired, consumed] } },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      await credits.releaseExpired();

      const statuses = await smoke.prisma.creditReservation.findMany({
        where: { userId: user.id },
        select: { ocrJobId: true, status: true },
      });
      expect(
        Object.fromEntries(statuses.map((r) => [r.ocrJobId, r.status])),
      ).toEqual({
        [expired]: 'RELEASED',
        [consumed]: 'CONSUMED',
        [fresh]: 'HELD',
      });
      expect(await available(user.id)).toBe(1);
    });

    it('release repetido não devolve duas vezes', async () => {
      const user = await registerUser(smoke, 'release-dup');
      const ocrJobId = randomUUID();
      await credits.reserve(user.id, ocrJobId);

      await Promise.allSettled([
        credits.release(ocrJobId),
        credits.release(ocrJobId),
        credits.release(ocrJobId),
      ]);

      const releases = (await ledgerRows(user.id)).filter(
        (row) => row.type === 'RELEASE',
      );
      expect(releases).toHaveLength(1);
      expect(await available(user.id)).toBe(3);
    });
  });

  describe('fluxo pela API, com cobrança ligada', () => {
    it('upload → OCR com sucesso → crédito consumido', async () => {
      const user = await registerUser(smoke, 'api-ok');
      smoke.ocr.processImage.mockResolvedValue(fakeOcrResult());

      const billId = await uploadReceipt(user);
      await waitForBillStatus(smoke, user, billId, 'REVIEWING');
      const job = await jobFor(billId);
      await waitForReservation(job.id, 'CONSUMED');

      const balance = await smoke
        .http()
        .get('/credits/balance')
        .set(user.auth)
        .expect(200);
      expect(balance.body).toMatchObject({ available: 2, held: 0 });
    });

    it('OCR que falha em todas as tentativas → crédito devolvido', async () => {
      const user = await registerUser(smoke, 'api-fail');
      smoke.ocr.processImage.mockRejectedValue(new Error('falha simulada'));

      const billId = await uploadReceipt(user);
      await waitForBillStatus(smoke, user, billId, 'OCR_FAILED');
      const job = await jobFor(billId);
      await waitForReservation(job.id, 'RELEASED');

      expect(await available(user.id)).toBe(3);
    });

    // Comportamento atual, documentado no BUG-016: o retry reusa o mesmo
    // OcrJob (upsert por billId), encontra a reserva RELEASED e não reserva de
    // novo. A segunda leitura sai de graça. Se o produto decidir que deve
    // cobrar, este teste passa a falhar e precisa ser invertido.
    it('retry-ocr depois da devolução não cobra de novo (comportamento atual)', async () => {
      const user = await registerUser(smoke, 'api-retry');
      smoke.ocr.processImage.mockRejectedValue(new Error('falha simulada'));

      const billId = await uploadReceipt(user);
      await waitForBillStatus(smoke, user, billId, 'OCR_FAILED');
      const job = await jobFor(billId);
      await waitForReservation(job.id, 'RELEASED');

      smoke.ocr.processImage.mockReset();
      smoke.ocr.processImage.mockResolvedValue(fakeOcrResult());

      await smoke
        .http()
        .post(`/bills/${billId}/retry-ocr`)
        .set(user.auth)
        .expect(201);
      await waitForBillStatus(smoke, user, billId, 'REVIEWING');

      expect((await jobFor(billId)).id).toBe(job.id);
      expect(
        (
          await smoke.prisma.creditReservation.findUniqueOrThrow({
            where: { ocrJobId: job.id },
          })
        ).status,
      ).toBe('RELEASED');
      expect(await available(user.id)).toBe(3);
    });

    // BUG-016: enqueue grava o OcrJob antes de reservar. Sem saldo, a reserva
    // lança um Error comum (500), mas a conta e o job PENDING já existem e a
    // fila processa a leitura sem cobrar.
    it.failing(
      'sem saldo: recusa com 4xx e não processa a leitura (BUG-016)',
      async () => {
        const user = await registerUser(smoke, 'api-zero');
        await credits.ensureFreeGrant(user.id);
        await credits.adminAdjust({
          userId: user.id,
          amount: -3,
          reason: 'zerar saldo do teste',
          actorId: 'smoke',
          idempotencyKey: randomUUID(),
        });
        smoke.ocr.processImage.mockResolvedValue(fakeOcrResult());

        const response = await smoke
          .http()
          .post('/bills')
          .set(user.auth)
          .attach('image', FAKE_RECEIPT_IMAGE, {
            filename: 'nota.jpg',
            contentType: 'image/jpeg',
          });

        await queue.processPendingJobs();

        expect(response.status).toBeGreaterThanOrEqual(400);
        expect(response.status).toBeLessThan(500);
        expect(smoke.ocr.processImage).not.toHaveBeenCalled();
        expect(await available(user.id)).toBe(0);
      },
    );

    it('tentativa a mais da fila (BUG-013) nunca cobra mais de um crédito', async () => {
      const user = await registerUser(smoke, 'api-extra');
      smoke.ocr.processImage.mockRejectedValue(new Error('falha simulada'));

      // Várias contas em paralelo, com polling, para provocar a corrida.
      const billIds = await Promise.all(
        Array.from({ length: 3 }, () => uploadReceipt(user)),
      );
      await Promise.all(
        billIds.map((billId) =>
          waitForBillStatus(smoke, user, billId, 'OCR_FAILED'),
        ),
      );

      for (const billId of billIds) {
        const job = await jobFor(billId);
        await waitForReservation(job.id, 'RELEASED');

        const rows = await smoke.prisma.creditTransaction.findMany({
          where: { ocrJobId: job.id },
        });
        expect(rows.filter((row) => row.type === 'RESERVE')).toHaveLength(1);
        expect(rows.filter((row) => row.type === 'RELEASE')).toHaveLength(1);
      }

      expect(await available(user.id)).toBe(3);
    });
  });
});
