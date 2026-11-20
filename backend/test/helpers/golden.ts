/**
 * Metodologia "observation-first" (tarefa 2 do tasks.md).
 *
 * PRESERVATION_MODE=record  → roda na cópia de produção (origin/main) e grava o que foi
 *                             observado em test/security/__golden__/<suite>.json.
 * padrão (verify)           → roda no código atual e exige o mesmo comportamento.
 *
 * Valores voláteis (UUIDs, datas, JWTs, e-mails gerados, URLs assinadas) são trocados
 * por marcadores de tipo antes de gravar/comparar; status, mensagens, chaves e números
 * são comparados exatamente.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { IS_PRODUCTION_BASELINE } from './test-app';

const RECORD = process.env.PRESERVATION_MODE === 'record';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const JWT = /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const URL_RE = /^https?:\/\//;

export function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = normalize((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  if (typeof value === 'string') {
    if (UUID.test(value)) return '<uuid>';
    if (ISO_DATE.test(value)) return '<date>';
    if (JWT.test(value)) return '<jwt>';
    if (EMAIL.test(value)) return '<email>';
    if (URL_RE.test(value)) return '<url>';
  }
  return value;
}

/** Só as chaves (recursivo), para contratos cujo conteúdo é volátil. Chaves UUID viram <uuid>. */
export function keysOf(value: unknown): unknown {
  if (Array.isArray(value)) return value.length ? [keysOf(value[0])] : [];
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const shown = UUID.test(key) ? '<uuid>' : key;
      if (!(shown in out))
        out[shown] = keysOf((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value === null ? 'null' : typeof value;
}

export function goldenSuite(suite: string) {
  const dir = join(__dirname, '..', 'security', '__golden__');
  const file = join(dir, `${suite}.json`);
  const recorded: Record<string, unknown> = {};
  let stored: Record<string, unknown> = {};

  if (RECORD) {
    if (!IS_PRODUCTION_BASELINE) {
      throw new Error(
        'PRESERVATION_MODE=record só pode rodar na cópia de produção (origin/main).',
      );
    }
  } else if (existsSync(file)) {
    stored = JSON.parse(readFileSync(file, 'utf8')).observations ?? {};
  }

  return {
    /** Grava (record) ou compara (verify) a observação `key`. */
    observe(key: string, value: unknown) {
      if (RECORD) {
        recorded[key] = value;
        return;
      }
      if (!(key in stored)) {
        throw new Error(
          `Observação "${key}" não foi gravada na produção. Rode o modo record na origin/main.`,
        );
      }
      expect(value).toEqual(stored[key]);
    },
    flush() {
      if (!RECORD) return;
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        file,
        JSON.stringify(
          {
            description:
              'Comportamento observado na produção (origin/main). Gerado por PRESERVATION_MODE=record; não editar à mão.',
            observations: recorded,
          },
          null,
          2,
        ) + '\n',
      );
    },
  };
}
