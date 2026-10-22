import { SmokeApp, createSmokeApp, registerUser } from '../support/smoke-app';

// Única suíte com o rate limit ligado, como em produção.
describe('Fumaça: limite de requisições', () => {
  let smoke: SmokeApp;

  beforeAll(async () => {
    smoke = await createSmokeApp({ throttling: true });
  });

  afterAll(async () => {
    await smoke.close();
  });

  it('bloqueia a quarta tentativa de login no mesmo minuto', async () => {
    const user = await registerUser(smoke, 'limite');
    const attempt = () =>
      smoke
        .http()
        .post('/auth/login')
        .send({ email: user.email, password: 'senha-errada-123' });

    for (let index = 0; index < 3; index += 1) {
      await attempt().expect(401);
    }

    await attempt().expect(429);
  });
});
