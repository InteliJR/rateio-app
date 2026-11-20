/**
 * Property 1: Bug Condition - C_exposure e C_privacy no backend (1.11, 1.12, 1.15, 1.22, 1.29).
 *
 * Contraexemplos observados na produção (origin/main) — causas raiz confirmadas:
 *  - 1.11 GET /health com o banco fora devolve `database.error` com a mensagem crua do driver
 *         e o snapshot de `metrics`; GET /metrics responde 200 sem credencial.
 *  - 1.12 Falha interna na criação manual de conta devolve `error.message` (nome de coluna)
 *         ao cliente; corrida de e-mail duplicado (P2002) vira 500.
 *         No código atual o P2002 já responde 409, mas o vazamento da criação manual
 *         CONTINUA (tarefa 7.2 incompleta em bills.service.ts) → caso pendente.
 *  - 1.15 OcrService registra a URL assinada da imagem e o conteúdo do modelo; MailService
 *         registra o e-mail do usuário.
 *  - 1.29 /bill-items (scaffold) responde sem autenticação.
 *  - 1.22 (pendente) Falha ao apagar arquivo no storage é ignorada na exclusão de conta,
 *         sem registro de pendência.
 */
import { Logger } from '@nestjs/common';
import { createTestApp, TestApp } from '../helpers/test-app';
import { itPendingFix } from '../helpers/pending';
import { prismaError } from '../helpers/fake-prisma';
import {
  authenticatedUser,
  registerViaApi,
  seedBill,
} from '../helpers/factories';
import { OcrService } from '../../src/ocr/ocr.service';
import { MailService } from '../../src/mail/mail.service';

const INTERNAL = 'secret_col';
const SIGNED_URL =
  'https://test-bucket.s3.amazonaws.com/bills/u/1.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIA%2Ftest&X-Amz-Signature=deadbeefcafe';
const EMAIL = 'cliente.sigiloso@exemplo.com';

