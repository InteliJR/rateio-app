/**
 * Sobe a API real (AppModule) em processo, trocando só dependências externas:
 * banco (FakePrisma), e-mail, verificação do Google, OCR (OpenAI) e o envio ao S3.
 * Guards, pipes, rate limit, filtros e controllers são os de verdade.
 *
 * Funciona tanto no código atual quanto na versão de produção (origin/main), que não
 * tem `configureApp`: nesse caso aplica a mesma configuração do main.ts de produção.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SchedulerRegistry } from '@nestjs/schedule';
import helmet from 'helmet';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { MailService } from '../../src/mail/mail.service';
import { GoogleTokenService } from '../../src/auth/google-token.service';
import { OcrService } from '../../src/ocr/ocr.service';
import { StorageService } from '../../src/storage/storage.service';
import { FakePrisma } from './fake-prisma';

export interface SentMail {
  email: string;
  code: string;
}

export interface S3Command {
  name: string;
  input: Record<string, any>;
}

export interface TestApp {
  app: INestApplication;
  prisma: FakePrisma;
  mails: SentMail[];
  mail: { sendPasswordResetEmail: jest.Mock };
  google: { verifyIdToken: jest.Mock };
  ocr: { processImage: jest.Mock };
  s3Commands: S3Command[];
  storage: StorageService;
  /** Requisição com IP próprio (bucket de rate limit isolado), salvo se `ip` for passado. */
  http: (
    method: 'get' | 'post' | 'patch' | 'put' | 'delete' | 'options',
    url: string,
    ip?: string,
  ) => request.Test;
  close: () => Promise<void>;
}

let ipCounter = 0;
let liveApps = 0;
export const nextIp = () => {
  ipCounter += 1;
  return `10.${(ipCounter >> 16) & 255}.${(ipCounter >> 8) & 255}.${ipCounter & 255}`;
};

function moduleExists(path: string): boolean {
  try {
    require.resolve(path);
    return true;
  } catch {
    return false;
  }
}

export const IS_PRODUCTION_BASELINE = !moduleExists(
  '../../src/common/setup/app-setup',
);

function applyAppSetup(app: INestApplication) {
  if (!IS_PRODUCTION_BASELINE) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { configureApp } = require('../../src/common/setup/app-setup');
    configureApp(app);
    return;
  }
  // Mesma configuração do backend/src/main.ts de origin/main (produção)
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableCors();
}

export async function createTestApp(
  options: {
    configure?: (prisma: FakePrisma) => void;
    /** Variáveis aplicadas antes de subir a app e restauradas no close(). */
    env?: Record<string, string | undefined>;
  } = {},
): Promise<TestApp> {
  // O passport registra a estratégia JWT globalmente no processo: uma segunda instância
  // viva substituiria a da primeira, e as requisições da primeira passariam a ser
  // validadas contra o banco da segunda (401 "Erro ao validar token").
  if (liveApps > 0) {
    throw new Error(
      'Já existe uma instância da API viva neste arquivo de teste. Use uma instância por ' +
        'arquivo (feche a anterior antes) ou mova o caso para outro arquivo.',
    );
  }
  const savedEnv: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(options.env ?? {})) {
    savedEnv[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const restoreEnv = () => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };

  const prisma = new FakePrisma();
  options.configure?.(prisma);

  const mails: SentMail[] = [];
  const mail = {
    sendPasswordResetEmail: jest.fn(async (email: string, code: string) => {
      mails.push({ email, code });
    }),
  };
  const google = { verifyIdToken: jest.fn() };
  const ocr = {
    processImage: jest.fn(async () => {
      throw new Error('OCR desativado nos testes');
    }),
  };

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .overrideProvider(MailService)
    .useValue(mail)
    .overrideProvider(GoogleTokenService)
    .useValue(google)
    .overrideProvider(OcrService)
    .useValue(ocr)
    .compile()
    .catch((error) => {
      restoreEnv();
      throw error;
    });

  const app = moduleRef.createNestApplication({ logger: false });
  liveApps += 1;
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  applyAppSetup(app);
  await app.init();

  // Cron da fila de OCR (a cada 10 s) parado: os testes controlam o estado das contas
  try {
    const registry = app.get(SchedulerRegistry);
    registry.getCronJobs().forEach((job) => job.stop());
  } catch {
    // sem cron registrado
  }

  // Nada sai para a rede: comandos ao S3 são registrados e respondem sucesso.
  // URLs pré-assinadas são calculadas localmente pelo SDK (sem rede).
  const storage = app.get(StorageService);
  const s3Commands: S3Command[] = [];
  const s3Client = (storage as any).s3Client;
  if (s3Client) {
    s3Client.send = jest.fn(async (command: any) => {
      s3Commands.push({
        name: command?.constructor?.name,
        input: command?.input ?? {},
      });
      return {};
    });
  }

  const server = app.getHttpServer();
  return {
    app,
    prisma,
    mails,
    mail,
    google,
    ocr,
    s3Commands,
    storage,
    http: (method, url, ip = nextIp()) =>
      (request(server) as any)[method](url).set('X-Forwarded-For', ip),
    close: async () => {
      try {
        await app.close();
      } finally {
        liveApps -= 1;
        restoreEnv();
      }
    },
  };
}
