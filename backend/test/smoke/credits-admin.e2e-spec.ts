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
    userId: string,
    body: Partial<{
      amount: number;
      reason: string;
      reference: string;
    }>,
  ) {
    return smoke
      .http()
      .patch(`/credits/${userId}/adjust`)
      .set(as.auth)
      .send({ reason: 'Ajuste de teste', ...body });
  }

  async function available(userId: string) {
    return (await credits.getBalance(userId)).available;
  }

  function adjustRows(userId: string) {
    return smoke.prisma.creditTransaction.findMany({
      where: { userId, type: 'ADMIN_ADJUST' },
    });
  }

  describe('PATCH /credits/:userId/adjust', () => {
    it('sem login → 401', async () => {
      await smoke
        .http()
        .patch(`/credits/${randomUUID()}/adjust`)
        .send({ amount: 1, reason: 'Ajuste de teste' })
        .expect(401);
    });

    it('usuário comum → 403 e nada muda', async () => {
      const user = await registerUser(smoke, 'ajuste-comum');
      await credits.ensureFreeGrant(user.id);

      await adjust(user, user.id, { amount: 100 }).expect(403);

      expect(await available(user.id)).toBe(3);
      expect(await adjustRows(user.id)).toHaveLength(0);
    });

    it('admin concede créditos e o ajuste guarda autor e motivo', async () => {
      const user = await registerUser(smoke, 'ajuste-ok');
      await credits.ensureFreeGrant(user.id);

      const response = await adjust(admin, user.id, {
        amount: 5,
        reason: 'Leitura cobrada por engano',
      }).expect(200);

      expect(response.body.applied).toBe(true);
      expect(response.body.balance.available).toBe(8);
      const [row] = await adjustRows(user.id);
      expect(row).toMatchObject({
        amount: 5,
        reason: 'Leitura cobrada por engano',
        actorId: admin.id,
      });
    });

    it('o autor vem do token, não do corpo', async () => {
      const user = await registerUser(smoke, 'ajuste-autor');

      await adjust(admin, user.id, {
        amount: 1,
        actorId: user.id,
      } as never).expect(400);

      expect(await adjustRows(user.id)).toHaveLength(0);
    });

    it('mesma referência enviada 5 vezes em paralelo ajusta uma vez', async () => {
      const user = await registerUser(smoke, 'ajuste-5x');
      await credits.ensureFreeGrant(user.id);
      const reference = randomUUID();

      const responses = await Promise.all(
        Array.from({ length: 5 }, () =>
          adjust(admin, user.id, { amount: 2, reference }),
        ),
      );

      for (const response of responses) {
        expect(response.status).toBe(200);
      }
      expect(responses.filter((r) => r.body.applied)).toHaveLength(1);
      expect(await available(user.id)).toBe(5);
      expect(await adjustRows(user.id)).toHaveLength(1);
    });

    it('mesma referência com outro valor → 409', async () => {
      const user = await registerUser(smoke, 'ajuste-conflito');
      const reference = randomUUID();

      await adjust(admin, user.id, { amount: 2, reference }).expect(200);
      await adjust(admin, user.id, { amount: 3, reference }).expect(409);

      expect(await adjustRows(user.id)).toHaveLength(1);
    });

    it('mesma referência para outro usuário → 409', async () => {
      const first = await registerUser(smoke, 'ajuste-ref-1');
      const second = await registerUser(smoke, 'ajuste-ref-2');
      const reference = randomUUID();

      await adjust(admin, first.id, { amount: 2, reference }).expect(200);
      await adjust(admin, second.id, { amount: 2, reference }).expect(409);

      expect(await adjustRows(second.id)).toHaveLength(0);
    });

    it('retirada maior que o saldo → 422 e nada muda', async () => {
      const user = await registerUser(smoke, 'ajuste-negativo');
      await credits.ensureFreeGrant(user.id);

      await adjust(admin, user.id, { amount: -4 }).expect(422);

      expect(await available(user.id)).toBe(3);
      expect(await adjustRows(user.id)).toHaveLength(0);
    });

    it('retirada que zera o saldo é aceita', async () => {
      const user = await registerUser(smoke, 'ajuste-zera');
      await credits.ensureFreeGrant(user.id);

      const response = await adjust(admin, user.id, { amount: -3 }).expect(200);

      expect(response.body.balance.available).toBe(0);
    });

    it('sem motivo, valor zero ou fracionado → 400', async () => {
      const user = await registerUser(smoke, 'ajuste-invalido');

      await adjust(admin, user.id, { amount: 1, reason: '' }).expect(400);
      await adjust(admin, user.id, { amount: 0 }).expect(400);
      await adjust(admin, user.id, { amount: 1.5 }).expect(400);

      expect(await adjustRows(user.id)).toHaveLength(0);
    });

    it('usuário inexistente → 404', async () => {
      await adjust(admin, randomUUID(), { amount: 1 }).expect(404);
    });
  });

  describe('GET /credits/history', () => {
    function history(user: SmokeUser, query = '') {
      return smoke
        .http()
        .get(`/credits/history${query}`)
        .set(user.auth)
        .expect(200);
    }

    it('sem login → 401', async () => {
      await smoke.http().get('/credits/history').expect(401);
    });

    it('somar o histórico dá o saldo disponível', async () => {
      const user = await registerUser(smoke, 'historico');
      await credits.ensureFreeGrant(user.id);

      const failedJob = randomUUID();
      await credits.reserve(user.id, failedJob);
      await credits.release(failedJob);

      const chargedJob = randomUUID();
      await credits.reserve(user.id, chargedJob);
      await credits.consume(chargedJob);

      const response = await history(user);

      const sum = response.body.entries.reduce(
        (total: number, row: { amount: number }) => total + row.amount,
        0,
      );
      expect(sum).toBe(await available(user.id));
      expect(response.body.entries[0]).toEqual({
        id: expect.any(String),
        type: expect.any(String),
        amount: expect.any(Number),
        reason: expect.any(String),
        ocrJobId: expect.any(String),
        createdAt: expect.any(String),
      });
      expect(response.body.nextCursor).toBeNull();
    });

    it('usuário só vê o próprio histórico', async () => {
      const owner = await registerUser(smoke, 'historico-dono');
      const other = await registerUser(smoke, 'historico-outro');
      await adjust(admin, owner.id, { amount: 7 }).expect(200);

      const response = await history(other);

      expect(
        response.body.entries.some(
          (row: { amount: number }) => row.amount === 7,
        ),
      ).toBe(false);
    });

    it('pagina por cursor sem repetir nem pular linhas', async () => {
      const user = await registerUser(smoke, 'historico-pagina');
      await credits.ensureFreeGrant(user.id);
      for (let i = 0; i < 3; i++) {
        await adjust(admin, user.id, { amount: 1 }).expect(200);
      }

      const first = await history(user, '?limit=2');
      expect(first.body.entries).toHaveLength(2);
      expect(first.body.nextCursor).toEqual(expect.any(String));

      const second = await history(
        user,
        `?limit=2&cursor=${first.body.nextCursor}`,
      );
      expect(second.body.entries).toHaveLength(2);
      expect(second.body.nextCursor).toBeNull();

      const ids = [...first.body.entries, ...second.body.entries].map(
        (row: { id: string }) => row.id,
      );
      expect(new Set(ids).size).toBe(4);
    });
  });
});
