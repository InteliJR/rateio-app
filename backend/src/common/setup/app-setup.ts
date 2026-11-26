import { INestApplication, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { CorrelationIdMiddleware } from '../middleware/correlation-id.middleware';
import { AllExceptionsFilter } from '../filters/all-exceptions.filter';

export function configureApp(app: INestApplication): void {
  const correlationMiddleware = new CorrelationIdMiddleware();
  app.use((req: any, res: any, next: any) =>
    correlationMiddleware.use(req, res, next),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

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

        return callback(null, false);
      },
      credentials: true,
    });
  } else {
    // Comportamento tolerante de retrocompatibilidade: CORS aberto.
    // O aviso de startup é emitido de forma centralizada por parseEnv (env_warning: CORS_ALLOWED_ORIGINS)
    app.enableCors();
  }
}