/** Captura tudo o que vai para Logger do Nest e console durante `fn`. */
async function captureLogs(fn: () => Promise<unknown>): Promise<string> {
  const lines: string[] = [];
  const record = (...args: unknown[]) => {
    lines.push(
      args
        .map((a) =>
          a instanceof Error
            ? `${a.message} ${a.stack ?? ''}`
            : typeof a === 'string'
              ? a
              : JSON.stringify(a),
        )
        .join(' '),
    );
  };
  const spies = [
    ...(['log', 'error', 'warn', 'debug', 'verbose', 'fatal'] as const).map(
      (m) =>
        jest
          .spyOn(Logger.prototype, m as any)
          .mockImplementation(record as any),
    ),
    ...(['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      jest.spyOn(console, m).mockImplementation(record),
    ),
  ];
  try {
    await fn().catch(() => undefined);
  } finally {
    spies.forEach((s) => s.mockRestore());
  }
  return lines.join('\n');
}

describe('Bug condition: exposição e privacidade', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  afterEach(() => {
    t.prisma.clearInjections();
    t.prisma.queryRawFails = false;
  });

  describe('1.11 health e métricas', () => {
    it('/health com banco fora: 200 (flag estrita desligada) sem metrics nem erro cru', async () => {
      t.prisma.queryRawFails = true;
      const res = await t.http('get', '/health');
      expect(res.status).toBe(200);
      expect(res.body).not.toHaveProperty('metrics');
      expect(res.body.database).not.toHaveProperty('error');
      expect(JSON.stringify(res.body)).not.toContain(INTERNAL);
      expect(res.body.database.status).toBe('disconnected');
    });

    it('/metrics sem METRICS_TOKEN configurado responde 404', async () => {
      expect((await t.http('get', '/metrics')).status).toBe(404);
    });
    // Com METRICS_TOKEN configurado: ver bug-condition.env-*.spec.ts (exige outra instância)
  });

  describe('1.12 mensagens de erro', () => {
    // Pendente: tarefa 7.2 está marcada como concluída, mas bills.service.ts (linhas 316, 345,
    // 381 e 393) ainda concatena error.message na resposta da criação manual de conta.
    itPendingFix(
      'falha interna na criação manual não devolve a mensagem do banco',
      async () => {
        const { auth } = await authenticatedUser(t);
        t.prisma.inject('fee', 'create', () => {
          throw new Error(
            `column "${INTERNAL}" of relation "fees" violates not-null constraint`,
          );
        });
        const res = await t
          .http('post', '/bills')
          .set(auth)
          .send({
            billName: 'Falha',
            serviceFeePercentage: 10,
            participantNames: ['Ana'],
          });
        expect(JSON.stringify(res.body)).not.toContain(INTERNAL);
      },
    );

    it('corrida de e-mail duplicado (P2002) responde 409, não 500', async () => {
      t.prisma.inject('user', 'create', () => {
        throw prismaError(
          'P2002',
          'Unique constraint failed on the fields: (`email`)',
          {
            target: ['email'],
          },
        );
      });
      const { res } = await registerViaApi(t);
      expect(res.status).toBe(409);
      expect(JSON.stringify(res.body)).not.toContain('Unique constraint');
    });
  });

  it('1.29 /bill-items (scaffold) não existe', async () => {
    expect((await t.http('get', '/bill-items')).status).toBe(404);
    expect((await t.http('post', '/bill-items').send({})).status).toBe(404);
  });

  describe('1.15 logs sem PII, URL assinada ou conteúdo de OCR', () => {
    it('OCR com resposta inválida não registra a URL assinada nem o conteúdo do modelo', async () => {
      const service = new OcrService();
      (service as any).openaiClient = {
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [
                {
                  message: {
                    content: `nao e json; cliente ${EMAIL} cpf 123.456.789-00`,
                  },
                },
              ],
            }),
          },
        },
      };
      const logs = await captureLogs(() => service.processImage(SIGNED_URL));
      expect(logs).not.toContain('X-Amz-Signature');
      expect(logs).not.toContain('X-Amz-Credential');
      expect(logs).not.toContain(EMAIL);
      expect(logs).not.toContain('123.456.789-00');
    });

    it('envio de e-mail (sucesso e falha) não registra o endereço do usuário', async () => {
      const service = new MailService();
      const transporter = { sendMail: jest.fn().mockResolvedValue({}) };
      (service as any).transporter = transporter;
      const okLogs = await captureLogs(() =>
        service.sendPasswordResetEmail(EMAIL, '123456'),
      );
      transporter.sendMail.mockRejectedValue(
        new Error(`SMTP recusou ${EMAIL}`),
      );
      const failLogs = await captureLogs(() =>
        service.sendPasswordResetEmail(EMAIL, '654321'),
      );
      expect(okLogs + failLogs).not.toContain(EMAIL);
      expect(okLogs + failLogs).not.toMatch(/123456|654321/);
    });

    it('fluxos HTTP com falha (recuperação, divisões alheias) não registram e-mail', async () => {
      const owner = await authenticatedUser(t);
      const intruder = await authenticatedUser(t);
      const seeded = seedBill(t.prisma, owner.user.id);
      t.mail.sendPasswordResetEmail.mockRejectedValueOnce(
        new Error('smtp down'),
      );
      const logs = await captureLogs(async () => {
        await t
          .http('post', '/auth/forgot-password')
          .send({ email: owner.user.email });
        await t.http('post', '/divisions').set(intruder.auth).send({
          billItemId: seeded.itemIds[0],
          participantId: seeded.participantIds[0],
          shareAmount: 1,
        });
      });
      expect(logs).not.toContain(owner.user.email);
      expect(logs).not.toContain(intruder.user.email);
    });
  });

  describe('1.22 exclusão de conta (LGPD)', () => {
    itPendingFix(
      'falha ao apagar arquivo registra pendência e não quebra a exclusão',
      async () => {
        const { user, auth } = await authenticatedUser(t);
        t.prisma.seed('bill', {
          userId: user.id,
          status: 'COMPLETED',
          imageKey: `bills/${user.id}/comprovante.jpg`,
          imageUrl: `https://test-bucket.s3.us-east-1.amazonaws.com/bills/${user.id}/comprovante.jpg`,
        });
        const s3 = (t.storage as any).s3Client;
        const original = s3.send;
        s3.send = jest.fn(async (command: any) => {
          if (command?.constructor?.name === 'DeleteObjectCommand')
            throw new Error('S3 indisponível');
          return {};
        });
        try {
          const res = await t.http('delete', '/users/me').set(auth);
          expect(res.status).toBe(200);
          expect(t.prisma.tables.user.some((u) => u.id === user.id)).toBe(
            false,
          );
          const pending = t.prisma.tables.storageDeletionTask ?? [];
          expect(pending.map((p: any) => p.key)).toContain(
            `bills/${user.id}/comprovante.jpg`,
          );
        } finally {
          s3.send = original;
        }
      },
    );
  });
});
