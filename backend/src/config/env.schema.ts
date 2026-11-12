import { hkdfSync } from 'crypto';
import { z } from 'zod';

/**
 * Validação das variáveis de ambiente no boot (tarefa 3.1 / requisitos 2.1, 2.2, 3.22).
 *
 * Regras:
 * - Bloqueiam o boot APENAS `JWT_SECRET` e `JWT_REFRESH_SECRET` ausentes, com menos de
 *   32 caracteres ou iguais entre si (2.1).
 * - Todas as demais variáveis ausentes, vazias ou inválidas geram somente avisos (2.2, 3.22).
 *   Flags e numéricos inválidos voltam para o default documentado em `design.md`.
 * - Mensagens de erro e avisos contêm só NOMES de variáveis, nunca valores.
 * - Nenhum valor efetivo muda: `PASSWORD_PEPPER` continua sendo lido como hoje
 *   (`process.env.PASSWORD_PEPPER || ''`), sem transição ou rehash.
 */

export const JWT_SECRET_MIN_LENGTH = 32;

export type RawEnv = Record<string, string | undefined>;

/** Config devolvida ao `ConfigModule`: o env original com flags/numéricos inválidos normalizados. */
export type EnvConfig = Record<string, string | undefined> & {
  JWT_SECRET: string;
  JWT_REFRESH_SECRET: string;
};

export interface ParsedEnv {
  config: EnvConfig;
  warnings: string[];
}

export class EnvValidationError extends Error {
  constructor(
    public readonly invalidVariables: string[],
    details: string[],
  ) {
    super(`Invalid env: ${details.join(', ')}`);
    this.name = 'EnvValidationError';
  }
}

// ---------------------------------------------------------------------------
// Bloqueantes (zod)
// ---------------------------------------------------------------------------

const jwtSecret = z
  .string({ required_error: 'missing' })
  .min(1, 'missing')
  .min(JWT_SECRET_MIN_LENGTH, `min length ${JWT_SECRET_MIN_LENGTH}`);

const blockingSchema = z
  .object({
    JWT_SECRET: jwtSecret,
    JWT_REFRESH_SECRET: jwtSecret,
  })
  .superRefine((env, ctx) => {
    if (env.JWT_SECRET === env.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_REFRESH_SECRET'],
        message: 'must differ from JWT_SECRET',
      });
    }
  });

// ---------------------------------------------------------------------------
// Avisos: flags de compatibilidade e numéricos (defaults = comportamento atual)
// ---------------------------------------------------------------------------

export const BOOLEAN_FLAGS: Record<string, 'true' | 'false'> = {
  REQUIRE_CURRENT_PASSWORD: 'false',
  REFRESH_ROTATION_ENABLED: 'false',
  HEALTH_STRICT_STATUS: 'false',
  REQUIRE_UPLOAD_SIZE: 'false',
  UPLOAD_SIGNATURE_ENFORCE: 'false',
  REQUIRE_EMAIL_VERIFICATION: 'false',
};

export const ENUM_FLAGS: Record<string, { values: string[]; default: string }> =
  {
    RATE_LIMIT_STORE: {
      values: ['memory', 'postgres', 'redis'],
      default: 'memory',
    },
  };

export const NUMERIC_SETTINGS: Record<
  string,
  { default: number; min: number; max?: number }
> = {
  REFRESH_ROTATION_GRACE_SECONDS: { default: 60, min: 30, max: 60 },
  REFRESH_TTL_DAYS: { default: 30, min: 1 },
  RESET_CODE_TTL_MINUTES: { default: 15, min: 1 },
  RESET_MAX_ATTEMPTS: { default: 5, min: 1 },
  OCR_IMAGE_URL_TTL_SECONDS: { default: 120, min: 1 },
  READ_URL_TTL_SECONDS: { default: 3600, min: 1 },
  OCR_RAW_TEXT_RETENTION_DAYS: { default: 0, min: 0 },
  BILL_IMAGE_RETENTION_DAYS: { default: 0, min: 0 },
};

function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim() === '';
}

function warning(name: string, reason: string): string {
  return `env_warning: ${name} ${reason}`;
}

