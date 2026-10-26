import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { join } from 'path';
import { NestExpressApplication } from '@nestjs/platform-express';
import { StorageService } from './storage/storage.service';
import { configureApp } from './common/setup/app-setup';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.set('trust proxy', 1);

  configureApp(app);

  const storageService = app.get(StorageService);
  if (storageService.shouldServeLocalUploads()) {
    app.useStaticAssets(join(__dirname, '..', '..', 'uploads'), {
      prefix: '/uploads/',
    });
  }

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
