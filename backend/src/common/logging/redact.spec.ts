import { redact, sanitizeString } from './redact';

describe('redact utility', () => {
  it('deve redigir chaves sensíveis como password, email, token e purchaseToken', () => {
    const payload = {
      id: '123',
      email: 'user@example.com',
      password: 'SecretPassword123!',
      token: 'jwt-token-value',
      purchaseToken: 'gpay-token-xyz',
      cronSecret: 'super-cron-secret',
      metadata: {
        currentPassword: 'old-password',
        rawText: 'Cupom fiscal R$ 50,00',
        nested: {
          cpf: '123.456.789-00',
          keepMe: 'safe-value',
        },
      },
    };

    const redacted = redact(payload);

    expect(redacted.id).toBe('123');
    expect(redacted.email).toBe('[REDACTED]');
    expect(redacted.password).toBe('[REDACTED]');
    expect(redacted.token).toBe('[REDACTED]');
    expect(redacted.purchaseToken).toBe('[REDACTED]');
    expect(redacted.cronSecret).toBe('[REDACTED]');
    expect(redacted.metadata.currentPassword).toBe('[REDACTED]');
    expect(redacted.metadata.rawText).toBe('[REDACTED]');
    expect(redacted.metadata.nested.cpf).toBe('[REDACTED]');
    expect(redacted.metadata.nested.keepMe).toBe('safe-value');
  });

  it('deve mascarar emails e JWTs embutidos em strings arbitrárias', () => {
    const rawLog =
      'Falha ao autenticar admin@empresa.com com token Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMifQ.abc123def456';
    const sanitized = sanitizeString(rawLog);

    expect(sanitized).not.toContain('admin@empresa.com');
    expect(sanitized).toContain('[EMAIL_REDACTED]');
    expect(sanitized).toContain('Bearer [REDACTED]');
  });

  it('deve mascarar URLs assinadas do S3', () => {
    const url = 'https://bucket.s3.amazonaws.com/bills/receipt.jpg?X-Amz-Signature=abcdef123456&X-Amz-Credential=test';
    const sanitized = sanitizeString(url);

    expect(sanitized).toBe('[SIGNED_URL_REDACTED]');
  });

  it('deve lidar com estruturas circulares sem estourar a pilha', () => {
    const obj: any = { name: 'test' };
    obj.self = obj;

    expect(() => redact(obj)).not.toThrow();
    const result = redact(obj);
    expect(result.self).toBe('[CIRCULAR]');
  });
});

