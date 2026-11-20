/**
 * Property 1: Bug Condition - C_session (1.4–1.10, 1.16, 1.17, 1.27, 1.28).
 *
 * Todas as falhas desta família pertencem à Fase 2 (ainda não implementada), então quase
 * todos os casos são `it.failing`: hoje o Jest exige que falhem. Ao implementar cada item
 * da Fase 2, o caso correspondente "quebra" e deve virar `it`.
 *
 * Contraexemplos observados no código atual e na produção — causas raiz confirmadas:
 *  - 1.4  Após 6 tentativas erradas (IPs distintos), o código correto ainda redefine a senha:
 *         não há contador de tentativas por código.
 *  - 1.5  passwordResetToken.token guarda o código de 6 dígitos em texto claro.
 *  - 1.6  Troca de senha (perfil ou reset) não revoga refresh tokens de outros aparelhos;
 *         currentPassword é rejeitado pelo whitelist (400 "should not exist"), não validado.
 *  - 1.7  Se a atualização da senha falha, o código já foi marcado como usado (sem transação).
 *  - 1.8  Refresh reutilizado depois da janela continua aceito (sem rotação nem detecção).
 *  - 1.9  logoutAllDevices apaga os registros de revogação: um refresh revogado volta a valer.
 *  - 1.10 Access token continua válido após logout; erro na consulta de revogação autentica
 *         a requisição (fail-open) em vez de responder 503.
 *  - 1.16 Falha de SMTP em forgot-password vira 500 (revela que o e-mail existe).
 *  - 1.17 Conta inativa responde "Usuário inativo" antes de validar a senha.
 *  - 1.27 Access token sem claim `typ` e com e-mail no payload.
 *  - 1.28 'A@x.com' e 'a@x.com' viram duas contas.
 */
import { createTestApp, nextIp, TestApp } from '../helpers/test-app';
import { itPendingFix } from '../helpers/pending';
import {
  VALID_PASSWORD,
  authenticatedUser,
  decodeJwt,
  loginViaApi,
  registerViaApi,
  seedUser,
} from '../helpers/factories';

const NEW_PASSWORD = 'NovaSenha#2025';

