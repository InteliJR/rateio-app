/**
 * Property 1: Bug Condition - C_authz_upload com configuração padrão (1.13, 1.18, 1.19).
 *
 * Contraexemplos observados na produção (origin/main) — causas raiz confirmadas:
 *  - 1.13 Finalizar a conta A com uma divisão apontando para item/participante da conta B
 *         é aceito: `division.upsert` grava na conta de outro usuário.
 *  - 1.18 Arquivo HTML enviado como image/png com originalname '../../x.html' é gravado com
 *         chave terminada em '.html' (extensão vinda do nome do cliente); arquivo > 10 MB é
 *         bufferizado inteiro antes de ser rejeitado (400 em vez de 413 do multer).
 *  - 1.19 URL pré-assinada não assina Content-Length mesmo quando o tamanho é conhecido.
 */
import { createTestApp, TestApp } from '../helpers/test-app';
import {
  authenticatedUser,
  evenDivisions,
  seedBill,
} from '../helpers/factories';

const HTML = Buffer.from(
  '<html><script>alert(document.cookie)</script></html>',
);

describe('Bug condition: autorização da finalização e uploads', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  afterEach(() => {
    delete process.env.UPLOAD_SIGNATURE_ENFORCE;
  });

  it('1.13 divisão com item/participante de outra conta → 400, sem nenhuma escrita', async () => {
    const owner = await authenticatedUser(t);
    const victim = await authenticatedUser(t);
    const mine = seedBill(t.prisma, owner.user.id, {
      items: [{ name: 'Meu item', quantity: 1, unitPrice: 10 }],
      participants: ['Ana', 'Bruno'],
    });
    const theirs = seedBill(t.prisma, victim.user.id, {
      items: [{ name: 'Item alheio', quantity: 1, unitPrice: 30 }],
      participants: ['Carla'],
    });
    const before = JSON.stringify({
      divisions: t.prisma.tables.division,
      fees: t.prisma.tables.fee,
      bills: t.prisma.tables.bill.map((b) => [b.id, b.status]),
    });
    const upsertsBefore = t.prisma.callsTo('division', 'upsert').length;

    const res = await t
      .http('post', `/bills/${mine.billId}/finalize`)
      .set(owner.auth)
      .send({
        divisions: [
          ...evenDivisions(mine),
          {
            billItemId: theirs.itemIds[0],
            participantId: theirs.participantIds[0],
            shareAmount: 30,
          },
        ],
        fees: [],
      });

    expect(res.status).toBe(400);
    expect(t.prisma.callsTo('division', 'upsert').length).toBe(upsertsBefore);
    expect(
      JSON.stringify({
        divisions: t.prisma.tables.division,
        fees: t.prisma.tables.fee,
        bills: t.prisma.tables.bill.map((b) => [b.id, b.status]),
      }),
    ).toBe(before);
  });

  describe('1.18 multipart', () => {
    const sendHtml = async () => {
      const { auth } = await authenticatedUser(t);
      const before = t.s3Commands.length;
      const res = await t
        .http('post', '/bills')
        .set(auth)
        .attach('image', HTML, {
          filename: '../../x.html',
          contentType: 'image/png',
        });
      const keys = t.s3Commands
        .slice(before)
        .filter((c) => c.name === 'PutObjectCommand')
        .map((c) => String(c.input.Key));
      return { res, keys };
    };

    it('nome/extensão do cliente nunca chegam à chave do objeto (flag no default)', async () => {
      const { keys } = await sendHtml();
      for (const key of keys) {
        expect(key).not.toMatch(/\.html$/i);
        expect(key).not.toContain('..');
        // 2.18: nome e extensão vêm do MIME validado. Observação: o multipart grava em
        // bills/<uuid>.<ext> e o fluxo pré-assinado em bills/<userId>/<uuid>.<ext> (tarefa 9.4)
        expect(key).toMatch(
          /^bills\/([0-9a-f-]+\/)?[0-9a-f-]+\.(jpg|png|gif|webp)$/,
        );
      }
    });

    it('com UPLOAD_SIGNATURE_ENFORCE=true, conteúdo que não é imagem → 400 sem gravar', async () => {
      process.env.UPLOAD_SIGNATURE_ENFORCE = 'true';
      const { res, keys } = await sendHtml();
      expect(res.status).toBe(400);
      expect(keys).toHaveLength(0);
    });

    it('arquivo acima de 10 MB é barrado pelo multer (413) antes de chegar ao storage', async () => {
      const { auth } = await authenticatedUser(t);
      const before = t.s3Commands.length;
      const big = Buffer.alloc(10 * 1024 * 1024 + 1024, 0);
      Buffer.from('89504e470d0a1a0a', 'hex').copy(big);
      const res = await t
        .http('post', '/bills')
        .set(auth)
        .attach('image', big, {
          filename: 'grande.png',
          contentType: 'image/png',
        });
      expect(res.status).toBe(413);
      expect(t.s3Commands.length).toBe(before);
    });
  });

  describe('1.19 URL pré-assinada', () => {
    it('com size: Content-Length entra na assinatura', async () => {
      const { auth } = await authenticatedUser(t);
      const res = await t
        .http('post', '/bills/upload-url')
        .set(auth)
        .send({ filename: 'foto.jpg', mimeType: 'image/jpeg', size: 2048 });
      expect(res.status).toBe(201);
      const signed =
        new URL(res.body.uploadUrl).searchParams.get('X-Amz-SignedHeaders') ??
        '';
      expect(signed.split(';')).toContain('content-length');
    });

    it('sem size (app antigo): continua aceito por padrão', async () => {
      const { auth } = await authenticatedUser(t);
      const res = await t
        .http('post', '/bills/upload-url')
        .set(auth)
        .send({ filename: 'foto.jpg', mimeType: 'image/jpeg' });
      expect(res.status).toBe(201);
    });

    it('size acima de 10 MB é rejeitado', async () => {
      const { auth } = await authenticatedUser(t);
      const res = await t
        .http('post', '/bills/upload-url')
        .set(auth)
        .send({
          filename: 'foto.jpg',
          mimeType: 'image/jpeg',
          size: 50 * 1024 * 1024,
        });
      expect(res.status).toBe(400);
    });
  });
});
