import { PrismaClient, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed do banco de dados...');

  // Verificar se já existe admin
  const existingAdmin = await prisma.user.findFirst({
    where: { role: UserRole.ADMIN },
  });

  if (existingAdmin) {
    console.log('⚠️  Admin já existe no sistema. Pulando criação.');
    return;
  }

  // Criar primeiro admin
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123456';
  const adminName = process.env.ADMIN_NAME || 'Administrador';

  const pepper = process.env.PASSWORD_PEPPER || '';
  const passwordWithPepper = adminPassword + pepper;
  const hashedPassword = await argon2.hash(passwordWithPepper, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const admin = await prisma.user.create({
    data: {
      email: adminEmail,
      name: adminName,
      password: hashedPassword,
      role: UserRole.ADMIN,
      isActive: true,
    },
  });

  console.log('✅ Admin criado com sucesso!');
  console.log(`📧 Email: ${admin.email}`);
  console.log(`🔑 Senha: ${adminPassword}`);
  console.log('⚠️  ALTERE A SENHA IMEDIATAMENTE APÓS O PRIMEIRO LOGIN!');
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });