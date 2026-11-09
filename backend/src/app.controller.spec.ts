import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MetricsService } from './observability/metrics.service';
import { OcrQueueService } from './ocr/ocr-queue.service';
import { PrismaService } from './prisma/prisma.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        { provide: PrismaService, useValue: { $queryRaw: jest.fn().mockResolvedValue([1]) } },
        { provide: MetricsService, useValue: { getSnapshot: jest.fn() } },
        {
          provide: OcrQueueService,
          useValue: {
            getQueueSnapshot: jest.fn().mockResolvedValue({
              waiting: 0,
              active: 0,
              completed: 0,
              failed: 0,
            }),
          },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  describe('healthCheck', () => {
    it('deve retornar status ok sem expor snapshot de métricas ou erros de driver', async () => {
      const response = await appController.healthCheck();

      expect(response.status).toBe('ok');
      expect(response.timestamp).toBeDefined();
      expect(response.database).toBeDefined();
      expect(response.ocrQueue).toBeDefined();
      // Não deve vazar o snapshot de métricas
      expect((response as any).metrics).toBeUndefined();
      // Não deve vazar mensagem crua de erro do banco
      expect((response.database as any).error).toBeUndefined();
    });
  });
});
