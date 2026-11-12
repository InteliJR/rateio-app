import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PurchaseStatus } from '@prisma/client';
import { PurchasesService } from './purchases.service';
import {
  GooglePlayVerifier,
  GooglePurchaseInfo,
} from './google-play-verifier';
import { CreditsGranter } from './credits-granter';

class FakeGooglePlayVerifier extends GooglePlayVerifier {
  info: GooglePurchaseInfo = { state: 'PURCHASED', consumed: false };
  consumeFails = false;
  consumeCalls = 0;

  async getProductPurchase() {
    return this.info;
  }

  async consumeProductPurchase() {
    this.consumeCalls++;
    if (this.consumeFails) throw new Error('consume failed');
  }
}

/** Prisma em memória, só com o que o serviço usa. */
function createFakePrisma() {
  const rows = new Map<string, any>();
  let seq = 0;

  const byId = (id: string) =>
    [...rows.values()].find((row) => row.id === id);

  return {
    rows,
    purchase: {
      findUnique: jest.fn(async ({ where }: any) =>
        rows.get(where.purchaseToken) ?? null,
      ),
      findUniqueOrThrow: jest.fn(async ({ where }: any) => {
        const row = rows.get(where.purchaseToken);
        if (!row) throw new Error('not found');
        return row;
      }),
      create: jest.fn(async ({ data }: any) => {
        const row = {
          id: `p${++seq}`,
          orderId: null,
          status: PurchaseStatus.PENDING,
          consumedAt: null,
          ...data,
        };
        rows.set(row.purchaseToken, row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = byId(where.id);
        Object.assign(row, data);
        return row;
      }),
      findMany: jest.fn(async ({ where }: any) =>
        [...rows.values()].filter(
          (row) =>
            row.userId === where.userId &&
            (row.status === PurchaseStatus.PENDING ||
              (row.status === PurchaseStatus.CREDITED &&
                row.consumedAt === null)),
        ),
      ),
    },
  };
}

describe('PurchasesService', () => {
  const dto = { productId: 'credits_10', purchaseToken: 'token-1' };
  let prisma: ReturnType<typeof createFakePrisma>;
  let verifier: FakeGooglePlayVerifier;
  let granter: { grant: jest.Mock };
  let service: PurchasesService;

  beforeEach(() => {
    process.env.GOOGLE_PLAY_PRODUCTS = 'credits_10:10,credits_30:30';
    prisma = createFakePrisma();
    verifier = new FakeGooglePlayVerifier();
    granter = { grant: jest.fn().mockResolvedValue(undefined) };
    service = new PurchasesService(
      prisma as any,
      verifier,
      granter as unknown as CreditsGranter,
    );
  });

  afterAll(() => {
    delete process.env.GOOGLE_PLAY_PRODUCTS;
  });

  it('credita uma compra válida e consome o produto', async () => {
    const result = await service.verifyGooglePurchase('user-1', dto);

    expect(result).toEqual({
      status: PurchaseStatus.CREDITED,
      productId: 'credits_10',
      credits: 10,
      alreadyCredited: false,
    });
    expect(granter.grant).toHaveBeenCalledWith({
      userId: 'user-1',
      credits: 10,
      reference: 'p1',
    });
    expect(verifier.consumeCalls).toBe(1);
    expect(prisma.rows.get('token-1').consumedAt).toBeInstanceOf(Date);
  });

  it('não credita de novo quando o token se repete', async () => {
    await service.verifyGooglePurchase('user-1', dto);
    const result = await service.verifyGooglePurchase('user-1', dto);

    expect(result.alreadyCredited).toBe(true);
    expect(result.status).toBe(PurchaseStatus.CREDITED);
    expect(granter.grant).toHaveBeenCalledTimes(1);
  });

  it('não credita compra pendente', async () => {
    verifier.info = { state: 'PENDING', consumed: false };

    const result = await service.verifyGooglePurchase('user-1', dto);

    expect(result.status).toBe(PurchaseStatus.PENDING);
    expect(granter.grant).not.toHaveBeenCalled();
    expect(verifier.consumeCalls).toBe(0);
  });

  it('credita depois que a compra pendente é confirmada', async () => {
    verifier.info = { state: 'PENDING', consumed: false };
    await service.verifyGooglePurchase('user-1', dto);

    verifier.info = { state: 'PURCHASED', consumed: false };
    const result = await service.verifyGooglePurchase('user-1', dto);

    expect(result.status).toBe(PurchaseStatus.CREDITED);
    expect(granter.grant).toHaveBeenCalledTimes(1);
  });

  it('rejeita compra cancelada e não credita', async () => {
    verifier.info = { state: 'CANCELED', consumed: false };

    await expect(
      service.verifyGooglePurchase('user-1', dto),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.rows.get('token-1').status).toBe(PurchaseStatus.CANCELED);
    expect(granter.grant).not.toHaveBeenCalled();
  });

  it('rejeita nova tentativa de uma compra já cancelada', async () => {
    verifier.info = { state: 'CANCELED', consumed: false };
    await expect(
      service.verifyGooglePurchase('user-1', dto),
    ).rejects.toBeInstanceOf(BadRequestException);

    verifier.info = { state: 'PURCHASED', consumed: false };
    await expect(
      service.verifyGooglePurchase('user-1', dto),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(granter.grant).not.toHaveBeenCalled();
  });

  it('rejeita produto fora do catálogo sem consultar a Google', async () => {
    const spy = jest.spyOn(verifier, 'getProductPurchase');

    await expect(
      service.verifyGooglePurchase('user-1', {
        ...dto,
        productId: 'desconhecido',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejeita token já registrado por outro usuário', async () => {
    await service.verifyGooglePurchase('user-1', dto);

    await expect(
      service.verifyGooglePurchase('user-2', dto),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(granter.grant).toHaveBeenCalledTimes(1);
  });

  it('rejeita compra vinculada a outra conta na Google', async () => {
    verifier.info = {
      state: 'PURCHASED',
      consumed: false,
      obfuscatedAccountId: 'user-2',
    };

    await expect(
      service.verifyGooglePurchase('user-1', dto),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(granter.grant).not.toHaveBeenCalled();
    expect(prisma.rows.get('token-1').status).toBe(PurchaseStatus.REJECTED);
  });

  it('não consulta a Google de novo para compra já recusada', async () => {
    verifier.info = {
      state: 'PURCHASED',
      consumed: false,
      obfuscatedAccountId: 'user-2',
    };
    await expect(
      service.verifyGooglePurchase('user-1', dto),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const spy = jest.spyOn(verifier, 'getProductPurchase');
    await expect(
      service.verifyGooglePurchase('user-1', dto),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(spy).not.toHaveBeenCalled();
    expect(granter.grant).not.toHaveBeenCalled();
  });

  it('não reconcilia compra recusada', async () => {
    verifier.info = {
      state: 'PURCHASED',
      consumed: false,
      obfuscatedAccountId: 'user-2',
    };
    await expect(
      service.verifyGooglePurchase('user-1', dto),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const spy = jest.spyOn(verifier, 'getProductPurchase');
    const reconciled = await service.reconcile('user-1');

    expect(reconciled).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it('mantém o crédito quando o consumo falha e reconcilia depois', async () => {
    verifier.consumeFails = true;
    const result = await service.verifyGooglePurchase('user-1', dto);

    expect(result.status).toBe(PurchaseStatus.CREDITED);
    expect(prisma.rows.get('token-1').consumedAt).toBeNull();

    verifier.consumeFails = false;
    const reconciled = await service.reconcile('user-1');

    expect(reconciled).toHaveLength(1);
    expect(prisma.rows.get('token-1').consumedAt).toBeInstanceOf(Date);
    expect(granter.grant).toHaveBeenCalledTimes(1);
  });

  it('reconcilia compra pendente que foi confirmada', async () => {
    verifier.info = { state: 'PENDING', consumed: false };
    await service.verifyGooglePurchase('user-1', dto);

    verifier.info = { state: 'PURCHASED', consumed: false };
    const reconciled = await service.reconcile('user-1');

    expect(reconciled[0].status).toBe(PurchaseStatus.CREDITED);
    expect(granter.grant).toHaveBeenCalledTimes(1);
  });
});
