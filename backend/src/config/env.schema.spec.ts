import * as fc from 'fast-check';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  BOOLEAN_FLAGS,
  EnvValidationError,
  JWT_SECRET_MIN_LENGTH,
  NUMERIC_SETTINGS,
  RawEnv,
  deriveSecret,
  parseEnv,
  resolveDerivedSecret,
} from './env.schema';
import { readEnv } from './read-env';

/**
 * Property 3: Bug Condition - Validação de ambiente fail-fast (tarefa 3.5; requisitos 2.1, 2.2).
 *
 * parseEnv lança erro se e somente se JWT_SECRET ou JWT_REFRESH_SECRET estiverem ausentes,
 * com menos de 32 caracteres ou forem iguais; o erro nomeia cada variável JWT inválida e
 * não contém nenhum valor fornecido. Qualquer outra variável ausente gera só aviso.
 */

// Valores hex com 12+ caracteres não podem aparecer por acaso nas mensagens fixas
// (que só têm nomes de variáveis e palavras), então "não contém o valor" é verificável.
const HEX = '0123456789abcdef'.split('');
const hex = (minLength: number, maxLength: number) =>
  fc.string({ unit: fc.constantFrom(...HEX), minLength, maxLength });

type SecretState =
  | { kind: 'missing' }
  | { kind: 'empty' }
  | { kind: 'short'; value: string }
  | { kind: 'valid'; value: string };

const secretArb: fc.Arbitrary<SecretState> = fc.oneof(
  fc.constant<SecretState>({ kind: 'missing' }),
  fc.constant<SecretState>({ kind: 'empty' }),
  hex(12, JWT_SECRET_MIN_LENGTH - 1).map<SecretState>((value) => ({
    kind: 'short',
    value,
  })),
  hex(JWT_SECRET_MIN_LENGTH, 64).map<SecretState>((value) => ({
    kind: 'valid',
    value,
  })),
);

function toValue(state: SecretState): string | undefined {
  if (state.kind === 'missing') return undefined;
  if (state.kind === 'empty') return '';
  return state.value;
}

const OPTIONAL_VARS = [
  'DATABASE_URL',
  'PASSWORD_PEPPER',
  'RESET_CODE_SECRET',
  'METRICS_TOKEN',
  'SMTP_USER',
  'SMTP_PASS',
  'GOOGLE_OAUTH_CLIENT_IDS',
  'AWS_S3_BUCKET',
  'AWS_S3_ACCESS_KEY',
  'AWS_S3_SECRET_KEY',
  'CORS_ALLOWED_ORIGINS',
  'INTERNAL_CRON_SECRET',
  'OPENAI_API_KEY',
];

/** Mapa aleatório das variáveis opcionais: ausente, vazia ou com valor. */
const optionalEnvArb: fc.Arbitrary<RawEnv> = fc
  .tuple(
    ...OPTIONAL_VARS.map((name) =>
      fc.oneof(
        fc.constant<[string, string | undefined]>([name, undefined]),
        fc.constant<[string, string | undefined]>([name, '']),
        hex(12, 40).map<[string, string | undefined]>((v) => [name, v]),
      ),
    ),
  )
  .map((entries) => {
    const env: RawEnv = {};
    for (const [name, value] of entries) {
      if (value !== undefined) env[name] = value;
    }
    return env;
  });

const isLengthValid = (s: SecretState) => s.kind === 'valid';

/** Oráculo: quais nomes devem aparecer no erro. */
function expectedInvalid(jwt: SecretState, refresh: SecretState): string[] {
  const names: string[] = [];
  if (!isLengthValid(jwt)) names.push('JWT_SECRET');
  const refreshEqual =
    isLengthValid(jwt) &&
    isLengthValid(refresh) &&
    toValue(jwt) === toValue(refresh);
  if (!isLengthValid(refresh) || refreshEqual) names.push('JWT_REFRESH_SECRET');
  return names;
}

function providedValues(env: RawEnv): string[] {
  return Object.values(env).filter((v): v is string => !!v && v.length >= 8);
}

