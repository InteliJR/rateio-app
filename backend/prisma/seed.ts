// prisma/seed.ts
import { PrismaClient, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const pepper = process.env.PASSWORD_PEPPER || '';
  
  // Verificar se já existe admin
  const existingAdmin = await prisma.user.findFirst({
    where: { role: UserRole.ADMIN },
  });

  if (existingAdmin) {
    console.log('✅ Admin já existe no sistema');
    return;
  }

  // Criar admin padrão
  const email = process.env.SEED_USER_EMAIL || 'admin@rateio.com';
  const name = process.env.SEED_USER_NAME || 'Admin Rateio';
  const password = process.env.SEED_USER_PASSWORD || 'Admin@123456';

  const passwordWithPepper = password + pepper;
  const hashedPassword = await argon2.hash(passwordWithPepper, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const admin = await prisma.user.create({
    data: {
      email,
      name,
      password: hashedPassword,
      role: UserRole.ADMIN,
      isActive: true,
    },
  });

  console.log('✅ Admin criado com sucesso:');
  console.log('   Email:', email);
  console.log('   Senha:', password);
  console.log('   ID:', admin.id);
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });