import { HttpException, HttpStatus } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let mockResponse: any;
  let mockRequest: any;
  let mockHost: any;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockRequest = {
      method: 'GET',
      url: '/test',
      requestId: 'req-abc-123',
      headers: {},
    };
    mockHost = {
      switchToHttp: jest.fn().mockReturnValue({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    };
  });

  it('deve repassar status e resposta de uma HttpException', () => {
    const exception = new HttpException(
      'Acesso proibido',
      HttpStatus.FORBIDDEN,
    );

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.FORBIDDEN,
        message: 'Acesso proibido',
        requestId: 'req-abc-123',
      }),
    );
  });

  it('deve converter erro P2002 do Prisma em 409 Conflict', () => {
    const prismaError = {
      code: 'P2002',
      name: 'PrismaClientKnownRequestError',
      message: 'Unique constraint failed on the fields: (`email`)',
    };

    filter.catch(prismaError, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
      }),
    );
  });

  it('deve converter MulterError LIMIT_FILE_SIZE em 413 Payload Too Large', () => {
    const multerError = {
      name: 'MulterError',
      code: 'LIMIT_FILE_SIZE',
      message: 'File too large',
    };

    filter.catch(multerError, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(
      HttpStatus.PAYLOAD_TOO_LARGE,
    );
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
        error: 'PayloadTooLarge',
      }),
    );
  });

  it('deve ocultar erro desconhecido em 500 sem expor stack trace', () => {
    const unknownError = new Error(
      'Database connection failed violently password=123',
    );

    filter.catch(unknownError, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Erro interno do servidor',
        error: 'InternalServerError',
      }),
    );
  });

  it('deve expor mensagem de erro apenas quando NODE_ENV === "development"', () => {
    const originalEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'development';
      const debugError = new Error('Detalhe técnico para debug');
      filter.catch(debugError, mockHost);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Detalhe técnico para debug',
        }),
      );
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
  it('não deve registrar a mensagem interna do erro nem a query string no log fora de development', () => {
    const originalEnv = process.env.NODE_ENV;
    const errorSpy = jest
      .spyOn((filter as any).logger, 'error')
      .mockImplementation(() => undefined);
    try {
      process.env.NODE_ENV = 'production';
      mockRequest.url = '/auth/reset?email=a@x.com&token=abc';
      filter.catch(
        new Error('column "password_hash" violates constraint; password=123'),
        mockHost,
      );

      const logged = errorSpy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(logged).toContain('/auth/reset');
      expect(logged).not.toContain('password_hash');
      expect(logged).not.toContain('password=123');
      expect(logged).not.toContain('a@x.com');
      expect(logged).not.toContain('token=abc');
    } finally {
      process.env.NODE_ENV = originalEnv;
      errorSpy.mockRestore();
    }
  });
});
