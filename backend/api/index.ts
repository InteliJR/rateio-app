import 'reflect-metadata';
import express from 'express';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/common/setup/app-setup';

let cachedServer: ReturnType<typeof express> | null = null;

async function createServer() {
  const server = express();
  server.set('trust proxy', 1);
  const adapter = new ExpressAdapter(server);

  const app = await NestFactory.create(AppModule, adapter, {
    bufferLogs: true,
  });

  configureApp(app);
  await app.init();

  return server;
}

export default async function handler(req: any, res: any) {
  if (!cachedServer) {
    cachedServer = await createServer();
  }

  return cachedServer(req, res);
}
