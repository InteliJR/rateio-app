import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';

describe('AppController', () => {
  let appController: AppController;
  let prismaService: { $queryRaw: jest.Mock };

  beforeEach(async () => {
    prismaService = { $queryRaw: jest.fn().mockResolvedValue([1]) };

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        { provide: PrismaService, useValue: prismaService },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
    delete process.env.HEALTH_STRICT_STATUS;
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  describe('healthCheck', () => {
    it('deve retornar status ok e database.status connected sem expor topologia interna', async () => {
      const mockRes: any = { status: jest.fn() };
      const response = await appController.healthCheck(mockRes);

      expect(response.status).toBe('ok');
      expect(response.timestamp).toBeDefined();
      expect(response.database).toEqual({ status: 'connected' });
      // Não deve vazar métricas ou detalhes de fila
      expect((response as any).ocrQueue).toBeUndefined();
      expect((response as any).metrics).toBeUndefined();
      expect((response as any).uptime).toBeUndefined();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('quando o banco está fora e HEALTH_STRICT_STATUS=true deve retornar 503 e status error', async () => {
      process.env.HEALTH_STRICT_STATUS = 'true';
      prismaService.$queryRaw.mockRejectedValue(new Error('Connection refused'));

      const mockRes: any = { status: jest.fn() };
      const response = await appController.healthCheck(mockRes);

      expect(response.status).toBe('error');
      expect(response.database).toEqual({ status: 'disconnected' });
      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    });

    it('quando o banco está fora e HEALTH_STRICT_STATUS=false deve manter HTTP 200 para retrocompatibilidade', async () => {
      process.env.HEALTH_STRICT_STATUS = 'false';
      prismaService.$queryRaw.mockRejectedValue(new Error('Connection refused'));

      const mockRes: any = { status: jest.fn() };
      const response = await appController.healthCheck(mockRes);

      expect(response.status).toBe('ok');
      expect(response.database).toEqual({ status: 'disconnected' });
      expect(mockRes.status).not.toHaveBeenCalled();
    });
  });
});
