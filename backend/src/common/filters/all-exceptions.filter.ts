import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { redact } from '../logging/redact';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const requestId =
      (request as any)?.requestId ||
      (request as any)?.id ||
      request.headers?.['x-request-id'] ||
      'unknown';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | object = 'Erro interno do servidor';
    let errorType = 'InternalServerError';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'object' && res !== null) {
        message = (res as any).message || res;
        errorType = (res as any).error || exception.name;
      } else {
        message = res;
        errorType = exception.name;
      }
    } else {
      const err = exception as any;

      // Tratamento de códigos de erro do Prisma
      if (err?.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        message = 'Conflito de dados: registro já cadastrado';
        errorType = 'Conflict';
      } else if (err?.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        message = 'Recurso não encontrado';
        errorType = 'NotFound';
      } else if (err?.code === 'P2003') {
        status = HttpStatus.BAD_REQUEST;
        message = 'Referência de dados inválida';
        errorType = 'BadRequest';
      } else if (err?.name === 'MulterError' && err?.code === 'LIMIT_FILE_SIZE') {
        status = HttpStatus.PAYLOAD_TOO_LARGE;
        message = 'Arquivo excede o tamanho limite permitido';
        errorType = 'PayloadTooLarge';
      } else {
        // Erro não mapeado: em desenvolvimento pode manter mensagem para debug, mas em produção esconde
        if (process.env.NODE_ENV !== 'production' && err?.message) {
          message = err.message;
        }
      }
    }

    const logPayload = {
      requestId,
      method: request.method,
      url: request.url,
      statusCode: status,
      errorType,
      errorName: (exception as any)?.name || 'UnknownError',
      prismaCode: (exception as any)?.code,
      details: status >= 500 ? (exception as any)?.message : undefined,
    };

    if (status >= 500) {
      this.logger.error(JSON.stringify(redact(logPayload)));
    } else {
      this.logger.warn(JSON.stringify(redact(logPayload)));
    }

    response.status(status).json({
      statusCode: status,
      message,
      error: errorType,
      requestId,
    });
  }
}

