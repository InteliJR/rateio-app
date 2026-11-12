import { Logger } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { parse as parseDotenv } from 'dotenv';
import { EnvValidationError, ParsedEnv, RawEnv, parseEnv } from './env.schema';

const logger = new Logger('EnvConfig');

/**
 * Monta a mesma visão de ambiente que o ConfigModule usa (`.env` + process.env, com
 * process.env prevalecendo), sem alterar process.env.
 */
export function loadRawEnv(cwd: string = process.cwd()): RawEnv {
  const envFile = resolve(cwd, '.env');
  let fileVars: RawEnv = {};
  if (existsSync(envFile)) {
    try {
      fileVars = parseDotenv(readFileSync(envFile));
    } catch {
      // .env malformado: o ConfigModule reportará; aqui seguimos só com process.env
    }
  }
  return { ...fileVars, ...process.env };
}

/**
 * Primeira instrução do boot (main.ts / api/index.ts): valida o ambiente, registra
 * avisos (só nomes) e, em erro, encerra/lança com mensagem que não contém valores.
 */
export function validateEnvAtBoot(options: {
  exitOnError: boolean;
}): ParsedEnv {
  try {
    const parsed = parseEnv(loadRawEnv());
    for (const line of parsed.warnings) {
      logger.warn(line);
    }
    return parsed;
  } catch (error) {
    const message =
      error instanceof EnvValidationError ? error.message : 'Invalid env';
    logger.error(`Boot recusado. ${message}`);
    if (options.exitOnError) {
      process.exit(1);
    }
    throw error instanceof EnvValidationError ? error : new Error(message);
  }
}
