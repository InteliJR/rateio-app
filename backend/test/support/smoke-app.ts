import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import helmet from 'helmet';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { OcrResult } from '../../src/ocr/dto/ocr-result.dto';
import { OcrService } from '../../src/ocr/ocr.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { StorageService } from '../../src/storage/storage.service';

// Todo usuário criado pela suíte usa este domínio.
export const SMOKE_EMAIL_DOMAIN = 'smoke.test';
export const SMOKE_PASSWORD = 'SenhaSmoke123!';

export interface SmokeApp {
  // Cada suíte apaga somente os usuários que criou, mesmo se outra rodar junto.
  runId: string;
  app: INestApplication<App>;
  http: () => ReturnType<typeof request>;
  prisma: PrismaService;
  ocr: { processImage: jest.Mock };
  close: () => Promise<void>;
}

export interface SmokeUser {
  id: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  auth: { Authorization: string };
}

export async function createSmokeApp({
  throttling = false,
} = {}): Promise<SmokeApp> {
  const ocr = { processImage: jest.fn() };

  // O rate limit é testado em rate-limit.e2e-spec.ts. Nas demais suítes ele
  // é desligado, pois POST /bills aceita só 2 requisições por minuto.
  const throttleSpy = throttling
    ? undefined
    : jest
        .spyOn(ThrottlerGuard.prototype, 'canActivate')
        .mockResolvedValue(true);

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(OcrService)
    .useValue(ocr)
    .compile();

  const app = moduleRef.createNestApplication<INestApplication<App>>();

  // Mesma configuração de src/main.ts e api/index.ts
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableCors();

  // Upload simulado: nada é gravado em disco nem enviado ao S3.
  const storage = app.get(StorageService);
  jest
    .spyOn(storage, 'uploadFile')
    .mockImplementation(async (_file, folder = 'bills') => {
      const key = `${folder}/smoke-${randomUUID()}.jpg`;
      return { key, url: `/uploads/${key}` };
    });
  jest.spyOn(storage, 'deleteFile').mockResolvedValue(undefined);

  // Escuta uma vez numa porta livre. Sem isso o supertest abre e fecha um
  // servidor por requisição, e sob requisições paralelas algumas caem com
  // "socket hang up".
  await app.listen(0, '127.0.0.1');

  const runId = randomUUID().slice(0, 8);
  const prisma = app.get(PrismaService);

  return {
    runId,
    app,
    http: () => request(app.getHttpServer()),
    prisma,
    ocr,
    close: async () => {
      // Contas, itens, participantes, divisões, taxas e jobs saem em cascata.
      await prisma.user.deleteMany({
        where: { email: { endsWith: `.${runId}@${SMOKE_EMAIL_DOMAIN}` } },
      });
      await app.close();
      throttleSpy?.mockRestore();
    },
  };
}

export async function registerUser(
  smoke: SmokeApp,
  label: string,
): Promise<SmokeUser> {
  const email = `${label}-${randomUUID().slice(0, 8)}.${smoke.runId}@${SMOKE_EMAIL_DOMAIN}`;

  const response = await smoke
    .http()
    .post('/auth/register')
    .send({ email, name: `Usuario ${label}`, password: SMOKE_PASSWORD })
    .expect(201);

  return {
    id: response.body.user.id,
    email,
    accessToken: response.body.accessToken,
    refreshToken: response.body.refreshToken,
    auth: { Authorization: `Bearer ${response.body.accessToken}` },
  };
}

export async function waitUntil<T>(
  description: string,
  check: () => Promise<T | undefined | null | false>,
  timeoutMs = 10000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const result = await check();
    if (result) {
      return result;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Tempo esgotado (${timeoutMs} ms) esperando: ${description}`);
}

// Consulta a conta como o app faz durante o polling do OCR.
export async function waitForBillStatus(
  smoke: SmokeApp,
  user: SmokeUser,
  billId: string,
  status: string,
) {
  let lastStatus: string | undefined;

  try {
    return await waitUntil(`conta ${billId} com status ${status}`, async () => {
      const response = await smoke
        .http()
        .get(`/bills/${billId}`)
        .set(user.auth)
        .expect(200);
      lastStatus = response.body.status;
      return response.body.status === status ? response.body : undefined;
    });
  } catch (error) {
    throw new Error(
      `${(error as Error).message}; último status: ${lastStatus}`,
    );
  }
}

export function fakeOcrResult(overrides: Partial<OcrResult> = {}): OcrResult {
  return {
    rawText:
      'RESTAURANTE FICTICIO LTDA\nX-BURGUER 1 32,00\nSUCO 2 9,00\nTOTAL 50,00',
    items: [
      {
        name: 'X-Burguer',
        quantity: 1,
        measurementUnit: 'UNIT',
        unitPrice: 32,
        totalPrice: 32,
      },
      {
        name: 'Suco',
        quantity: 2,
        measurementUnit: 'UNIT',
        unitPrice: 9,
        totalPrice: 18,
      },
    ],
    totalAmount: 50,
    establishmentName: 'Restaurante Ficticio',
    ...overrides,
  };
}

// Conteúdo irrelevante: o OCR é simulado, só o tipo do arquivo é validado.
export const FAKE_RECEIPT_IMAGE = Buffer.from('imagem-ficticia-de-nota');
