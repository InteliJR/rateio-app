import { randomUUID } from 'crypto';
import { CreditsService } from '../../src/credits/credits.service';
import {
  SmokeApp,
  SmokeUser,
  createSmokeApp,
  registerUser,
} from '../support/smoke-app';

// Histórico de créditos do usuário e ajuste administrativo, contra Postgres real.
describe('Fumaça: histórico e ajuste administrativo de créditos', () => {
  let smoke: SmokeApp;
  let credits: CreditsService;
  let admin: SmokeUser;
  const previousQuota = process.env.CREDITS_FREE_QUOTA;

  beforeAll(async () => {
    // Lido no construtor do serviço, então precisa vir antes da aplicação.
    process.env.CREDITS_FREE_QUOTA = '3';

    smoke = await createSmokeApp();
    credits = smoke.app.get(CreditsService);

    // O papel é lido do banco a cada requisição, então o token continua valendo.
    admin = await registerUser(smoke, 'admin');
    await smoke.prisma.user.update({
      where: { id: admin.id },
      data: { role: 'ADMIN' },
    });
  });

  afterAll(async () => {
    await smoke.close();
    // As suítes rodam no mesmo processo: não vazar a configuração para as outras.
    if (previousQuota === undefined) {
      delete process.env.CREDITS_FREE_QUOTA;
    } else {
      process.env.CREDITS_FREE_QUOTA = previousQuota;
    }
  });

  function adjust(
    as: SmokeUser,
    body: Partial<{
      userId: string;
      amount: number;
      reason: string;
      idempotencyKey: string;
    }>,
  ) {
    return smoke
      .http()
      .post('/admin/credits/adjust')
      .set(as.auth)
      .send({
        reason: 'Ajuste de teste',
        idempotencyKey: randomUUID(),
        ...body,
      });
  }

  async function available(userId: string) {
    return (await credits.getBalance(userId)).available;
  }

  function adjustRows(userId: string) {
    return smoke.prisma.creditTransaction.findMany({
      where: { userId, type: 'ADMIN_ADJUST' },
    });
  }

  describe('POST /admin/credits/adjust', () => {
    it('sem login → 401', async () => {
      await smoke
        .http()
        .post('/admin/credits/adjust')
        .send({ userId: randomUUID(), amount: 1, reason: 'x' })
        .expect(401);
    });

    it('usuário comum → 403 e nada muda', async () => {
      const user = await registerUser(smoke, 'ajuste-comum');
      await credits.ensureFreeGrant(user.id);

      await adjust(user, { userId: user.id, amount: 100 }).expect(403);

      expect(await available(user.id)).toBe(3);
      expect(await adjustRows(user.id)).toHaveLength(0);
    });

    it('admin concede créditos e o ajuste guarda autor e motivo', async () => {
      const user = await registerUser(smoke, 'ajuste-ok');
      await credits.ensureFreeGrant(user.id);

      const response = await adjust(admin, {
        userId: user.id,
        amount: 5,
        reason: 'Leitura cobrada por engano',
      }).expect(200);

      expect(response.body).toEqual({ applied: true, available: 8 });
      const [row] = await adjustRows(user.id);
      expect(row).toMatchObject({
        amount: 5,
        reason: 'Leitura cobrada por engano',
        actorId: admin.id,
      });
    });

    it('o autor vem do token, não do corpo', async () => {
      const user = await registerUser(smoke, 'ajuste-autor');

      await smoke
        .http()
        .post('/admin/credits/adjust')
        .set(admin.auth)
        .send({
          userId: user.id,
          amount: 1,
          reason: 'x',
          idempotencyKey: randomUUID(),
          actorId: user.id,
        })
        .expect(400);
    });

    it('mesma chave enviada 5 vezes em paralelo ajusta uma vez', async () => {
      const user = await registerUser(smoke, 'ajuste-5x');
      await credits.ensureFreeGrant(user.id);
      const idempotencyKey = randomUUID();

      const responses = await Promise.all(
        Array.from({ length: 5 }, () =>
          adjust(admin, { userId: user.id, amount: 2, idempotencyKey }),
        ),
      );

      for (const response of responses) {
        expect(response.status).toBe(200);
      }
      expect(responses.filter((r) => r.body.applied)).toHaveLength(1);
      expect(await available(user.id)).toBe(5);
      expect(await adjustRows(user.id)).toHaveLength(1);
    });

    it('mesma chave com outro valor → 409', async () => {
      const user = await registerUser(smoke, 'ajuste-conflito');
      const idempotencyKey = randomUUID();

      await adjust(admin, {
        userId: user.id,
        amount: 2,
        idempotencyKey,
      }).expect(200);
      await adjust(admin, {
        userId: user.id,
        amount: 3,
        idempotencyKey,
      }).expect(409);

      expect(await adjustRows(user.id)).toHaveLength(1);
    });

    it('retirada maior que o saldo → 422 e nada muda', async () => {
      const user = await registerUser(smoke, 'ajuste-negativo');
      await credits.ensureFreeGrant(user.id);

      await adjust(admin, { userId: user.id, amount: -4 }).expect(422);

      expect(await available(user.id)).toBe(3);
      expect(await adjustRows(user.id)).toHaveLength(0);
    });

    it('retirada que zera o saldo é aceita', async () => {
      const user = await registerUser(smoke, 'ajuste-zera');
      await credits.ensureFreeGrant(user.id);

      const response = await adjust(admin, {
        userId: user.id,
        amount: -3,
      }).expect(200);

      expect(response.body).toEqual({ applied: true, available: 0 });
    });

    it('sem motivo, valor zero ou fracionado → 400', async () => {
      const user = await registerUser(smoke, 'ajuste-invalido');

      await adjust(admin, { userId: user.id, amount: 1, reason: '' }).expect(
        400,
      );
      await adjust(admin, { userId: user.id, amount: 0 }).expect(400);
      await adjust(admin, { userId: user.id, amount: 1.5 }).expect(400);

      expect(await adjustRows(user.id)).toHaveLength(0);
    });

    it('usuário inexistente → 404', async () => {
      await adjust(admin, { userId: randomUUID(), amount: 1 }).expect(404);
    });
  });

  describe('GET /credits/transactions', () => {
    function history(user: SmokeUser, query = '') {
      return smoke
        .http()
        .get(`/credits/transactions${query}`)
        .set(user.auth)
        .expect(200);
    }

    it('sem login → 401', async () => {
      await smoke.http().get('/credits/transactions').expect(401);
    });

    it('leitura devolvida some do histórico; leitura cobrada aparece', async () => {
      const user = await registerUser(smoke, 'historico');
      await credits.ensureFreeGrant(user.id);

      const failedJob = randomUUID();
      await credits.reserve(user.id, failedJob);
      await credits.release(failedJob);

      const chargedJob = randomUUID();
      await credits.reserve(user.id, chargedJob);
      await credits.consume(chargedJob);

      const response = await history(user);

      expect(
        response.body.data.map((row: { type: string }) => row.type),
      ).toEqual(['RESERVE', 'FREE_GRANT']);
      expect(response.body.data[0]).toEqual({
        id: expect.any(String),
        type: 'RESERVE',
        amount: -1,
        reason: expect.any(String),
        createdAt: expect.any(String),
      });
      expect(response.body.meta).toEqual({
        total: 2,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
    });

    it('usuário só vê o próprio histórico', async () => {
      const owner = await registerUser(smoke, 'historico-dono');
      const other = await registerUser(smoke, 'historico-outro');
      await adjust(admin, { userId: owner.id, amount: 7 }).expect(200);

      const response = await history(other);

      expect(
        response.body.data.some((row: { amount: number }) => row.amount === 7),
      ).toBe(false);
    });

    it('pagina e limita o tamanho da página a 50', async () => {
      const user = await registerUser(smoke, 'historico-pagina');
      await credits.ensureFreeGrant(user.id);
      for (let i = 0; i < 3; i++) {
        await adjust(admin, { userId: user.id, amount: 1 }).expect(200);
      }

      const second = await history(user, '?page=2&limit=2');
      expect(second.body.data).toHaveLength(2);
      expect(second.body.meta).toEqual({
        total: 4,
        page: 2,
        limit: 2,
        totalPages: 2,
      });

      const capped = await history(user, '?limit=1000');
      expect(capped.body.meta.limit).toBe(50);
    });
  });
});
