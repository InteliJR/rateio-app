import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PurchaseStatus } from '@prisma/client';
import { PurchasesService } from './purchases.service';
import {
  GooglePlayVerifier,
  GooglePurchaseInfo,
} from './google-play-verifier';
import { CreditsGranter } from './credits-granter';

class FakeGooglePlayVerifier extends GooglePlayVerifier {
  info: GooglePurchaseInfo = {
    state: 'PURCHASED',
    consumed: false,
    obfuscatedAccountId: 'user-1',
  };
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

  it('credita créditos por unidade vezes a quantidade comprada', async () => {
    verifier.info = {
      state: 'PURCHASED',
      consumed: false,
      obfuscatedAccountId: 'user-1',
      quantity: 3,
    };

    const result = await service.verifyGooglePurchase('user-1', dto);

    expect(result.credits).toBe(30);
    expect(granter.grant).toHaveBeenCalledWith({
      userId: 'user-1',
      credits: 30,
      reference: 'p1',
    });
    expect(prisma.rows.get('token-1').credits).toBe(30);
  });

  it('retorna o total creditado quando o token se repete', async () => {
    verifier.info = {
      state: 'PURCHASED',
      consumed: false,
      obfuscatedAccountId: 'user-1',
      quantity: 3,
    };
    await service.verifyGooglePurchase('user-1', dto);

    const result = await service.verifyGooglePurchase('user-1', dto);

    expect(result.alreadyCredited).toBe(true);
    expect(result.credits).toBe(30);
    expect(granter.grant).toHaveBeenCalledTimes(1);
  });

  it('usa a quantidade confirmada quando a compra pendente é paga', async () => {
    verifier.info = {
      state: 'PENDING',
      consumed: false,
      obfuscatedAccountId: 'user-1',
      quantity: 2,
    };
    await service.verifyGooglePurchase('user-1', dto);

    verifier.info = {
      state: 'PURCHASED',
      consumed: false,
      obfuscatedAccountId: 'user-1',
      quantity: 2,
    };
    const reconciled = await service.reconcile('user-1');

    expect(reconciled[0].credits).toBe(20);
    expect(granter.grant).toHaveBeenCalledWith({
      userId: 'user-1',
      credits: 20,
      reference: 'p1',
    });
  });

