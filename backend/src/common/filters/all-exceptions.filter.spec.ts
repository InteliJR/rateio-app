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
    const exception = new HttpException('Acesso proibido', HttpStatus.FORBIDDEN);

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

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.PAYLOAD_TOO_LARGE);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
        error: 'PayloadTooLarge',
      }),
    );
  });

  it('deve ocultar erro desconhecido em 500 sem expor stack trace', () => {
    const unknownError = new Error('Database connection failed violently password=123');

    filter.catch(unknownError, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: 'InternalServerError',
      }),
    );
  });
});

