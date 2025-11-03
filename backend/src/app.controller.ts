import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import { AppService } from './app.service';
import type { Response } from 'express';
import * as path from 'path';
import { PrismaService } from './prisma/prisma.service';
import * as packageJson from '../package.json';
import { NotFoundException } from '@nestjs/common';
import * as fs from 'fs';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prisma: PrismaService, // 3. Injetar o PrismaService
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  // 4. Substituir o método healthCheck
  @Get('health')
  @HttpCode(HttpStatus.OK)
  async healthCheck() {
    // 5. Tornar o método 'async'
    const dbStatus = await this.checkDbConnection();

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(), // 6. Adicionar uptime (em segundos)
      database: dbStatus,
      version: packageJson.version, // 7. Adicionar versão
    };
  }

  @Get('docs')
  serveDocs(@Res() res: Response) {
    const filePath = path.join(
      process.cwd(),
      'dist',
      'assets',
      'api_documentation.html',
    );

    // Verificar se o arquivo existe
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('Documentation file not found');
    }

    return res.sendFile(filePath);
  }

  // 8. Adicionar um método privado para checar o BD
  private async checkDbConnection() {
    const startTime = process.hrtime.bigint(); // Inicia o timer
    try {
      // Roda a query mais leve possível no banco
      await this.prisma.$queryRaw`SELECT 1`;
      const endTime = process.hrtime.bigint();
      // Converte o tempo de nanosegundos para milissegundos
      const responseTime = Number(endTime - startTime) / 1_000_000;

      return {
        status: 'connected',
        responseTime: Math.round(responseTime), // Arredonda para ms inteiros
      };
    } catch (error) {
      // Começamos com uma mensagem genérica
      let errorMessage = 'Failed to connect to database.';

      // Verificamos se 'error' é uma instância de 'Error'
      if (error instanceof Error) {
        errorMessage = error.message; // Se for, usamos a mensagem real
      }

      return {
        status: 'disconnected',
        responseTime: -1,
        error: errorMessage, // Usamos a mensagem segura
      };
    }
  }
}
