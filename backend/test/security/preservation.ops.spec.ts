/**
 * Property 2: Preservation - pipeline HTTP, operação e administração (3.10, 3.12–3.16, 3.21).
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { createTestApp, nextIp, TestApp } from '../helpers/test-app';
import { goldenSuite, keysOf, normalize } from '../helpers/golden';
import { TEST_SECRETS } from '../helpers/setup-env';
import {
  authenticatedUser,
  seedBill,
  uniqueEmail,
  VALID_PASSWORD,
} from '../helpers/factories';

const golden = goldenSuite('preservation.ops');
const snap = (res: { status: number; body: unknown }) => ({
  status: res.status,
  body: normalize(res.body),
});

describe('Preservation: pipeline, operação e administração', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    golden.flush();
    await t.close();
  });

  describe('health (3.15)', () => {
    it('banco disponível: HTTP 200 com status, timestamp e database.status', async () => {
      const res = await t.http('get', '/health');
      golden.observe('health.dbUp', {
        status: res.status,
        bodyStatus: res.body.status,
        timestampIsIso: !Number.isNaN(Date.parse(res.body.timestamp)),
        databaseStatus: res.body.database?.status,
      });
    });
  });

  describe('helmet e CORS (3.12, 3.14, 3.21)', () => {
    it('cabeçalhos do helmet continuam presentes', async () => {
      const res = await t.http('get', '/');
      golden.observe('helmet.headers', {
        'x-content-type-options': res.headers['x-content-type-options'] ?? null,
        'x-frame-options': res.headers['x-frame-options'] ?? null,
        'strict-transport-security': Boolean(
          res.headers['strict-transport-security'],
        ),
        'content-security-policy': Boolean(
          res.headers['content-security-policy'],
        ),
        'cross-origin-resource-policy':
          res.headers['cross-origin-resource-policy'] ?? null,
        'x-powered-by': res.headers['x-powered-by'] ?? null,
      });
    });

    it('requisição sem Origin (app nativo) é atendida', async () => {
      const res = await t.http('get', '/');
      golden.observe('cors.noOrigin', {
        status: res.status,
        allowOrigin: res.headers['access-control-allow-origin'] ?? null,
      });
    });

    it('sem CORS_ALLOWED_ORIGINS, o navegador continua sendo atendido como hoje', async () => {
      const preflight = await t
        .http('options', '/auth/login')
        .set('Origin', 'https://web.exemplo.com')
        .set('Access-Control-Request-Method', 'POST');
      const simple = await t
        .http('get', '/')
        .set('Origin', 'https://web.exemplo.com');
      golden.observe('cors.webOriginDefault', {
        preflightStatus: preflight.status,
        preflightAllowOrigin:
          preflight.headers['access-control-allow-origin'] ?? null,
        simpleAllowOrigin:
          simple.headers['access-control-allow-origin'] ?? null,
      });
    });
  });

  describe('rate limit por rota (3.12)', () => {
    // A (limite+1)-ª chamada do mesmo IP recebe 429; as anteriores não
    const statusesFor = async (
      count: number,
      send: (ip: string) => Promise<{ status: number }>,
    ) => {
      const ip = nextIp();
      const statuses: number[] = [];
      for (let i = 0; i < count; i++) statuses.push((await send(ip)).status);
      return statuses;
    };

    it('login 3/min, Google 3/min, registro 5/min, refresh 10/min, forgot 3/min, reset 5/min', async () => {
      t.google.verifyIdToken.mockRejectedValue(new Error('x'));
      const results = {
        login: await statusesFor(4, (ip) =>
          t
            .http('post', '/auth/login', ip)
            .send({ email: 'a@a.com', password: 'errada123' }),
        ),
        google: await statusesFor(4, (ip) =>
          t.http('post', '/auth/google', ip).send({ idToken: 'x' }),
        ),
        register: await statusesFor(6, (ip) =>
          t.http('post', '/auth/register', ip).send({ email: 'invalido' }),
        ),
        refresh: await statusesFor(11, (ip) =>
          t.http('post', '/auth/refresh', ip).send({ refreshToken: 'x' }),
        ),
        forgot: await statusesFor(4, (ip) =>
          t
            .http('post', '/auth/forgot-password', ip)
            .send({ email: uniqueEmail() }),
        ),
        reset: await statusesFor(6, (ip) =>
          t.http('post', '/auth/reset-password', ip).send({
            email: uniqueEmail(),
            token: '123456',
            newPassword: VALID_PASSWORD,
          }),
        ),
      };
      golden.observe('throttle.auth', results);
    });

    it('upload 2/min (POST /bills e POST /bills/:id/image) e retry de OCR 1 a cada 5 min', async () => {
      const { user, auth } = await authenticatedUser(t);
      const seeded = seedBill(t.prisma, user.id, { status: 'OCR_FAILED' });
      const results = {
        createBill: await statusesFor(3, (ip) =>
          t.http('post', '/bills', ip).set(auth).send({ billName: 'Rate' }),
        ),
        uploadImage: await statusesFor(3, (ip) =>
          t.http('post', `/bills/${seeded.billId}/image`, ip).set(auth),
        ),
        retryOcr: await statusesFor(2, (ip) =>
          t.http('post', `/bills/${seeded.billId}/retry-ocr`, ip).set(auth),
        ),
      };
      golden.observe('throttle.bills', results);
    });
  });

  describe('cron interno de OCR (3.13)', () => {
    it('com o segredo correto processa; sem segredo rejeita', async () => {
      const header = await t
        .http('get', '/internal/ocr/queue')
        .set('x-internal-cron-secret', TEST_SECRETS.cron);
      const bearer = await t
        .http('get', '/internal/ocr/process-pending')
        .set('Authorization', `Bearer ${TEST_SECRETS.cron}`);
      const post = await t
        .http('post', '/internal/ocr/process-pending')
        .set('x-internal-cron-secret', TEST_SECRETS.cron);
      golden.observe('cron.withSecret', {
        queue: header.status,
        processGet: bearer.status,
        processPost: post.status,
        queueCounters: ['pending', 'running', 'failed', 'completed'].every(
          (k) => typeof header.body?.[k] === 'number',
        ),
      });
      golden.observe(
        'cron.noSecret',
        snap(await t.http('get', '/internal/ocr/queue')),
      );
      golden.observe(
        'cron.wrongSecret',
        snap(
          await t
            .http('post', '/internal/ocr/process-pending')
            .set('x-internal-cron-secret', 'errado'),
        ),
      );
    });
  });

  describe('rotas ADMIN (3.10)', () => {
    it('exigem JWT + role ADMIN e mantêm as proteções', async () => {
      const admin = await authenticatedUser(t, { role: 'ADMIN' });
      const regular = await authenticatedUser(t);

      golden.observe(
        'admin.listAsUser',
        snap(await t.http('get', '/users').set(regular.auth)),
      );
      golden.observe('admin.listNoToken', snap(await t.http('get', '/users')));
      const list = await t.http('get', '/users').set(admin.auth);
      golden.observe('admin.listAsAdmin', {
        status: list.status,
        keys: keysOf(list.body),
      });

      const created = await t
        .http('post', '/users')
        .set(admin.auth)
        .send({
          email: uniqueEmail('admcriado'),
          name: 'Criado',
          password: VALID_PASSWORD,
          role: 'USER',
        });
      golden.observe('admin.createUser', snap(created));

      golden.observe(
        'admin.getUser',
        snap(await t.http('get', `/users/${regular.user.id}`).set(admin.auth)),
      );
      golden.observe(
        'admin.deactivateSelf',
        snap(
          await t
            .http('patch', `/users/${admin.user.id}`)
            .set(admin.auth)
            .send({ isActive: false }),
        ),
      );
      golden.observe(
        'admin.changeOwnRole',
        snap(
          await t
            .http('patch', `/users/${admin.user.id}`)
            .set(admin.auth)
            .send({ role: 'USER' }),
        ),
      );
      golden.observe(
        'admin.deactivateOther',
        snap(
          await t
            .http('patch', `/users/${regular.user.id}`)
            .set(admin.auth)
            .send({ isActive: false }),
        ),
      );
    });

    it('último ADMIN ativo não pode excluir a própria conta', async () => {
      // Desativa todos os outros ADMIN para isolar o cenário
      for (const u of t.prisma.tables.user)
        if (u.role === 'ADMIN') u.isActive = false;
      const lastAdmin = await authenticatedUser(t, { role: 'ADMIN' });
      golden.observe(
        'admin.deleteLastAdmin',
        snap(await t.http('delete', '/users/me').set(lastAdmin.auth)),
      );
    });

    it('usuário desativado perde acesso às rotas autenticadas', async () => {
      const { user, auth } = await authenticatedUser(t);
      const row = t.prisma.tables.user.find((u) => u.id === user.id);
      if (row) row.isActive = false;
      golden.observe(
        'admin.deactivatedAccess',
        snap(await t.http('get', '/auth/me').set(auth)),
      );
    });
  });

  describe('imagem Docker e versionamento (3.16)', () => {
    it('Dockerfile de produção roda como usuário não-root', () => {
      const dockerfile = readFileSync(
        join(__dirname, '..', '..', 'Dockerfile'),
        'utf8',
      );
      const users = [...dockerfile.matchAll(/^USER\s+(\S+)/gm)].map(
        (m) => m[1],
      );
      expect(users.length).toBeGreaterThan(0);
      expect(users[users.length - 1]).not.toBe('root');
    });

    it('.env continua fora do controle de versão', () => {
      const backendIgnore = join(__dirname, '..', '..', '.gitignore');
      expect(existsSync(backendIgnore)).toBe(true);
      expect(readFileSync(backendIgnore, 'utf8')).toMatch(/^\.env\s*$/m);
    });
  });
});
