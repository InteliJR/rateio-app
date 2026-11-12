import { createTestApp, TestApp } from '../helpers/test-app';
import { authenticatedUser, registerViaApi } from '../helpers/factories';

describe('harness da suíte de segurança', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  it('sobe a API real e atende GET /', async () => {
    const res = await t.http('get', '/');
    expect(res.status).toBe(200);
  });

  it('registra, faz login e acessa rota autenticada pelo banco em memória', async () => {
    const { res } = await registerViaApi(t);
    expect(res.status).toBe(201);
    const { auth } = await authenticatedUser(t);
    const me = await t.http('get', '/auth/me').set(auth);
    expect(me.status).toBe(200);
  });
});