describe('Bug condition: sessões e credenciais', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  afterEach(() => {
    t.prisma.clearInjections();
    t.mail.sendPasswordResetEmail.mockImplementation(
      async (email: string, code: string) => {
        t.mails.push({ email, code });
      },
    );
    jest.restoreAllMocks();
  });

  const requestCode = async (email: string) => {
    await t.http('post', '/auth/forgot-password').send({ email });
    const mail = [...t.mails].reverse().find((m) => m.email === email);
    if (!mail) throw new Error('código não enviado');
    return mail.code;
  };
  const reset = (
    email: string,
    token: string,
    newPassword = NEW_PASSWORD,
    ip = nextIp(),
  ) =>
    t
      .http('post', '/auth/reset-password', ip)
      .send({ email, token, newPassword });

  describe('recuperação de senha', () => {
    itPendingFix(
      '1.4 após 5 tentativas erradas o código correto deixa de funcionar',
      async () => {
        const user = await seedUser(t.prisma);
        const code = await requestCode(user.email);
        const wrong = code === '000000' ? '111111' : '000000';
        // Ataque distribuído: cada tentativa de um IP diferente (contorna o limite por IP)
        for (let i = 0; i < 6; i++) await reset(user.email, wrong);
        const res = await reset(user.email, code);
        expect(res.status).not.toBe(200);
        expect((await loginViaApi(t, user.email, NEW_PASSWORD)).status).toBe(
          401,
        );
      },
    );

    itPendingFix('1.5 o código não é persistido em texto claro', async () => {
      const user = await seedUser(t.prisma);
      const code = await requestCode(user.email);
      const stored = t.prisma.tables.passwordResetToken.filter(
        (r) => r.email === user.email,
      );
      expect(stored.length).toBeGreaterThan(0);
      for (const row of stored) {
        expect(Object.values(row)).not.toContain(code);
      }
    });

    itPendingFix(
      '1.7 se a troca de senha falhar, o código não é consumido',
      async () => {
        const user = await seedUser(t.prisma);
        const code = await requestCode(user.email);
        t.prisma.inject('user', 'update', () => {
          throw new Error('falha simulada ao gravar a senha');
        });
        const failed = await reset(user.email, code);
        expect(failed.status).toBeGreaterThanOrEqual(500);
        t.prisma.clearInjections();
        expect((await reset(user.email, code)).status).toBe(200);
      },
    );

    itPendingFix(
      '1.16 falha de SMTP devolve a mesma resposta genérica do sucesso',
      async () => {
        const ok = await seedUser(t.prisma);
        const success = await t
          .http('post', '/auth/forgot-password')
          .send({ email: ok.email });
        const user = await seedUser(t.prisma);
        t.mail.sendPasswordResetEmail.mockRejectedValue(
          new Error('SMTP indisponível'),
        );
        const failure = await t
          .http('post', '/auth/forgot-password')
          .send({ email: user.email });
        expect({ status: failure.status, body: failure.body }).toEqual({
          status: success.status,
          body: success.body,
        });
      },
    );

    itPendingFix(
      '1.6 redefinir a senha revoga as sessões existentes',
      async () => {
        const { user, refreshToken } = await authenticatedUser(t);
        const code = await requestCode(user.email);
        expect((await reset(user.email, code)).status).toBe(200);
        const res = await t
          .http('post', '/auth/refresh')
          .send({ refreshToken });
        expect(res.status).toBe(401);
      },
    );
  });

  describe('troca de senha pelo perfil (1.6)', () => {
    itPendingFix(
      'currentPassword errado → 400 "Senha atual incorreta" e senha inalterada',
      async () => {
        const { user, auth } = await authenticatedUser(t);
        const res = await t
          .http('patch', '/users/me/profile')
          .set(auth)
          .send({ password: NEW_PASSWORD, currentPassword: 'errada-123' });
        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Senha atual incorreta');
        expect((await loginViaApi(t, user.email, NEW_PASSWORD)).status).toBe(
          401,
        );
      },
    );

    itPendingFix(
      'troca bem-sucedida revoga as sessões de outros aparelhos',
      async () => {
        const deviceA = await authenticatedUser(t);
        const deviceB = await loginViaApi(t, deviceA.user.email);
        const change = await t
          .http('patch', '/users/me/profile')
          .set(deviceA.auth)
          .send({ password: NEW_PASSWORD, currentPassword: VALID_PASSWORD });
        expect(change.status).toBe(200);
        const res = await t
          .http('post', '/auth/refresh')
          .send({ refreshToken: deviceB.body.refreshToken });
        expect(res.status).toBe(401);
      },
    );
  });

  describe('refresh, logout e revogação', () => {
    itPendingFix(
      '1.8 com rotação ligada, reuso fora da janela é detectado e revoga a sessão',
      async () => {
        process.env.REFRESH_ROTATION_ENABLED = 'true';
        process.env.REFRESH_ROTATION_GRACE_SECONDS = '30';
        try {
          const { refreshToken: r1 } = await authenticatedUser(t);
          const first = await t
            .http('post', '/auth/refresh')
            .send({ refreshToken: r1 });
          expect(first.status).toBe(200);
          const realNow = Date.now();
          jest.spyOn(Date, 'now').mockReturnValue(realNow + 120_000); // depois da janela
          const replay = await t
            .http('post', '/auth/refresh')
            .send({ refreshToken: r1 });
          expect(replay.status).toBe(401);
          const r2 = await t
            .http('post', '/auth/refresh')
            .send({ refreshToken: first.body.refreshToken });
          expect(r2.status).toBe(401); // família revogada
        } finally {
          delete process.env.REFRESH_ROTATION_ENABLED;
          delete process.env.REFRESH_ROTATION_GRACE_SECONDS;
        }
      },
    );

    itPendingFix(
      '1.9 logout global não reativa refresh tokens já revogados',
      async () => {
        const { user, refreshToken, auth } = await authenticatedUser(t);
        await t.http('post', '/auth/logout').set(auth).send({ refreshToken });
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { AuthService } = require('../../src/auth/auth.service');
        await t.app.get(AuthService).logoutAllDevices(user.id);
        const res = await t
          .http('post', '/auth/refresh')
          .send({ refreshToken });
        expect(res.status).toBe(401);
      },
    );

    itPendingFix(
      '1.9 existe rota autenticada para sair de todos os aparelhos',
      async () => {
        const deviceA = await authenticatedUser(t);
        const deviceB = await loginViaApi(t, deviceA.user.email);
        const res = await t.http('post', '/auth/logout-all').set(deviceA.auth);
        expect(res.status).toBe(200);
        const refresh = await t
          .http('post', '/auth/refresh')
          .send({ refreshToken: deviceB.body.refreshToken });
        expect(refresh.status).toBe(401);
      },
    );

    itPendingFix(
      '1.10 o access token deixa de valer após o logout',
      async () => {
        const { refreshToken, auth } = await authenticatedUser(t);
        expect(
          (
            await t
              .http('post', '/auth/logout')
              .set(auth)
              .send({ refreshToken })
          ).status,
        ).toBe(200);
        expect((await t.http('get', '/auth/me').set(auth)).status).toBe(401);
      },
    );

    itPendingFix(
      '1.10 falha na consulta de revogação responde 503 (fail-closed), não autentica',
      async () => {
        const { auth } = await authenticatedUser(t);
        t.prisma.inject('revokedToken', 'findUnique', () => {
          throw new Error('banco indisponível');
        });
        const res = await t.http('get', '/auth/me').set(auth);
        expect(res.status).toBe(503);
      },
    );

    it('1.27 refresh token apresentado como Bearer é rejeitado', async () => {
      const { refreshToken } = await authenticatedUser(t);
      const res = await t
        .http('get', '/auth/me')
        .set('Authorization', `Bearer ${refreshToken}`);
      expect(res.status).toBe(401);
    });

    itPendingFix(
      '1.27 tokens novos têm claim typ e não carregam e-mail',
      async () => {
        const { accessToken, refreshToken } = await authenticatedUser(t);
        const access = decodeJwt(accessToken);
        const refresh = decodeJwt(refreshToken);
        expect(access.typ).toBe('access');
        expect(refresh.typ).toBe('refresh');
        expect(access).not.toHaveProperty('email');
        expect(refresh).not.toHaveProperty('email');
      },
    );
  });

  describe('enumeração e normalização', () => {
    itPendingFix(
      '1.17 conta inativa com senha errada responde "Credenciais inválidas"',
      async () => {
        const user = await seedUser(t.prisma, { isActive: false });
        const res = await loginViaApi(t, user.email, 'senha-errada-123');
        expect(res.status).toBe(401);
        expect(res.body.message).toBe('Credenciais inválidas');
      },
    );

    itPendingFix(
      '1.28 e-mails que diferem só na caixa resolvem para a mesma conta',
      async () => {
        const base = `Caixa.${Date.now()}@Teste.com`;
        const first = await registerViaApi(t, base);
        expect(first.res.status).toBe(201);
        const second = await registerViaApi(t, base.toLowerCase());
        expect(second.res.status).toBe(409);
        expect(
          t.prisma.tables.user.filter(
            (u) => u.email.toLowerCase() === base.toLowerCase(),
          ),
        ).toHaveLength(1);
      },
    );
  });
});
