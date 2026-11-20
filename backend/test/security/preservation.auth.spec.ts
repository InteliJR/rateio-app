/**
 * Property 2: Preservation - fluxos de autenticação inalterados (3.1–3.5, 3.11, 3.17, 3.18).
 *
 * Observação gravada na produção (origin/main) e comparada com o código atual.
 * Entradas fora da bug condition: credenciais válidas, contas ativas, códigos corretos.
 */
import { UnauthorizedException } from '@nestjs/common';
import * as fc from 'fast-check';
import { createTestApp, TestApp } from '../helpers/test-app';
import { goldenSuite, keysOf, normalize } from '../helpers/golden';
import {
  VALID_PASSWORD,
  authenticatedUser,
  decodeJwt,
  loginViaApi,
  registerViaApi,
  seedUser,
  uniqueEmail,
} from '../helpers/factories';

const golden = goldenSuite('preservation.auth');
const snap = (res: { status: number; body: unknown }) => ({
  status: res.status,
  body: normalize(res.body),
});

describe('Preservation: autenticação', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    golden.flush();
    await t.close();
  });

  describe('registro (3.2)', () => {
    it('cria conta ativa como USER, com login automático', async () => {
      const { res, email } = await registerViaApi(t);
      golden.observe('register.valid', snap(res));
      const stored = t.prisma.tables.user.find((u) => u.email === email);
      golden.observe('register.valid.stored', {
        role: stored?.role,
        isActive: stored?.isActive,
      });
    });

    it('bloqueia criação de ADMIN pelo registro público', async () => {
      const res = await t.http('post', '/auth/register').send({
        email: uniqueEmail(),
        name: 'X',
        password: VALID_PASSWORD,
        role: 'ADMIN',
      });
      golden.observe('register.admin', snap(res));
    });

    it('e-mail já cadastrado (mesma grafia) responde 409', async () => {
      const email = uniqueEmail();
      await registerViaApi(t, email);
      const { res } = await registerViaApi(t, email);
      golden.observe('register.duplicate', snap(res));
    });

    it('payload inválido ou com campo extra é rejeitado pelo ValidationPipe (3.12)', async () => {
      const missing = await t
        .http('post', '/auth/register')
        .send({ email: uniqueEmail() });
      const extra = await t.http('post', '/auth/register').send({
        email: uniqueEmail(),
        name: 'X',
        password: VALID_PASSWORD,
        hacker: true,
      });
      golden.observe('register.missingFields', snap(missing));
      golden.observe('register.extraField', snap(extra));
    });
  });

  describe('login (3.1)', () => {
    it('credenciais válidas: mesmo contrato e tokens com as mesmas validades', async () => {
      const user = await seedUser(t.prisma);
      const res = await loginViaApi(t, user.email);
      golden.observe('login.valid', snap(res));
      const access = decodeJwt(res.body.accessToken);
      const refresh = decodeJwt(res.body.refreshToken);
      golden.observe('login.valid.accessLifetime', access.exp - access.iat);
      golden.observe('login.valid.refreshLifetime', refresh.exp - refresh.iat);
      golden.observe('login.valid.accessSubIsUser', access.sub === user.id);
    });

    it('senha errada ou e-mail inexistente: sempre 401 "Credenciais inválidas"', async () => {
      const user = await seedUser(t.prisma);
      const observed = new Set<string>();
      await fc.assert(
        fc.asyncProperty(
          fc
            .string({ minLength: 1, maxLength: 30 })
            .filter((p) => p !== VALID_PASSWORD),
          fc.boolean(),
          async (password, unknownEmail) => {
            const email = unknownEmail ? uniqueEmail('naoexiste') : user.email;
            const res = await loginViaApi(t, email, password);
            observed.add(JSON.stringify(snap(res)));
          },
        ),
        { numRuns: 12, seed: 7 },
      );
      golden.observe('login.invalid.distinctResponses', [...observed].sort());
    });

    it('conta inativa com a senha correta mantém a mensagem atual', async () => {
      const user = await seedUser(t.prisma, { isActive: false });
      golden.observe(
        'login.inactive.correctPassword',
        snap(await loginViaApi(t, user.email)),
      );
    });
  });

  describe('Google (3.3)', () => {
    it('primeiro acesso cria a conta; acessos seguintes logam', async () => {
      const googleId = `g-${Date.now()}`;
      const email = uniqueEmail('google');
      t.google.verifyIdToken.mockResolvedValue({
        googleId,
        email,
        name: 'Google User',
      });
      const first = await t
        .http('post', '/auth/google')
        .send({ idToken: 'token-ok' });
      const second = await t
        .http('post', '/auth/google')
        .send({ idToken: 'token-ok' });
      golden.observe('google.firstAccess', snap(first));
      golden.observe('google.secondAccess', snap(second));
    });

    it('e-mail que já tem conta com senha responde 409', async () => {
      const user = await seedUser(t.prisma);
      t.google.verifyIdToken.mockResolvedValue({
        googleId: `g2-${Date.now()}`,
        email: user.email,
        name: 'X',
      });
      golden.observe(
        'google.emailWithPassword',
        snap(
          await t.http('post', '/auth/google').send({ idToken: 'token-ok' }),
        ),
      );
    });

    it('token rejeitado pela verificação responde 401', async () => {
      t.google.verifyIdToken.mockRejectedValue(
        new UnauthorizedException('Token Google invalido'),
      );
      golden.observe(
        'google.invalidToken',
        snap(await t.http('post', '/auth/google').send({ idToken: 'ruim' })),
      );
    });

    it('conta Google inativa responde 401', async () => {
      const googleId = `g3-${Date.now()}`;
      await seedUser(t.prisma, { googleId, password: null, isActive: false });
      t.google.verifyIdToken.mockResolvedValue({
        googleId,
        email: uniqueEmail(),
        name: 'X',
      });
      golden.observe(
        'google.inactive',
        snap(
          await t.http('post', '/auth/google').send({ idToken: 'token-ok' }),
        ),
      );
    });
  });

  describe('refresh e logout (3.5, 3.17)', () => {
    it('cadeia de refreshes legítimos sempre tem sucesso com o mesmo contrato', async () => {
      const lengths = fc.sample(fc.integer({ min: 1, max: 4 }), {
        seed: 11,
        numRuns: 3,
      });
      const results: unknown[] = [];
      for (const n of lengths) {
        const { refreshToken } = await authenticatedUser(t);
        let current = refreshToken;
        for (let i = 0; i < n; i++) {
          const res = await t
            .http('post', '/auth/refresh')
            .send({ refreshToken: current });
          results.push({ step: i, status: res.status, body: keysOf(res.body) });
          current = res.body.refreshToken;
        }
      }
      golden.observe('refresh.chain', results);
    });

    it('refresh anterior continua aceito depois de um refresh (sem rotação forçada, 3.17)', async () => {
      const { refreshToken } = await authenticatedUser(t);
      await t.http('post', '/auth/refresh').send({ refreshToken });
      const again = await t
        .http('post', '/auth/refresh')
        .send({ refreshToken });
      golden.observe('refresh.reuseWithoutRotation', {
        status: again.status,
        body: keysOf(again.body),
      });
    });

    it('refresh inválido responde 401', async () => {
      const res = await t
        .http('post', '/auth/refresh')
        .send({ refreshToken: 'nao-e-um-jwt' });
      golden.observe('refresh.invalid', snap(res));
    });

    it('logout com o body atual funciona e invalida aquele refresh', async () => {
      const { refreshToken, auth } = await authenticatedUser(t);
      const logout = await t
        .http('post', '/auth/logout')
        .set(auth)
        .send({ refreshToken });
      const after = await t
        .http('post', '/auth/refresh')
        .send({ refreshToken });
      golden.observe('logout.valid', snap(logout));
      golden.observe('logout.thenRefresh', snap(after));
    });

    it('GET /auth/me: 401 sem token e mesmo contrato com token', async () => {
      const { auth } = await authenticatedUser(t);
      golden.observe('me.noToken', snap(await t.http('get', '/auth/me')));
      golden.observe(
        'me.withToken',
        snap(await t.http('get', '/auth/me').set(auth)),
      );
    });
  });

  describe('recuperação de senha (3.4)', () => {
    it('forgot + reset com código válido + login com a senha nova', async () => {
      const user = await seedUser(t.prisma);
      const forgot = await t
        .http('post', '/auth/forgot-password')
        .send({ email: user.email });
      const mail = t.mails.find((m) => m.email === user.email);
      golden.observe('forgot.existing', snap(forgot));
      golden.observe('forgot.mailCodeFormat', /^\d{6}$/.test(mail?.code ?? ''));

      const newPassword = 'NovaSenha#2025';
      const reset = await t
        .http('post', '/auth/reset-password')
        .send({ email: user.email, token: mail?.code, newPassword });
      golden.observe('reset.valid', snap(reset));
      golden.observe(
        'reset.loginNew',
        (await loginViaApi(t, user.email, newPassword)).status,
      );
      golden.observe(
        'reset.loginOld',
        (await loginViaApi(t, user.email, VALID_PASSWORD)).status,
      );
    });

    it('e-mail inexistente recebe exatamente a mesma resposta genérica', async () => {
      const res = await t
        .http('post', '/auth/forgot-password')
        .send({ email: uniqueEmail('x') });
      golden.observe('forgot.unknown', snap(res));
    });

    it('código errado responde com a mensagem atual', async () => {
      const user = await seedUser(t.prisma);
      await t.http('post', '/auth/forgot-password').send({ email: user.email });
      const res = await t.http('post', '/auth/reset-password').send({
        email: user.email,
        token: '000000',
        newPassword: 'NovaSenha#2025',
      });
      // '000000' pode coincidir com o código real em 1 a cada 10^6 execuções
      golden.observe('reset.wrongCode', snap(res));
    });
  });

  describe('senhas (3.11) e versões antigas do app (3.18)', () => {
    it('hash gerado pela API usa argon2id com os mesmos parâmetros e o pepper atual', async () => {
      const { email } = await registerViaApi(t);
      const hash: string = t.prisma.tables.user.find(
        (u) => u.email === email,
      )?.password;
      golden.observe('argon2.params', hash.split('$').slice(0, 4).join('$'));
    });

    it('hash existente (pepper atual) continua validando', async () => {
      const user = await seedUser(t.prisma);
      golden.observe(
        'argon2.existingHashLogin',
        (await loginViaApi(t, user.email)).status,
      );
    });

    it('troca de senha pelo perfil sem currentPassword continua aceita (app antigo)', async () => {
      const { user, auth } = await authenticatedUser(t);
      const res = await t
        .http('patch', '/users/me/profile')
        .set(auth)
        .send({ password: 'TrocaSemAtual#1' });
      golden.observe('profile.passwordWithoutCurrent', snap(res));
      golden.observe(
        'profile.passwordWithoutCurrent.login',
        (await loginViaApi(t, user.email, 'TrocaSemAtual#1')).status,
      );
    });
  });
});
