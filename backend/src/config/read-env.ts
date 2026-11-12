import { ConfigService } from '@nestjs/config';

/**
 * Lê uma variável pelo ConfigService (env validado por parseEnv) com fallback para
 * process.env. O valor efetivo é o mesmo de antes (process.env), apenas centralizado:
 * serviços instanciados fora do container Nest (scripts, testes) continuam funcionando.
 */
export function readEnv(
  configService: ConfigService | undefined,
  name: string,
): string | undefined {
  return configService?.get<string>(name) ?? process.env[name];
}
