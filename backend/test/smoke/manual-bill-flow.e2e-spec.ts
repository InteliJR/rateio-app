import {
  SmokeApp,
  SmokeUser,
  createSmokeApp,
  registerUser,
} from '../support/smoke-app';

// Simula o fluxo manual do app, do início ao histórico:
// criar conta → itens → participantes → divisão → taxa → finalizar → resumo.
//
// Pizza R$ 80 dividida entre Ana e Bruno; 2 refrigerantes (R$ 12) só da Ana.
// Subtotais: Ana 52, Bruno 40. Taxa de serviço de 10% proporcional:
// Ana 5,20 e Bruno 4,00. Totais: Ana 57,20, Bruno 44,00, conta 101,20.
describe('Fumaça: fluxo manual completo', () => {
  let smoke: SmokeApp;
  let user: SmokeUser;
  let billId: string;
  let ana: string;
  let bruno: string;
  let pizza: string;
  let refrigerante: string;

  beforeAll(async () => {
    smoke = await createSmokeApp();
    user = await registerUser(smoke, 'manual');
  });

  afterAll(async () => {
    await smoke.close();
  });

  it('cria a conta manual com participantes e taxa de serviço', async () => {
    const created = await smoke
      .http()
      .post('/bills')
      .set(user.auth)
      .send({
        billName: 'Jantar de teste',
        participantCount: 2,
        participantNames: ['Ana', 'Bruno'],
        serviceFeePercentage: 10,
      })
      .expect(201);

    billId = created.body.id;
    expect(created.body.status).toBe('DIVIDING');

    const bill = await smoke
      .http()
      .get(`/bills/${billId}`)
      .set(user.auth)
      .expect(200);
    const byName = Object.fromEntries(
      bill.body.participants.map((p: { name: string; id: string }) => [
        p.name,
        p.id,
      ]),
    );

    ana = byName.Ana;
    bruno = byName.Bruno;
    expect(ana).toBeDefined();
    expect(bruno).toBeDefined();
    expect(bill.body.fees).toEqual([
      expect.objectContaining({ type: 'SERVICE_PERCENTAGE' }),
    ]);
  });

  it('adiciona itens e recusa total diferente de quantidade × preço', async () => {
    const pizzaResponse = await smoke
      .http()
      .post(`/bills/${billId}/items`)
      .set(user.auth)
      .send({ name: 'Pizza', quantity: 1, unitPrice: 80, totalPrice: 80 })
      .expect(201);
    pizza = pizzaResponse.body.id;

    const refrigeranteResponse = await smoke
      .http()
      .post(`/bills/${billId}/items`)
      .set(user.auth)
      .send({ name: 'Refrigerante', quantity: 2, unitPrice: 6, totalPrice: 12 })
      .expect(201);
    refrigerante = refrigeranteResponse.body.id;

    await smoke
      .http()
      .post(`/bills/${billId}/items`)
      .set(user.auth)
      .send({ name: 'Sobremesa', quantity: 2, unitPrice: 10, totalPrice: 25 })
      .expect(400);
  });

  it('adiciona e remove um participante', async () => {
    const extra = await smoke
      .http()
      .post('/participants')
      .set(user.auth)
      .send({ billId, name: 'Carla' })
      .expect(201);

    await smoke
      .http()
      .delete(`/participants/${extra.body.id}`)
      .set(user.auth)
      .expect(200);

    const bill = await smoke
      .http()
      .get(`/bills/${billId}`)
      .set(user.auth)
      .expect(200);
    expect(bill.body.participants).toHaveLength(2);
  });

  it('recusa finalizar quando a divisão não fecha com o item', async () => {
    await smoke
      .http()
      .post(`/bills/${billId}/finalize`)
      .set(user.auth)
      .send({
        divisions: [
          { billItemId: pizza, participantId: ana, shareAmount: 40 },
          { billItemId: refrigerante, participantId: ana, shareAmount: 12 },
        ],
        fees: [],
      })
      .expect(400);
  });

  it('finaliza com divisão e taxa de serviço', async () => {
    const response = await smoke
      .http()
      .post(`/bills/${billId}/finalize`)
      .set(user.auth)
      .send({
        divisions: [
          { billItemId: pizza, participantId: ana, shareAmount: 40 },
          { billItemId: pizza, participantId: bruno, shareAmount: 40 },
          { billItemId: refrigerante, participantId: ana, shareAmount: 12 },
        ],
        fees: [{ type: 'SERVICE_PERCENTAGE', value: 10 }],
      })
      .expect(201);

    expect(response.body.bill.status).toBe('COMPLETED');
    expect(response.body.summary.subtotal).toBeCloseTo(92, 2);
    expect(response.body.summary.totalFees).toBeCloseTo(9.2, 2);
    expect(response.body.summary.grandTotal).toBeCloseTo(101.2, 2);
  });

  it('resumo mostra quanto cada participante paga', async () => {
    const response = await smoke
      .http()
      .get(`/bills/${billId}/summary`)
      .set(user.auth)
      .expect(200);
    const byName = Object.fromEntries(
      response.body.participants.map((p: { name: string }) => [p.name, p]),
    );

    expect(byName.Ana).toMatchObject({ subtotal: 52, fees: 5.2, total: 57.2 });
    expect(byName.Bruno).toMatchObject({ subtotal: 40, fees: 4, total: 44 });
    expect(response.body.summary).toMatchObject({
      subtotal: 92,
      totalFees: 9.2,
      total: 101.2,
    });
  });

  it('conta finalizada aparece no histórico', async () => {
    const response = await smoke
      .http()
      .get('/bills?status=COMPLETED')
      .set(user.auth)
      .expect(200);

    expect(response.body.data.map((bill: { id: string }) => bill.id)).toContain(
      billId,
    );
    expect(response.body.meta.total).toBe(1);
  });

  it('exclui a conta', async () => {
    await smoke.http().delete(`/bills/${billId}`).set(user.auth).expect(200);
    await smoke.http().get(`/bills/${billId}`).set(user.auth).expect(404);
  });
});
