import { CorrelationIdMiddleware, REQUEST_ID_HEADER } from './correlation-id.middleware';

describe('CorrelationIdMiddleware', () => {
  let middleware: CorrelationIdMiddleware;

  beforeEach(() => {
    middleware = new CorrelationIdMiddleware();
  });

  it('deve usar o X-Request-Id enviado pelo cliente se presente', () => {
    const req: any = { headers: { 'x-request-id': 'custom-req-id-123' } };
    const res: any = { setHeader: jest.fn() };
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(req.requestId).toBe('custom-req-id-123');
    expect(req.id).toBe('custom-req-id-123');
    expect(res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, 'custom-req-id-123');
    expect(next).toHaveBeenCalled();
  });

  it('deve gerar um UUID se X-Request-Id não for enviado', () => {
    const req: any = { headers: {} };
    const res: any = { setHeader: jest.fn() };
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(req.requestId).toBeDefined();
    expect(typeof req.requestId).toBe('string');
    expect(req.requestId.length).toBeGreaterThan(10);
    expect(res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, req.requestId);
    expect(next).toHaveBeenCalled();
  });
});

