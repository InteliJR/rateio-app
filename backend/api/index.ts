import 'reflect-metadata';
import express from 'express';
import helmet from 'helmet';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from '../src/app.module';

let cachedServer: ReturnType<typeof express> | null = null;

async function createServer() {
  const server = express();
  const adapter = new ExpressAdapter(server);

  const app = await NestFactory.create(AppModule, adapter, {
    bufferLogs: true,
  });

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors();
  await app.init();

  return server;
}

export default async function handler(req: any, res: any) {
  if (!cachedServer) {
    cachedServer = await createServer();
  }

  return cachedServer(req, res);
}
