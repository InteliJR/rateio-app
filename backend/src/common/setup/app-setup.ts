import { INestApplication, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';

export function configureApp(app: INestApplication): void {
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

  const allowedOriginsEnv = process.env.CORS_ALLOWED_ORIGINS;

  if (allowedOriginsEnv && allowedOriginsEnv.trim().length > 0) {
    const allowedList = allowedOriginsEnv
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0);

    const allowedSet = new Set(allowedList);

    app.enableCors({
      origin: (requestOrigin, callback) => {
        // Requisições sem cabeçalho Origin (apps mobile nativos, curl, healthcheck) são permitidas
        if (!requestOrigin) {
          return callback(null, true);
        }

        if (allowedSet.has(requestOrigin)) {
          return callback(null, true);
        }

        return callback(new Error(`Origin ${requestOrigin} not allowed by CORS`), false);
      },
      credentials: true,
    });
  } else {
    // Comportamento tolerante de retrocompatibilidade: CORS aberto com aviso
    console.warn(
      '[Security Warning] CORS_ALLOWED_ORIGINS is not defined. CORS is currently open to all origins.',
    );
    app.enableCors();
  }
}
