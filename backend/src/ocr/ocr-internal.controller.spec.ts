import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { OcrInternalController } from './ocr-internal.controller';

/**
 * Autenticação da rota interna do cron (`/internal/ocr/*`). A Vercel envia
 * `Authorization: Bearer $CRON_SECRET`; o cabeçalho `x-internal-cron-secret`
 * serve para chamadas manuais. Qualquer um dos dois segredos configurados vale,
 * por qualquer um dos dois canais.
 *
 * O QUE ESTES TESTES PROVAM: sem segredo configurado, ou com segredo errado, a
 * fila nunca é tocada (403); com segredo válido, GET e POST processam.
 * O QUE NÃO PROVAM: a configuração real do cron na Vercel.
 */
describe('OcrInternalController (autenticação do cron)', () => {
  const SECRET = 'segredo-interno-de-teste';
  const CRON = 'segredo-do-cron-de-teste';
  const saved = {
    internal: process.env.INTERNAL_CRON_SECRET,
    cron: process.env.CRON_SECRET,
  };

  let queue: { processPendingJobs: jest.Mock; getQueueSnapshot: jest.Mock };
  let controller: OcrInternalController;

  const configure = (internal?: string, cron?: string) => {
    if (internal === undefined) delete process.env.INTERNAL_CRON_SECRET;
    else process.env.INTERNAL_CRON_SECRET = internal;
    if (cron === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = cron;
  };

  beforeEach(() => {
    queue = {
      processPendingJobs: jest
        .fn()
        .mockResolvedValue({ processed: 1, activeWorkers: 0 }),
      getQueueSnapshot: jest.fn().mockResolvedValue({ pending: 0 }),
    };
    controller = new OcrInternalController(queue as any);
    configure(SECRET, CRON);
  });

  afterEach(() => {
    configure(saved.internal, saved.cron);
  });

  const handlers = {
    'GET process-pending': (secret?: string, auth?: string) =>
      controller.processPendingByCron(secret, auth),
    'POST process-pending': (secret?: string, auth?: string) =>
      controller.processPending(secret, auth),
    'GET queue': (secret?: string, auth?: string) =>
      controller.getQueueStatus(secret, auth),
  };

  describe.each(Object.entries(handlers))('%s', (_name, call) => {
    const touched = () =>
      queue.processPendingJobs.mock.calls.length +
      queue.getQueueSnapshot.mock.calls.length;

    it('sem nenhum segredo configurado: 403, mesmo com cabeçalho vazio', async () => {
      configure(undefined, undefined);

      await expect(Promise.resolve().then(() => call('', ''))).rejects.toThrow(
        ForbiddenException,
      );
      await expect(
        Promise.resolve().then(() => call(SECRET, `Bearer ${SECRET}`)),
      ).rejects.toThrow('not configured');
      expect(touched()).toBe(0);
    });

    it('segredo configurado vazio conta como não configurado', async () => {
      configure('', '');

      await expect(
        Promise.resolve().then(() => call('', undefined)),
      ).rejects.toThrow('not configured');
      expect(touched()).toBe(0);
    });

    it.each([
      ['sem credencial', undefined, undefined],
      ['cabeçalho errado', 'errado', undefined],
      ['Bearer errado', undefined, 'Bearer errado'],
      ['Bearer sem o prefixo', undefined, SECRET],
      ['prefixo em minúsculas', undefined, `bearer ${SECRET}`],
      ['Bearer vazio', undefined, 'Bearer '],
    ])('%s: 403 e a fila não é tocada', async (_label, secret, auth) => {
      await expect(
        Promise.resolve().then(() => call(secret, auth)),
      ).rejects.toThrow('Invalid internal credential.');
      expect(touched()).toBe(0);
    });

    it.each([
      ['cabeçalho com INTERNAL_CRON_SECRET', SECRET, undefined],
      ['cabeçalho com CRON_SECRET', CRON, undefined],
      [
        'Bearer com CRON_SECRET (como a Vercel envia)',
        undefined,
        `Bearer ${CRON}`,
      ],
      ['Bearer com INTERNAL_CRON_SECRET', undefined, `Bearer ${SECRET}`],
    ])('%s: aceita', async (_label, secret, auth) => {
      await expect(
        Promise.resolve().then(() => call(secret, auth)),
      ).resolves.toBeDefined();
      expect(touched()).toBe(1);
    });
  });

  it('GET e POST de process-pending chamam a mesma fila e devolvem o resultado', async () => {
    const viaGet = await controller.processPendingByCron(SECRET, undefined);
    const viaPost = await controller.processPending(
      undefined,
      `Bearer ${CRON}`,
    );

    expect(viaGet).toEqual({ processed: 1, activeWorkers: 0 });
    expect(viaPost).toEqual(viaGet);
    expect(queue.processPendingJobs).toHaveBeenCalledTimes(2);
  });

  it('só um dos segredos configurado: o outro canal continua sem passar', async () => {
    configure(undefined, CRON);

    await expect(
      Promise.resolve().then(() =>
        controller.processPending(SECRET, undefined),
      ),
    ).rejects.toThrow('Invalid internal credential.');
    await expect(
      controller.processPending(undefined, `Bearer ${CRON}`),
    ).resolves.toBeDefined();
  });

  it('a mensagem de erro nunca revela o segredo configurado', async () => {
    try {
      await Promise.resolve().then(() =>
        controller.processPending('errado', undefined),
      );
      throw new Error('deveria ter lançado');
    } catch (error) {
      expect(
        JSON.stringify((error as ForbiddenException).getResponse()),
      ).not.toContain(SECRET);
      expect(
        JSON.stringify((error as ForbiddenException).getResponse()),
      ).not.toContain(CRON);
    }
  });
});
