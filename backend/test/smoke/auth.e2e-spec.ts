import {
  SMOKE_PASSWORD,
  SmokeApp,
  SmokeUser,
  createSmokeApp,
  registerUser,
} from '../support/smoke-app';

describe('Fumaça: autenticação', () => {
  let smoke: SmokeApp;
  let user: SmokeUser;

  beforeAll(async () => {
    smoke = await createSmokeApp();
    user = await registerUser(smoke, 'auth');
  });

  afterAll(async () => {
    await smoke.close();
  });

  it('cadastro devolve tokens e não expõe a senha', async () => {
    expect(user.accessToken).toEqual(expect.any(String));
    expect(user.refreshToken).toEqual(expect.any(String));

    const response = await smoke
      .http()
      .get('/auth/me')
      .set(user.auth)
      .expect(200);

    expect(response.body.email).toBe(user.email);
    expect(response.body).not.toHaveProperty('password');
  });

  it('login aceita a senha correta e recusa a errada', async () => {
    await smoke
      .http()
      .post('/auth/login')
      .send({ email: user.email, password: 'senha-errada-123' })
      .expect(401);

    const response = await smoke
      .http()
      .post('/auth/login')
      .send({ email: user.email, password: SMOKE_PASSWORD })
      .expect(200);

    expect(response.body.accessToken).toEqual(expect.any(String));
  });

  it('rota protegida recusa ausência de token e token inválido', async () => {
    await smoke.http().get('/bills').expect(401);
    await smoke
      .http()
      .get('/bills')
      .set({ Authorization: 'Bearer token-invalido' })
      .expect(401);
  });

  it('cadastro público não cria administrador', async () => {
    await smoke
      .http()
      .post('/auth/register')
      .send({
        email: `admin-${Date.now()}@smoke.test`,
        name: 'Tentativa Admin',
        password: SMOKE_PASSWORD,
        role: 'ADMIN',
      })
      .expect(403);
  });

  it('refresh renova o acesso e logout invalida o refresh token', async () => {
    const session = await smoke
      .http()
      .post('/auth/login')
      .send({ email: user.email, password: SMOKE_PASSWORD })
      .expect(200);

    const refreshed = await smoke
      .http()
      .post('/auth/refresh')
      .send({ refreshToken: session.body.refreshToken })
      .expect(200);

    expect(refreshed.body.accessToken).toEqual(expect.any(String));

    await smoke
      .http()
      .post('/auth/logout')
      .set({ Authorization: `Bearer ${refreshed.body.accessToken}` })
      .send({ refreshToken: refreshed.body.refreshToken })
      .expect(200);

    await smoke
      .http()
      .post('/auth/refresh')
      .send({ refreshToken: refreshed.body.refreshToken })
      .expect(401);
  });
});
