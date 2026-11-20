/**
 * Ambiente fixo da suíte de segurança (carregado via `setupFiles`, antes de qualquer import).
 *
 * A versão em produção (origin/main) lê JWT_SECRET no momento do import de auth.module.ts,
 * então as variáveis precisam existir antes do AppModule ser carregado.
 * Nenhum valor aqui é segredo real.
 */
const TEST_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  JWT_SECRET: 'test-access-secret-0123456789abcdef-0123456789',
  JWT_REFRESH_SECRET: 'test-refresh-secret-fedcba9876543210-9876543210',
  PASSWORD_PEPPER: 'test-pepper',
  DATABASE_URL: 'postgresql://fake:fake@localhost:5432/fake',
  // S3 "configurado" para o StorageService não criar pastas locais; o envio é interceptado
  AWS_S3_BUCKET: 'test-bucket',
  AWS_S3_REGION: 'us-east-1',
  AWS_S3_ACCESS_KEY: 'AKIATESTTESTTESTTEST',
  AWS_S3_SECRET_KEY: 'test-secret-key-test-secret-key-0000',
  INTERNAL_CRON_SECRET: 'test-cron-secret-0123456789',
  CRON_SECRET: 'test-cron-secret-0123456789',
  GOOGLE_OAUTH_CLIENT_IDS: 'test-client.apps.googleusercontent.com',
  OPENAI_API_KEY: 'test-openai-key',
  OPENAI_MODEL: 'test-model',
  SMTP_USER: 'test',
  SMTP_PASS: 'test',
};

for (const [key, value] of Object.entries(TEST_ENV)) {
  process.env[key] = value;
}

// Variáveis que mudam comportamento e precisam começar ausentes (defaults = produção)
for (const key of [
  'METRICS_TOKEN',
  'CORS_ALLOWED_ORIGINS',
  'HEALTH_STRICT_STATUS',
  'REQUIRE_UPLOAD_SIZE',
  'UPLOAD_SIGNATURE_ENFORCE',
  'REQUIRE_CURRENT_PASSWORD',
  'REFRESH_ROTATION_ENABLED',
  'AWS_S3_PUBLIC_BASE_URL',
  'VERCEL',
]) {
  delete process.env[key];
}

export const TEST_SECRETS = {
  jwt: TEST_ENV.JWT_SECRET,
  refresh: TEST_ENV.JWT_REFRESH_SECRET,
  cron: TEST_ENV.INTERNAL_CRON_SECRET,
  pepper: TEST_ENV.PASSWORD_PEPPER,
};