describe('parseEnv (Property 3: validação de ambiente fail-fast)', () => {
  it('lança se e somente se os segredos JWT forem inválidos, nomeando-os sem expor valores', () => {
    fc.assert(
      fc.property(
        secretArb,
        secretArb,
        fc.boolean(),
        optionalEnvArb,
        (jwt, refreshState, forceEqual, optional) => {
          // Força o caso "segredos iguais" com frequência
          const refresh = forceEqual ? jwt : refreshState;
          const env: RawEnv = { ...optional };
          const jwtValue = toValue(jwt);
          const refreshValue = toValue(refresh);
          if (jwtValue !== undefined) env.JWT_SECRET = jwtValue;
          if (refreshValue !== undefined) env.JWT_REFRESH_SECRET = refreshValue;

          const expected = expectedInvalid(jwt, refresh);
          let thrown: unknown;
          let warnings: string[] = [];
          try {
            warnings = parseEnv(env).warnings;
          } catch (error) {
            thrown = error;
          }

          if (expected.length === 0) {
            expect(thrown).toBeUndefined();
            // Toda variável opcional vazia/ausente gera aviso nomeado
            for (const name of [
              'PASSWORD_PEPPER',
              'RESET_CODE_SECRET',
              'METRICS_TOKEN',
            ]) {
              if (!env[name]) {
                expect(warnings.some((w) => w.includes(name))).toBe(true);
              }
            }
          } else {
            expect(thrown).toBeInstanceOf(EnvValidationError);
            const error = thrown as EnvValidationError;
            expect([...error.invalidVariables].sort()).toEqual(
              [...expected].sort(),
            );
            for (const name of expected) {
              expect(error.message).toContain(name);
            }
            for (const value of providedValues(env)) {
              expect(error.message).not.toContain(value);
            }
          }

          for (const value of providedValues(env)) {
            for (const line of warnings) {
              expect(line).not.toContain(value);
            }
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('nunca lança por variáveis não-JWT ausentes (boot continua, 3.22)', () => {
    fc.assert(
      fc.property(
        hex(32, 64),
        hex(32, 64),
        optionalEnvArb,
        (a, b, optional) => {
          fc.pre(a !== b);
          expect(() =>
            parseEnv({ ...optional, JWT_SECRET: a, JWT_REFRESH_SECRET: b }),
          ).not.toThrow();
        },
      ),
    );
  });

  it('flags e numéricos inválidos viram aviso e voltam ao default, sem expor o valor', () => {
    const flagNames = [
      ...Object.keys(BOOLEAN_FLAGS),
      ...Object.keys(NUMERIC_SETTINGS),
    ];
    fc.assert(
      fc.property(
        fc.constantFrom(...flagNames),
        hex(12, 24).filter((v) => !/^\d+$/.test(v)),
        (name, invalidValue) => {
          const { config, warnings } = parseEnv({
            JWT_SECRET: 'a'.repeat(40),
            JWT_REFRESH_SECRET: 'b'.repeat(40),
            [name]: invalidValue,
          });
          const expectedDefault =
            name in BOOLEAN_FLAGS
              ? BOOLEAN_FLAGS[name]
              : String(NUMERIC_SETTINGS[name].default);
          expect(config[name]).toBe(expectedDefault);
          const line = warnings.find((w) => w.includes(name));
          expect(line).toBeDefined();
          expect(line).not.toContain(invalidValue);
        },
      ),
    );
  });

  it('flags no default/valores válidos não geram aviso nem mudam o valor (3.23)', () => {
    const { config, warnings } = parseEnv({
      JWT_SECRET: 'a'.repeat(40),
      JWT_REFRESH_SECRET: 'b'.repeat(40),
      HEALTH_STRICT_STATUS: 'true',
      REFRESH_ROTATION_GRACE_SECONDS: '45',
      RATE_LIMIT_STORE: 'memory',
    });
    expect(config.HEALTH_STRICT_STATUS).toBe('true');
    expect(config.REFRESH_ROTATION_GRACE_SECONDS).toBe('45');
    expect(
      warnings.some((w) => /HEALTH_STRICT_STATUS|GRACE|RATE_LIMIT/.test(w)),
    ).toBe(false);
  });
});

describe('PASSWORD_PEPPER efetivo inalterado (3.11)', () => {
  it('o valor efetivo é idêntico ao do código original (process.env.PASSWORD_PEPPER || "")', () => {
    fc.assert(
      fc.property(fc.option(fc.string(), { nil: undefined }), (pepper) => {
        const env: RawEnv = {
          JWT_SECRET: 'a'.repeat(40),
          JWT_REFRESH_SECRET: 'b'.repeat(40),
        };
        if (pepper !== undefined) env.PASSWORD_PEPPER = pepper;
        const { config } = parseEnv(env);
        const fakeConfigService = { get: (k: string) => config[k] } as any;
        const original = env.PASSWORD_PEPPER || '';
        expect(readEnv(fakeConfigService, 'PASSWORD_PEPPER') || '').toBe(
          original,
        );
      }),
    );
  });
});

describe('segredos derivados (HKDF)', () => {
  it('é determinístico, tem 32 bytes e muda com o rótulo', () => {
    fc.assert(
      fc.property(hex(32, 64), (master) => {
        const a = deriveSecret(master, 'RESET_CODE_SECRET');
        expect(a).toMatch(/^[0-9a-f]{64}$/);
        expect(deriveSecret(master, 'RESET_CODE_SECRET')).toBe(a);
        expect(deriveSecret(master, 'LOCAL_FILES_SECRET')).not.toBe(a);
        expect(a).not.toContain(master);
      }),
    );
  });

  it('usa o valor configurado quando presente e deriva quando ausente', () => {
    const jwt = 'a'.repeat(40);
    expect(
      resolveDerivedSecret(
        { JWT_SECRET: jwt, RESET_CODE_SECRET: 'x'.repeat(40) },
        'RESET_CODE_SECRET',
      ),
    ).toBe('x'.repeat(40));
    expect(resolveDerivedSecret({ JWT_SECRET: jwt }, 'RESET_CODE_SECRET')).toBe(
      deriveSecret(jwt, 'RESET_CODE_SECRET'),
    );
  });
});

describe('regressão C_config: nenhum segredo ou senha padrão versionado (1.1, 1.3)', () => {
  const root = join(__dirname, '..', '..');
  const files = [
    'src/auth/auth.module.ts',
    'src/auth/strategies/jwt.strategy.ts',
    'src/auth/auth.service.ts',
    'prisma/seed.ts',
    'auth_tests.py',
    '.env.example',
  ];
  const forbidden = [
    'your-secret-key-change-in-production',
    'refresh-secret-key',
    'Admin@123456',
  ];

  it.each(files)('%s não contém literais proibidos', (file) => {
    const content = readFileSync(join(root, file), 'utf-8');
    for (const literal of forbidden) {
      expect(content).not.toContain(literal);
    }
  });
});
