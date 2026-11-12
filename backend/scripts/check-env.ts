/**
 * Verificação read-only do ambiente (design.md, Fase 1, item 7).
 *
 * Uso: `npm run check:env` no ambiente alvo (pipeline de deploy ou manualmente).
 * Mostra erros e avisos SEM valores. Sai com código 1 se o boot seria recusado.
 *
 * PRÉ-REQUISITO DO DEPLOY DA FASE 1: se JWT_SECRET/JWT_REFRESH_SECRET de produção tiverem
 * menos de 32 caracteres ou forem iguais, trocá-los invalida todos os tokens (relogin geral).
 * Nesse caso suspenda o deploy e leve a decisão ao produto.
 */
import { loadRawEnv } from '../src/config/env.bootstrap';
import { EnvValidationError, parseEnv } from '../src/config/env.schema';

function main(): void {
  try {
    const { warnings } = parseEnv(loadRawEnv());
    console.log('OK: segredos JWT válidos; o boot será aceito.');
    if (warnings.length > 0) {
      console.log(`\n${warnings.length} aviso(s):`);
      for (const line of warnings) console.log(`  - ${line}`);
    }
  } catch (error) {
    const message =
      error instanceof EnvValidationError ? error.message : 'Invalid env';
    console.error(`ERRO: o boot seria recusado. ${message}`);
    process.exit(1);
  }
}

main();
