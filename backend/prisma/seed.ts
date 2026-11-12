// prisma/seed.ts
//
// Cria o primeiro ADMIN, somente com credenciais explícitas (requisitos 1.3 / 2.3):
// - Se já existe ADMIN, não altera nada e sai com sucesso (seguro para rodar de novo).
// - Sem SEED_USER_EMAIL / SEED_USER_PASSWORD, ou com senha < 12 caracteres, aborta sem criar.
// - Nunca imprime a senha.
// - Usa o mesmo pepper efetivo da API (process.env.PASSWORD_PEPPER || ''), para que o login funcione.
import { PrismaClient, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const MIN_SEED_PASSWORD_LENGTH = 12;

function fail(message: string): never {
  console.error(`❌ Seed abortado: ${message}`);
  process.exit(1);
}

async function main() {
  // Verificar se já existe admin: nenhum usuário existente é alterado
  const existingAdmin = await prisma.user.findFirst({
    where: { role: UserRole.ADMIN },
    select: { id: true },
  });

  if (existingAdmin) {
    console.log('✅ Admin já existe no sistema; nada foi alterado.');
    return;
  }

  const email = process.env.SEED_USER_EMAIL?.trim().toLowerCase();
  const name = process.env.SEED_USER_NAME?.trim() || 'Admin Rateio';
  const password = process.env.SEED_USER_PASSWORD;

  const missing = [
    !email ? 'SEED_USER_EMAIL' : null,
    !password ? 'SEED_USER_PASSWORD' : null,
  ].filter(Boolean);
  if (missing.length > 0) {
    fail(`defina ${missing.join(' e ')} para criar o ADMIN.`);
  }

  if ((password as string).length < MIN_SEED_PASSWORD_LENGTH) {
    fail(
      `SEED_USER_PASSWORD deve ter ao menos ${MIN_SEED_PASSWORD_LENGTH} caracteres.`,
    );
  }

  // Mesmo subset de validação de parseEnv: pepper ausente é aviso, não erro
  const pepper = process.env.PASSWORD_PEPPER || '';
  if (!pepper) {
    console.warn(
      'env_warning: PASSWORD_PEPPER ausente: o hash usará pepper vazio (deve coincidir com a configuração da API)',
    );
  }

  const hashedPassword = await argon2.hash((password as string) + pepper, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const admin = await prisma.user.create({
    data: {
      email: email as string,
      name,
      password: hashedPassword,
      role: UserRole.ADMIN,
      isActive: true,
    },
    select: { id: true },
  });

  console.log(`✅ Admin criado: id=${admin.id}`);
}

main()
  .catch((e: unknown) => {
    // Só o tipo do erro: mensagens do Prisma podem conter dados da linha
    const errorName = e instanceof Error ? e.name : 'UnknownError';
    const code = (e as { code?: string })?.code;
    console.error(`❌ Erro no seed: ${errorName}${code ? ` (${code})` : ''}`);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