function collectWarnings(raw: RawEnv, config: EnvConfig): string[] {
  const warnings: string[] = [];

  if (isBlank(raw.DATABASE_URL)) {
    warnings.push(
      warning('DATABASE_URL', 'ausente: o Prisma falhará ao conectar'),
    );
  }

  if (isBlank(raw.PASSWORD_PEPPER)) {
    warnings.push(
      warning(
        'PASSWORD_PEPPER',
        'ausente: hashes usam pepper vazio (comportamento atual mantido; não configure sem plano de migração)',
      ),
    );
  }

  if (isBlank(raw.RESET_CODE_SECRET)) {
    warnings.push(
      warning(
        'RESET_CODE_SECRET',
        'ausente: será derivado de JWT_SECRET via HKDF',
      ),
    );
  }

  if (isBlank(raw.METRICS_TOKEN)) {
    warnings.push(
      warning('METRICS_TOKEN', 'ausente: /metrics desabilitado (404)'),
    );
  }

  for (const name of ['SMTP_USER', 'SMTP_PASS']) {
    if (isBlank(raw[name])) {
      warnings.push(
        warning(name, 'ausente: envio de e-mail de recuperação falhará'),
      );
    }
  }

  if (
    isBlank(raw.GOOGLE_OAUTH_CLIENT_IDS) &&
    isBlank(raw.GOOGLE_OAUTH_CLIENT_ID)
  ) {
    warnings.push(
      warning(
        'GOOGLE_OAUTH_CLIENT_IDS',
        'ausente: login com Google será rejeitado',
      ),
    );
  }

  if (!isBlank(raw.AWS_S3_BUCKET)) {
    for (const name of ['AWS_S3_ACCESS_KEY', 'AWS_S3_SECRET_KEY']) {
      if (isBlank(raw[name])) {
        warnings.push(
          warning(name, 'ausente com AWS_S3_BUCKET definido: uploads falharão'),
        );
      }
    }
  } else {
    warnings.push(
      warning(
        'AWS_S3_BUCKET',
        'ausente: storage local (não suportado em serverless)',
      ),
    );
  }

  if (!isBlank(raw.AWS_S3_PUBLIC_BASE_URL)) {
    warnings.push(
      warning(
        'AWS_S3_PUBLIC_BASE_URL',
        'definida: imagens ficam acessíveis por URL pública permanente',
      ),
    );
  }

  if (isBlank(raw.CORS_ALLOWED_ORIGINS)) {
    warnings.push(
      warning(
        'CORS_ALLOWED_ORIGINS',
        'ausente: CORS aberto para todas as origens (comportamento atual)',
      ),
    );
  }

  if (isBlank(raw.INTERNAL_CRON_SECRET) && isBlank(raw.CRON_SECRET)) {
    warnings.push(
      warning(
        'INTERNAL_CRON_SECRET',
        'ausente: rotas /internal/ocr/* respondem 403',
      ),
    );
  }

  if (isBlank(raw.OPENAI_API_KEY)) {
    warnings.push(
      warning('OPENAI_API_KEY', 'ausente: processamento de OCR falhará'),
    );
  }

  for (const [name, def] of Object.entries(BOOLEAN_FLAGS)) {
    const value = raw[name];
    if (value !== undefined && value !== 'true' && value !== 'false') {
      warnings.push(warning(name, `inválida: usando default ${def}`));
      config[name] = def;
    }
  }

  for (const [name, spec] of Object.entries(ENUM_FLAGS)) {
    const value = raw[name];
    if (value !== undefined && !spec.values.includes(value)) {
      warnings.push(warning(name, `inválida: usando default ${spec.default}`));
      config[name] = spec.default;
    }
  }

  for (const [name, spec] of Object.entries(NUMERIC_SETTINGS)) {
    const value = raw[name];
    if (value === undefined) continue;
    const parsed = Number(value);
    const valid =
      value.trim() !== '' &&
      Number.isInteger(parsed) &&
      parsed >= spec.min &&
      (spec.max === undefined || parsed <= spec.max);
    if (!valid) {
      warnings.push(warning(name, `inválida: usando default ${spec.default}`));
      config[name] = String(spec.default);
    }
  }

  return warnings;
}

/**
 * Valida o ambiente. Lança `EnvValidationError` somente para segredos JWT inválidos;
 * qualquer outro problema vira aviso.
 */
export function parseEnv(raw: RawEnv): ParsedEnv {
  const result = blockingSchema.safeParse({
    JWT_SECRET: raw.JWT_SECRET,
    JWT_REFRESH_SECRET: raw.JWT_REFRESH_SECRET,
  });

  if (!result.success) {
    const names: string[] = [];
    const details: string[] = [];
    for (const issue of result.error.issues) {
      const name = issue.path.join('.') || 'env';
      const detail = `${name} (${issue.message})`;
      if (!details.includes(detail)) details.push(detail);
      if (!names.includes(name)) names.push(name);
    }
    throw new EnvValidationError(names, details);
  }

  const config = { ...raw } as EnvConfig;
  const warnings = collectWarnings(raw, config);
  return { config, warnings };
}

/**
 * Deriva um segredo de 32 bytes (hex) a partir de um segredo mestre via HKDF-SHA256.
 * Usado como fallback seguro para segredos novos (ex.: RESET_CODE_SECRET, LOCAL_FILES_SECRET).
 */
export function deriveSecret(masterSecret: string, info: string): string {
  return Buffer.from(
    hkdfSync('sha256', masterSecret, 'rateio-api', info, 32),
  ).toString('hex');
}

/** Segredo efetivo: o configurado, ou derivado de JWT_SECRET quando ausente. */
export function resolveDerivedSecret(env: RawEnv, name: string): string {
  const configured = env[name];
  if (!isBlank(configured)) return configured as string;
  if (isBlank(env.JWT_SECRET)) {
    throw new EnvValidationError(['JWT_SECRET'], ['JWT_SECRET (missing)']);
  }
  return deriveSecret(env.JWT_SECRET as string, name);
}
