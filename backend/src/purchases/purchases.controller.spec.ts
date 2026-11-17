import { PurchasesController } from './purchases.controller';
import { PurchasesService } from './purchases.service';

describe('PurchasesController', () => {
  let controller: PurchasesController;
  let service: { verifyGooglePurchase: jest.Mock; reconcile: jest.Mock };
  const req = { user: { id: 'user-1' } };

  beforeEach(() => {
    service = {
      verifyGooglePurchase: jest.fn().mockResolvedValue({ status: 'CREDITED' }),
      reconcile: jest.fn().mockResolvedValue([]),
    };
    controller = new PurchasesController(service as unknown as PurchasesService);
  });

  it('envia a compra ao serviço com o id do usuário logado', async () => {
    const dto = { productId: 'credits_10', purchaseToken: 'abc' };

    const result = await controller.verifyGoogle(dto, req);

    expect(service.verifyGooglePurchase).toHaveBeenCalledWith('user-1', dto);
    expect(result).toEqual({ status: 'CREDITED' });
  });

  it('reconcilia apenas as compras do usuário logado', async () => {
    await controller.reconcile(req);

    expect(service.reconcile).toHaveBeenCalledWith('user-1');
  });
});
