import { SmokeApp, createSmokeApp } from './support/smoke-app';

describe('AppController (e2e)', () => {
  let smoke: SmokeApp;

  beforeAll(async () => {
    smoke = await createSmokeApp();
  });

  afterAll(async () => {
    await smoke.close();
  });

  it('/ (GET)', () => {
    return smoke.http().get('/').expect(200).expect('Hello World!');
  });

  it('/health (GET)', async () => {
    const response = await smoke.http().get('/health').expect(200);

    expect(response.body.status).toBe('ok');
    expect(response.body.database.status).toBe('connected');
  });
});