  it.each([0, -1, 1.5])(
    'rejeita quantidade inválida (%s) sem creditar',
    async (quantity) => {
      verifier.info = {
        state: 'PURCHASED',
        consumed: false,
        obfuscatedAccountId: 'user-1',
        quantity,
      };

      await expect(
        service.verifyGooglePurchase('user-1', dto),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(granter.grant).not.toHaveBeenCalled();
    },
  );

  it('rejeita quantidade que estoura o limite de créditos', async () => {
    verifier.info = {
      state: 'PURCHASED',
      consumed: false,
      obfuscatedAccountId: 'user-1',
      quantity: 1_000_000_000,
    };

    await expect(
      service.verifyGooglePurchase('user-1', dto),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(granter.grant).not.toHaveBeenCalled();
  });

  it('rejeita compra sem identificação da conta e não credita', async () => {
    verifier.info = { state: 'PURCHASED', consumed: false };

    await expect(
      service.verifyGooglePurchase('user-1', dto),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(granter.grant).not.toHaveBeenCalled();
    expect(verifier.consumeCalls).toBe(0);
    expect(prisma.rows.has('token-1')).toBe(false);
  });

  it('não reconcilia compra recusada por falta de identificação', async () => {
    verifier.info = { state: 'PURCHASED', consumed: false };
    await expect(
      service.verifyGooglePurchase('user-1', dto),
    ).rejects.toBeInstanceOf(BadRequestException);

    const spy = jest.spyOn(verifier, 'getProductPurchase');
    const reconciled = await service.reconcile('user-1');

    expect(reconciled).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it('mantém pendente a compra pendente sem identificação, sem gravar', async () => {
    verifier.info = { state: 'PENDING', consumed: false };

    const result = await service.verifyGooglePurchase('user-1', dto);

    expect(result.status).toBe(PurchaseStatus.PENDING);
    expect(granter.grant).not.toHaveBeenCalled();
    expect(prisma.rows.has('token-1')).toBe(false);
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

    verifier.info = {
      state: 'PURCHASED',
      consumed: false,
      obfuscatedAccountId: 'user-1',
    };
    const result = await service.verifyGooglePurchase('user-1', dto);

    expect(result.status).toBe(PurchaseStatus.CREDITED);
    expect(granter.grant).toHaveBeenCalledTimes(1);
  });

  it('rejeita compra cancelada e não credita', async () => {
    verifier.info = {
      state: 'CANCELED',
      consumed: false,
      obfuscatedAccountId: 'user-1',
    };

    await expect(
      service.verifyGooglePurchase('user-1', dto),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.rows.get('token-1').status).toBe(PurchaseStatus.CANCELED);
    expect(granter.grant).not.toHaveBeenCalled();
  });

  it('rejeita compra cancelada sem identificação, sem gravar', async () => {
    verifier.info = { state: 'CANCELED', consumed: false };

    await expect(
      service.verifyGooglePurchase('user-2', dto),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.rows.has('token-1')).toBe(false);
  });

  it('rejeita nova tentativa de uma compra já cancelada', async () => {
    verifier.info = {
      state: 'CANCELED',
      consumed: false,
      obfuscatedAccountId: 'user-1',
    };
    await expect(
      service.verifyGooglePurchase('user-1', dto),
    ).rejects.toBeInstanceOf(BadRequestException);

    verifier.info = {
      state: 'PURCHASED',
      consumed: false,
      obfuscatedAccountId: 'user-1',
    };
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
    expect(prisma.rows.has('token-1')).toBe(false);
  });

  it('continua recusando quando a compra de outra conta é reenviada', async () => {
    verifier.info = {
      state: 'PURCHASED',
      consumed: false,
      obfuscatedAccountId: 'user-2',
    };
    await expect(
      service.verifyGooglePurchase('user-1', dto),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.verifyGooglePurchase('user-1', dto),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(granter.grant).not.toHaveBeenCalled();
    expect(prisma.purchase.create).not.toHaveBeenCalled();
  });

  it('não deixa quem envia o token primeiro bloquear o dono real', async () => {
    // A compra é do user-1 na Google; o user-2 tenta registrar antes.
    await expect(
      service.verifyGooglePurchase('user-2', dto),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.rows.has('token-1')).toBe(false);

    const result = await service.verifyGooglePurchase('user-1', dto);

    expect(result.status).toBe(PurchaseStatus.CREDITED);
    expect(granter.grant).toHaveBeenCalledWith({
      userId: 'user-1',
      credits: 10,
      reference: 'p1',
    });
    expect(prisma.rows.get('token-1').userId).toBe('user-1');
  });

  it.each([PurchaseStatus.PENDING, PurchaseStatus.REJECTED])(
    'devolve ao dono real um token gravado antes em outra conta (%s)',
    async (status) => {
      prisma.rows.set('token-1', {
        id: 'legado',
        userId: 'user-2',
        productId: 'credits_10',
        purchaseToken: 'token-1',
        orderId: null,
        status,
        credits: 10,
        consumedAt: null,
      });

      const result = await service.verifyGooglePurchase('user-1', dto);

      expect(result.status).toBe(PurchaseStatus.CREDITED);
      expect(granter.grant).toHaveBeenCalledWith({
        userId: 'user-1',
        credits: 10,
        reference: 'legado',
      });
      expect(prisma.rows.get('token-1').userId).toBe('user-1');
    },
  );

  it('não mexe em compra já creditada a outra conta', async () => {
    prisma.rows.set('token-1', {
      id: 'legado',
      userId: 'user-2',
      productId: 'credits_10',
      purchaseToken: 'token-1',
      orderId: null,
      status: PurchaseStatus.CREDITED,
      credits: 10,
      consumedAt: new Date(),
    });

    await expect(
      service.verifyGooglePurchase('user-1', dto),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(granter.grant).not.toHaveBeenCalled();
    expect(prisma.rows.get('token-1').userId).toBe('user-2');
  });

  it('consulta a Google uma única vez para uma compra nova', async () => {
    const spy = jest.spyOn(verifier, 'getProductPurchase');

    await service.verifyGooglePurchase('user-1', dto);

    expect(spy).toHaveBeenCalledTimes(1);
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
    verifier.info = {
      state: 'PENDING',
      consumed: false,
      obfuscatedAccountId: 'user-1',
    };
    await service.verifyGooglePurchase('user-1', dto);

    verifier.info = {
      state: 'PURCHASED',
      consumed: false,
      obfuscatedAccountId: 'user-1',
    };
    const reconciled = await service.reconcile('user-1');

    expect(reconciled[0].status).toBe(PurchaseStatus.CREDITED);
    expect(granter.grant).toHaveBeenCalledTimes(1);
  });
});
