// Ambiente da suíte E2E. Nenhum valor aqui é segredo real: OpenAI e S3 são
// substituídos por versões falsas em createSmokeApp, e o banco é descartável.

const defaults: Record<string, string> = {
  DATABASE_URL: 'postgresql://ci:ci@localhost:55432/rateio_test',
  JWT_SECRET: 'e2e-access-secret',
  JWT_REFRESH_SECRET: 'e2e-refresh-secret',
  OPENAI_API_KEY: 'sk-e2e-fake',
  OPENAI_MODEL: 'e2e-fake-model',
  INTERNAL_CRON_SECRET: 'e2e-cron-secret',
};

for (const [name, value] of Object.entries(defaults)) {
  if (!process.env[name]) {
    process.env[name] = value;
  }
}

process.env.DIRECT_URL ||= process.env.DATABASE_URL;

// Fila previsível: retentativa imediata e no máximo 3 tentativas.
process.env.OCR_QUEUE_RETRY_DELAY_MS = '0';
process.env.OCR_QUEUE_MAX_ATTEMPTS = '3';

// Garante armazenamento local (sem S3) e processamento da fila fora da Vercel.
delete process.env.VERCEL;
delete process.env.AWS_S3_BUCKET;

const databaseHost = new URL(process.env.DATABASE_URL as string).hostname;
const allowedHosts = ['localhost', '127.0.0.1', 'postgres', 'db'];

if (!allowedHosts.includes(databaseHost)) {
  throw new Error(
    `A suíte E2E só roda em banco local ou de CI (host recebido: ${databaseHost}).`,
  );
}
