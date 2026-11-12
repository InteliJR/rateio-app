/**
 * Property 1: Bug Condition - casos que exigem configuração opcional ligada (1.11, 1.14, 1.21).
 *
 * Arquivo próprio porque precisa de uma instância da API com outras variáveis de ambiente
 * (o passport só admite uma instância viva por arquivo de teste).
 *
 * Contraexemplos observados na produção (origin/main) — causas raiz confirmadas:
 *  - 1.11 Com METRICS_TOKEN definido, /metrics continua aberto (200 sem credencial).
 *  - 1.21 Com CORS_ALLOWED_ORIGINS definido, uma origem qualquer recebe
 *         Access-Control-Allow-Origin ('*'): a variável é ignorada.
 *  - 1.14 (pendente) Com AWS_S3_PUBLIC_BASE_URL definido, a resposta da criação (POST /bills)
 *         e o histórico (GET /bills) devolvem a URL pública permanente gravada no banco.
 *         Detalhe, resumo e avatar já assinam a URL na leitura (igual na produção).
 */
import { createTestApp, TestApp } from '../helpers/test-app';
import { itPendingFix } from '../helpers/pending';
import { authenticatedUser, PNG_1X1 } from '../helpers/factories';

const METRICS_TOKEN = 'metrics-token-0123456789abcdef0123456789';
const ALLOWED = 'https://app.rateio.exemplo';
const EVIL = 'https://evil.example';

describe('Bug condition: configuração opcional ligada', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp({
      env: {
        METRICS_TOKEN,
        CORS_ALLOWED_ORIGINS: ALLOWED,
        AWS_S3_PUBLIC_BASE_URL: 'https://cdn.rateio.exemplo',
      },
    });
  });
  afterAll(() => t.close());

  describe('1.11 /metrics com METRICS_TOKEN', () => {
    it('sem credencial nega (401/403)', async () => {
      expect([401, 403]).toContain((await t.http('get', '/metrics')).status);
    });

    it('com token errado nega e com o token certo responde', async () => {
      const wrong = await t
        .http('get', '/metrics')
        .set('Authorization', 'Bearer errado');
      expect([401, 403]).toContain(wrong.status);
      const ok = await t
        .http('get', '/metrics')
        .set('Authorization', `Bearer ${METRICS_TOKEN}`);
      expect(ok.status).toBe(200);
    });
  });

  describe('1.21 CORS com CORS_ALLOWED_ORIGINS', () => {
    it('origem não listada não recebe Access-Control-Allow-Origin (e sem erro 500)', async () => {
      const res = await t
        .http('options', '/auth/login')
        .set('Origin', EVIL)
        .set('Access-Control-Request-Method', 'POST');
      expect(res.status).toBeLessThan(500);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('origem listada continua recebendo CORS', async () => {
      const res = await t
        .http('options', '/auth/login')
        .set('Origin', ALLOWED)
        .set('Access-Control-Request-Method', 'POST');
      expect(res.headers['access-control-allow-origin']).toBe(ALLOWED);
    });

    it('requisição sem Origin (app nativo) não é afetada', async () => {
      expect((await t.http('get', '/')).status).toBe(200);
    });
  });

  describe('1.14 imagens com AWS_S3_PUBLIC_BASE_URL', () => {
    itPendingFix(
      'criação e histórico devolvem URL assinada, não a URL pública permanente',
      async () => {
        const { auth } = await authenticatedUser(t);
        const created = await t
          .http('post', '/bills')
          .set(auth)
          .attach('image', PNG_1X1, {
            filename: 'c.png',
            contentType: 'image/png',
          });
        expect(created.status).toBe(201);
        const list = await t.http('get', '/bills').set(auth);
        const listed = (list.body.data ?? []).find(
          (b: any) => b.id === created.body.id,
        );
        expect(created.body.imageUrl).toContain('X-Amz-Signature');
        expect(listed?.imageUrl).toContain('X-Amz-Signature');
      },
    );

    it('detalhe e resumo da conta já devolvem URL assinada (regressão)', async () => {
      const { auth } = await authenticatedUser(t);
      const created = await t
        .http('post', '/bills')
        .set(auth)
        .attach('image', PNG_1X1, {
          filename: 'c.png',
          contentType: 'image/png',
        });
      const detail = await t.http('get', `/bills/${created.body.id}`).set(auth);
      expect(detail.body.imageUrl).toContain('X-Amz-Signature');
    });

    it('a coluna imageUrl persistida não é anulada (2.14)', async () => {
      const { auth } = await authenticatedUser(t);
      const created = await t
        .http('post', '/bills')
        .set(auth)
        .attach('image', PNG_1X1, {
          filename: 'c.png',
          contentType: 'image/png',
        });
      const row = t.prisma.tables.bill.find((b) => b.id === created.body.id);
      expect(row?.imageUrl).toEqual(expect.any(String));
      expect(row?.imageUrl).not.toBe('');
    });
  });
});
