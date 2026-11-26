/**
 * Fábricas e fluxos reutilizáveis da suíte de segurança.
 */
import * as argon2 from 'argon2';
import * as fc from 'fast-check';
import { TEST_SECRETS } from './setup-env';
import { FakePrisma } from './fake-prisma';
import { TestApp } from './test-app';

export const VALID_PASSWORD = 'SenhaForte#2024';

let emailCounter = 0;
export const uniqueEmail = (prefix = 'user') => {
  emailCounter += 1;
  return `${prefix}.${Date.now().toString(36)}.${emailCounter}@teste.com`;
};

/** Hash compatível com UsersService (argon2id + pepper). Custo reduzido só para velocidade. */
export async function hashPassword(password: string) {
  return argon2.hash(password + TEST_SECRETS.pepper, {
    type: argon2.argon2id,
    memoryCost: 4096,
    timeCost: 2,
    parallelism: 1,
  });
}

export async function seedUser(
  prisma: FakePrisma,
  overrides: Partial<{
    email: string;
    name: string;
    password: string | null;
    role: 'USER' | 'ADMIN';
    isActive: boolean;
    googleId: string | null;
    avatarUrl: string | null;
  }> = {},
) {
  const plain =
    overrides.password === undefined ? VALID_PASSWORD : overrides.password;
  return prisma.seed('user', {
    email: overrides.email ?? uniqueEmail(),
    name: overrides.name ?? 'Usuário Teste',
    password: plain === null ? null : await hashPassword(plain),
    role: overrides.role ?? 'USER',
    isActive: overrides.isActive ?? true,
    googleId: overrides.googleId ?? null,
    avatarUrl: overrides.avatarUrl ?? null,
  });
}

export interface SeededBill {
  billId: string;
  itemIds: string[];
  participantIds: string[];
  items: { id: string; totalPrice: number }[];
}

export function seedBill(
  prisma: FakePrisma,
  userId: string,
  spec: {
    status?: string;
    items?: { name?: string; quantity?: number; unitPrice: number }[];
    participants?: string[];
  } = {},
): SeededBill {
  const bill = prisma.seed('bill', {
    userId,
    status: spec.status ?? 'DIVIDING',
    establishmentName: 'Restaurante Teste',
  });
  const items = (
    spec.items ?? [{ name: 'Item', quantity: 1, unitPrice: 10 }]
  ).map((it, i) => {
    const quantity = it.quantity ?? 1;
    const totalPrice = Math.round(quantity * it.unitPrice * 100) / 100;
    const row = prisma.seed('billItem', {
      billId: bill.id,
      name: it.name ?? `Item ${i + 1}`,
      quantity,
      unitPrice: it.unitPrice,
      totalPrice,
    });
    return { id: row.id, totalPrice };
  });
  const participantIds = (spec.participants ?? ['Ana', 'Bruno']).map(
    (name) => prisma.seed('participant', { billId: bill.id, name }).id,
  );
  return {
    billId: bill.id,
    itemIds: items.map((i) => i.id),
    participantIds,
    items,
  };
}

/** Divide cada item igualmente entre todos os participantes (centavos fecham no último). */
export function evenDivisions(seeded: SeededBill) {
  const divisions: {
    billItemId: string;
    participantId: string;
    shareAmount: number;
  }[] = [];
  for (const item of seeded.items) {
    const cents = Math.round(item.totalPrice * 100);
    const n = seeded.participantIds.length;
    const base = Math.floor(cents / n);
    seeded.participantIds.forEach((participantId, idx) => {
      const share = idx === n - 1 ? cents - base * (n - 1) : base;
      divisions.push({
        billItemId: item.id,
        participantId,
        shareAmount: share / 100,
      });
    });
  }
  return divisions;
}

export async function registerViaApi(
  t: TestApp,
  email = uniqueEmail(),
  password = VALID_PASSWORD,
) {
  const res = await t
    .http('post', '/auth/register')
    .send({ email, name: 'Novo Usuário', password });
  return { res, email, password };
}

export async function loginViaApi(
  t: TestApp,
  email: string,
  password = VALID_PASSWORD,
) {
  return t.http('post', '/auth/login').send({ email, password });
}

/** Cria usuário no banco e devolve seus tokens obtidos pelo login real. */
export async function authenticatedUser(
  t: TestApp,
  overrides: Parameters<typeof seedUser>[1] = {},
) {
  const user = await seedUser(t.prisma, overrides);
  const res = await loginViaApi(t, user.email, VALID_PASSWORD);
  if (res.status !== 200) {
    throw new Error(
      `login de teste falhou: ${res.status} ${JSON.stringify(res.body)}`,
    );
  }
  return {
    user,
    accessToken: res.body.accessToken as string,
    refreshToken: res.body.refreshToken as string,
    auth: { Authorization: `Bearer ${res.body.accessToken}` },
  };
}

export function decodeJwt(token: string): Record<string, any> {
  const [, payload] = token.split('.');
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
}

// --------------------------------------------------------------- arbitrários

/** Valores em centavos para evitar ruído de ponto flutuante nos geradores. */
export const moneyArb = fc.integer({ min: 1, max: 50_000 }).map((c) => c / 100);
export const quantityArb = fc.constantFrom(1, 2, 3, 0.5, 1.5, 0.25, 4);

export const billSpecArb = fc.record({
  items: fc.array(fc.record({ quantity: quantityArb, unitPrice: moneyArb }), {
    minLength: 1,
    maxLength: 5,
  }),
  participants: fc.array(
    fc.constantFrom('Ana', 'Bruno', 'Carla', 'Davi', 'Eva'),
    {
      minLength: 1,
      maxLength: 4,
    },
  ),
  fees: fc.array(
    fc.oneof(
      fc.record({
        type: fc.constant('SERVICE_PERCENTAGE'),
        value: fc.integer({ min: 1, max: 20 }),
      }),
      fc.record({ type: fc.constant('SERVICE_FIXED'), value: moneyArb }),
      fc.record({ type: fc.constant('COVER_CHARGE'), value: moneyArb }),
    ),
    { maxLength: 2 },
  ),
});

/** PNG 1x1 válido. */
export const PNG_1X1 = Buffer.from(
  '89504e470d0a1a0a0000000d4948445200000001000000010806000000' +
    '1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082',
  'hex',
);
export const JPEG_MIN = Buffer.from(
  'ffd8ffe000104a46494600010100000100010000ffd9',
  'hex',
);
export const GIF_MIN = Buffer.from('47494638396101000100000000003b', 'hex');
export const WEBP_MIN = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x1a, 0, 0, 0]),
  Buffer.from('WEBPVP8 '),
  Buffer.alloc(14),
]);
