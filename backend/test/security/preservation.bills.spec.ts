/**
 * Property 2: Preservation - contas, finalização, autorização e uploads (3.6–3.9, 3.18, 3.19).
 *
 * Property 7 (totais de finalização) e Property 9 (uploads de imagens válidas) do design.md.
 * Cenários gerados com semente fixa: os mesmos na produção e no código atual.
 */
import * as fc from 'fast-check';
import { createTestApp, TestApp } from '../helpers/test-app';
import { goldenSuite, keysOf, normalize } from '../helpers/golden';
import {
  GIF_MIN,
  JPEG_MIN,
  PNG_1X1,
  WEBP_MIN,
  authenticatedUser,
  billSpecArb,
  evenDivisions,
  seedBill,
} from '../helpers/factories';

const golden = goldenSuite('preservation.bills');
const snap = (res: { status: number; body: unknown }) => ({
  status: res.status,
  body: normalize(res.body),
});

const UUID_G = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const keyShape = (key: string, userId: string) =>
  key
    .split(userId)
    .join('<userId>')
    .replace(UUID_G, '<uuid>')
    .replace(/\d{10,}/g, '<n>');

/**
 * O caminho interno no bucket mudou de propósito na tarefa 9.4 (passou a incluir o userId
 * e a extensão vem do MIME validado). Ele não faz parte do contrato da API, então a
 * preservação compara só o que o cliente percebe: pasta raiz, extensão e Content-Type.
 */
const storedObject = (key: string | undefined) =>
  key ? { folder: key.split('/')[0], extension: key.split('.').pop() } : null;

describe('Preservation: contas', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    golden.flush();
    await t.close();
  });

  describe('Property 7: totais de finalização (3.7)', () => {
    const scenarios = fc.sample(billSpecArb, { seed: 42, numRuns: 20 });

    it.each(scenarios.map((s, i) => [i, s] as const))(
      'cenário %i: mesmos totais por participante, taxas e status COMPLETED',
      async (index, spec) => {
        const { user, auth } = await authenticatedUser(t);
        const seeded = seedBill(t.prisma, user.id, {
          items: spec.items,
          participants: spec.participants,
        });
        const res = await t
          .http('post', `/bills/${seeded.billId}/finalize`)
          .set(auth)
          .send({ divisions: evenDivisions(seeded), fees: spec.fees });

        // Totais por participante indexados pela ordem de criação (UUIDs mudam a cada execução)
        const byIndex = (totals: Record<string, unknown> | undefined) =>
          totals ? seeded.participantIds.map((id) => totals[id] ?? null) : null;
        golden.observe(`finalize.${index}`, {
          status: res.status,
          summary: res.body.summary ?? null,
          participantTotals: byIndex(res.body.participantTotals),
          billStatus: res.body.bill?.status ?? null,
          feesPersisted: Array.isArray(res.body.fees)
            ? res.body.fees.length
            : null,
          error: res.status >= 400 ? normalize(res.body) : null,
        });
      },
    );

    it('contrato completo da resposta de finalização', async () => {
      const { user, auth } = await authenticatedUser(t);
      const seeded = seedBill(t.prisma, user.id, {
        items: [
          { name: 'Pizza', quantity: 1, unitPrice: 80 },
          { name: 'Refri', quantity: 2, unitPrice: 7.5 },
        ],
        participants: ['Ana', 'Bruno', 'Carla'],
      });
      const res = await t
        .http('post', `/bills/${seeded.billId}/finalize`)
        .set(auth)
        .send({
          divisions: evenDivisions(seeded),
          fees: [
            { type: 'SERVICE_PERCENTAGE', value: 10, description: 'Serviço' },
          ],
        });
      golden.observe('finalize.contract', keysOf(res.body));
    });
  });

  describe('autorização existente (3.8)', () => {
    it('recursos de outro usuário continuam negados com o mesmo status', async () => {
      const owner = await authenticatedUser(t);
      const intruder = await authenticatedUser(t);
      const seeded = seedBill(t.prisma, owner.user.id, {
        items: [{ name: 'Item', quantity: 1, unitPrice: 20 }],
        participants: ['Ana', 'Bruno'],
      });
      const [itemId] = seeded.itemIds;
      const [participantId] = seeded.participantIds;
      const division = t.prisma.seed('division', {
        billItemId: itemId,
        participantId,
        shareAmount: 10,
      });
      const fee = t.prisma.seed('fee', {
        billId: seeded.billId,
        type: 'COVER_CHARGE',
        value: 5,
      });
      const id = seeded.billId;
      const item = { name: 'Novo', quantity: 1, unitPrice: 5, totalPrice: 5 };

      const attempts: [
        string,
        'get' | 'post' | 'patch' | 'delete',
        string,
        unknown?,
      ][] = [
        ['bill.get', 'get', `/bills/${id}`],
        ['bill.summary', 'get', `/bills/${id}/summary`],
        ['bill.patch', 'patch', `/bills/${id}`, { establishmentName: 'Hack' }],
        [
          'bill.finalize',
          'post',
          `/bills/${id}/finalize`,
          { divisions: evenDivisions(seeded), fees: [] },
        ],
        ['bill.duplicate', 'post', `/bills/${id}/duplicate`],
        ['bill.retryOcr', 'post', `/bills/${id}/retry-ocr`],
        [
          'bill.attach',
          'post',
          `/bills/${id}/image/attach`,
          { imageKey: `bills/${intruder.user.id}/x.png` },
        ],
        ['item.create', 'post', `/bills/${id}/items`, item],
        ['item.patch', 'patch', `/bills/${id}/items/${itemId}`, item],
        ['item.delete', 'delete', `/bills/${id}/items/${itemId}`],
        [
          'bill.fee',
          'post',
          `/bills/${id}/fees`,
          { type: 'COVER_CHARGE', value: 3 },
        ],
        ['participants.list', 'get', `/participants?billId=${id}`],
        [
          'participants.create',
          'post',
          '/participants',
          { billId: id, name: 'Intruso' },
        ],
        ['participant.get', 'get', `/participants/${participantId}`],
        [
          'participant.patch',
          'patch',
          `/participants/${participantId}`,
          { name: 'Hack' },
        ],
        ['participant.delete', 'delete', `/participants/${participantId}`],
        ['divisions.list', 'get', `/divisions?billId=${id}`],
        [
          'divisions.create',
          'post',
          '/divisions',
          { billItemId: itemId, participantId, shareAmount: 1 },
        ],
        ['division.get', 'get', `/divisions/${division.id}`],
        [
          'division.patch',
          'patch',
          `/divisions/${division.id}`,
          { shareAmount: 2 },
        ],
        ['division.delete', 'delete', `/divisions/${division.id}`],
        ['fees.list', 'get', `/fees?billId=${id}`],
        [
          'fees.create',
          'post',
          '/fees',
          { billId: id, type: 'COVER_CHARGE', value: 3 },
        ],
        ['fee.get', 'get', `/fees/${fee.id}`],
        ['fee.patch', 'patch', `/fees/${fee.id}`, { value: 9 }],
        ['fee.delete', 'delete', `/fees/${fee.id}`],
        ['bill.delete', 'delete', `/bills/${id}`],
      ];

      const results: Record<string, unknown> = {};
      for (const [name, method, url, body] of attempts) {
        let req = t.http(method, url).set(intruder.auth);
        if (body !== undefined) req = req.send(body as object);
        const res = await req;
        results[name] = snap(res);
      }
      golden.observe('authz.otherUser', results);
      // Nada da conta do dono foi alterado
      golden.observe('authz.ownerBillIntact', {
        exists: t.prisma.tables.bill.some((b) => b.id === id),
        participants: t.prisma.tables.participant.filter((p) => p.billId === id)
          .length,
        items: t.prisma.tables.billItem.filter((i) => i.billId === id).length,
      });
    });

    it('sem token, rotas de conta respondem 401', async () => {
      golden.observe('authz.noToken', snap(await t.http('get', '/bills')));
    });
  });

  describe('Property 9: uploads de imagens válidas (3.6, 3.18)', () => {
    const images: [string, Buffer, string, string][] = [
      ['jpeg', JPEG_MIN, 'image/jpeg', 'foto.jpg'],
      ['png', PNG_1X1, 'image/png', 'foto.png'],
      ['gif', GIF_MIN, 'image/gif', 'foto.gif'],
      ['webp', WEBP_MIN, 'image/webp', 'foto.webp'],
    ];

    it.each(images)(
      'multipart %s: conta em PENDING_OCR e imagem enviada ao storage',
      async (kind, buffer, mime, name) => {
        const { auth } = await authenticatedUser(t);
        const before = t.s3Commands.length;
        const res = await t
          .http('post', '/bills')
          .set(auth)
          .attach('image', buffer, { filename: name, contentType: mime });
        const put = t.s3Commands
          .slice(before)
          .find((c) => c.name === 'PutObjectCommand');
        golden.observe(`upload.multipart.${kind}`, {
          status: res.status,
          billStatus: res.body.status ?? null,
          keys: keysOf(res.body),
          storedObject: storedObject(put?.input.Key),
          contentType: put?.input.ContentType ?? null,
        });
      },
    );

    it('URL pré-assinada sem size (app antigo) + criação pela chave', async () => {
      const { user, auth } = await authenticatedUser(t);
      const url = await t
        .http('post', '/bills/upload-url')
        .set(auth)
        .send({ filename: 'foto.jpg', mimeType: 'image/jpeg' });
      golden.observe('upload.presigned.noSize', {
        status: url.status,
        keys: keysOf(url.body),
      });
      const imageKey = url.body.key ?? url.body.imageKey;
      golden.observe(
        'upload.presigned.keyShape',
        imageKey ? keyShape(imageKey, user.id) : null,
      );

      const created = await t
        .http('post', '/bills')
        .set(auth)
        .send({ imageKey });
      golden.observe('upload.presigned.create', {
        status: created.status,
        billStatus: created.body.status ?? null,
        keys: keysOf(created.body),
      });
    });

    it('nova imagem em conta existente (multipart e attach)', async () => {
      const { user, auth } = await authenticatedUser(t);
      const seeded = seedBill(t.prisma, user.id, { status: 'REVIEWING' });
      const multipart = await t
        .http('post', `/bills/${seeded.billId}/image`)
        .set(auth)
        .attach('image', PNG_1X1, {
          filename: 'nova.png',
          contentType: 'image/png',
        });
      golden.observe('upload.existing.multipart', {
        status: multipart.status,
        billStatus: multipart.body.status ?? null,
        keys: keysOf(multipart.body),
      });

      const other = seedBill(t.prisma, user.id, { status: 'REVIEWING' });
      const attach = await t
        .http('post', `/bills/${other.billId}/image/attach`)
        .set(auth)
        .send({ imageKey: `bills/${user.id}/1700000000000-abc.jpg` });
      golden.observe('upload.existing.attach', {
        status: attach.status,
        billStatus: attach.body.status ?? null,
        keys: keysOf(attach.body),
      });
    });

    it('avatar: URL pré-assinada sem size e upload multipart', async () => {
      const { auth } = await authenticatedUser(t);
      const url = await t
        .http('post', '/users/me/avatar/upload-url')
        .set(auth)
        .send({ filename: 'eu.png', mimeType: 'image/png' });
      golden.observe('avatar.presigned.noSize', {
        status: url.status,
        keys: keysOf(url.body),
      });

      const before = t.s3Commands.length;
      const upload = await t
        .http('post', '/users/me/avatar')
        .set(auth)
        .attach('avatar', PNG_1X1, {
          filename: 'eu.png',
          contentType: 'image/png',
        });
      const put = t.s3Commands
        .slice(before)
        .find((c) => c.name === 'PutObjectCommand');
      golden.observe('avatar.multipart', {
        status: upload.status,
        body: normalize(upload.body),
        storedObject: storedObject(put?.input.Key),
      });
      golden.observe(
        'avatar.remove',
        snap(await t.http('delete', '/users/me/avatar').set(auth)),
      );
    });
  });

  describe('contratos de histórico, detalhe, duplicação e exclusão (3.9, 3.19)', () => {
    it('criação manual, listagem, detalhe, resumo, duplicação e exclusão', async () => {
      const { user, auth } = await authenticatedUser(t);
      const manual = await t
        .http('post', '/bills')
        .set(auth)
        .send({
          billName: 'Jantar',
          participantNames: ['Ana', 'Bruno'],
          serviceFeePercentage: 10,
        });
      golden.observe('bill.createManual', {
        status: manual.status,
        body: normalize(manual.body),
      });

      const seeded = seedBill(t.prisma, user.id, {
        items: [{ name: 'Prato', quantity: 1, unitPrice: 42 }],
        participants: ['Ana', 'Bruno'],
      });
      const list = await t.http('get', '/bills').set(auth);
      golden.observe('bill.list', {
        status: list.status,
        keys: keysOf(list.body),
      });
      const detail = await t.http('get', `/bills/${seeded.billId}`).set(auth);
      golden.observe('bill.detail', {
        status: detail.status,
        body: normalize(detail.body),
      });
      const summary = await t
        .http('get', `/bills/${seeded.billId}/summary`)
        .set(auth);
      golden.observe('bill.summary', {
        status: summary.status,
        keys: keysOf(summary.body),
      });
      const duplicate = await t
        .http('post', `/bills/${seeded.billId}/duplicate`)
        .set(auth);
      golden.observe('bill.duplicate', {
        status: duplicate.status,
        keys: keysOf(duplicate.body),
      });
      const removed = await t
        .http('delete', `/bills/${seeded.billId}`)
        .set(auth);
      golden.observe('bill.delete', snap(removed));
      golden.observe(
        'bill.detailAfterDelete',
        snap(await t.http('get', `/bills/${seeded.billId}`).set(auth)),
      );
    });

    it('perfil: leitura, edição de nome e exclusão da própria conta', async () => {
      const { user, auth } = await authenticatedUser(t);
      golden.observe(
        'profile.get',
        snap(await t.http('get', '/users/me/profile').set(auth)),
      );
      golden.observe(
        'profile.patchName',
        snap(
          await t
            .http('patch', '/users/me/profile')
            .set(auth)
            .send({ name: 'Nome Novo' }),
        ),
      );
      const deleted = await t.http('delete', '/users/me').set(auth);
      golden.observe('profile.deleteAccount', snap(deleted));
      golden.observe(
        'profile.deleteAccount.userGone',
        !t.prisma.tables.user.some((u) => u.id === user.id),
      );
    });
  });
});
