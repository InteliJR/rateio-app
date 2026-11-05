/**
 * Utilitário de sanitização de logs (Redactor)
 * Remove PII, tokens, senhas, chaves e dados sensíveis conforme o EPIC-00 e política de privacidade.
 */

const SENSITIVE_KEYS = new Set([
  'password',
  'currentpassword',
  'newpassword',
  'token',
  'accesstoken',
  'refreshtoken',
  'purchasetoken',
  'authorization',
  'code',
  'codehash',
  'secret',
  'cronsecret',
  'internalsecret',
  'jwt_secret',
  'jwt_refresh_secret',
  'email',
  'useremail',
  'cpf',
  'phone',
  'telefone',
  'name',
  'username',
  'imageurl',
  'avatarurl',
  'rawtext',
  'ocrrawtext',
  'content',
  'buffer',
  'base64',
]);

const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const JWT_REGEX = /\beyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/g;
const SIGNED_URL_REGEX = /https?:\/\/[^\s"']*(?:X-Amz-Signature|X-Amz-Credential|sig=|Signature=)[^\s"']*/gi;
const BEARER_REGEX = /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi;

/**
 * Sanitiza valores de strings individuais contra padrões de PII e segredos
 */
export function sanitizeString(value: string): string {
  if (!value || typeof value !== 'string') {
    return value;
  }

  return value
    .replace(SIGNED_URL_REGEX, '[SIGNED_URL_REDACTED]')
    .replace(BEARER_REGEX, 'Bearer [REDACTED]')
    .replace(JWT_REGEX, '[JWT_REDACTED]')
    .replace(EMAIL_REGEX, '[EMAIL_REDACTED]');
}

/**
 * Sanitiza recursivamente objetos, arrays e strings
 */
export function redact<T>(data: T, seen = new WeakSet()): T {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'string') {
    return sanitizeString(data) as unknown as T;
  }

  if (typeof data !== 'object') {
    return data;
  }

  // Prevenção de loop infinito em referências circulares
  if (seen.has(data as object)) {
    return '[CIRCULAR]' as unknown as T;
  }
  seen.add(data as object);

  if (Array.isArray(data)) {
    return data.map((item) => redact(item, seen)) as unknown as T;
  }

  // Se for Buffer ou similar
  if (Buffer.isBuffer(data)) {
    return `[BUFFER size=${data.length}]` as unknown as T;
  }

  const result: Record<string, any> = {};

  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();

    if (SENSITIVE_KEYS.has(lowerKey)) {
      result[key] = '[REDACTED]';
    } else if (lowerKey === 'stack' && process.env.NODE_ENV === 'production') {
      result[key] = '[STACK_REDACTED]';
    } else {
      result[key] = redact(value, seen);
    }
  }

  return result as T;
}
