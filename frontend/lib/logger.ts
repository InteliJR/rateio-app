const isDev =
  typeof __DEV__ !== "undefined"
    ? __DEV__
    : process.env.NODE_ENV !== "production";

type LogArgs = unknown[];

const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'authorization',
  'accesstoken',
  'refreshtoken',
  'purchasetoken',
  'code',
  'email',
  'cpf',
]);

const BEARER_REGEX = /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi;
const SIGNED_URL_REGEX = /https?:\/\/[^\s"']*(?:X-Amz-Signature|X-Amz-Credential|sig=|Signature=)[^\s"']*/gi;

function sanitizeValue(val: unknown, seen = new WeakSet()): unknown {
  if (val === null || val === undefined) return val;
  if (typeof val === 'string') {
    return val
      .replace(SIGNED_URL_REGEX, '[SIGNED_URL_REDACTED]')
      .replace(BEARER_REGEX, 'Bearer [REDACTED]');
  }
  if (typeof val !== 'object') return val;
  if (seen.has(val as object)) return '[CIRCULAR]';
  seen.add(val as object);

  if (Array.isArray(val)) {
    return val.map((item) => sanitizeValue(item, seen));
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(val)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = sanitizeValue(value, seen);
    }
  }
  return result;
}

function sanitizeArgs(args: LogArgs): LogArgs {
  return args.map((arg) => sanitizeValue(arg));
}

export const logger = {
  debug: (...args: LogArgs) => {
    if (isDev) {
      console.log(...sanitizeArgs(args));
    }
  },
  info: (...args: LogArgs) => {
    if (isDev) {
      console.info(...sanitizeArgs(args));
    }
  },
  warn: (...args: LogArgs) => {
    if (isDev) {
      console.warn(...sanitizeArgs(args));
    }
  },
  error: (...args: LogArgs) => {
    if (isDev) {
      console.error(...sanitizeArgs(args));
    }
  },
};
