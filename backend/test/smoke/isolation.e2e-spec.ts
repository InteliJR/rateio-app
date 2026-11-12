import {
  SmokeApp,
  SmokeUser,
  createSmokeApp,
  registerUser,
} from '../support/smoke-app';

// Um usuário nunca pode ler nem alterar a conta de outro.
describe('Fumaça: isolamento entre usuários', () => {
  let smoke: SmokeApp;
  let owner: SmokeUser;
  let intruder: SmokeUser;
  let billId: string;
  let itemId: string;
  let participantId: string;

  beforeAll(async () => {
    smoke = await createSmokeApp();
    owner = await registerUser(smoke, 'dono');
    intruder = await registerUser(smoke, 'intruso');

    const bill = await smoke
      .http()
      .post('/bills')
      .set(owner.auth)
      .send({
        billName: 'Conta do dono',
        participantCount: 1,
        participantNames: ['Dono'],
      })
      .expect(201);
    billId = bill.body.id;

    const item = await smoke
      .http()
      .post(`/bills/${billId}/items`)
      .set(owner.auth)
      .send({
        name: 'Item do dono',
        quantity: 1,
        unitPrice: 50,
        totalPrice: 50,
      })
      .expect(201);
    itemId = item.body.id;

    const details = await smoke
      .http()
      .get(`/bills/${billId}`)
      .set(owner.auth)
      .expect(200);
    participantId = details.body.participants[0].id;
  });

  afterAll(async () => {
    await smoke.close();
  });

  it('não lê a conta nem o resumo de outro usuário', async () => {
    await smoke.http().get(`/bills/${billId}`).set(intruder.auth).expect(403);
    await smoke
      .http()
      .get(`/bills/${billId}/summary`)
      .set(intruder.auth)
      .expect(403);
  });

  it('não vê a conta de outro usuário no próprio histórico', async () => {
    const response = await smoke
      .http()
      .get('/bills')
      .set(intruder.auth)
      .expect(200);

    expect(
      response.body.data.map((bill: { id: string }) => bill.id),
    ).not.toContain(billId);
  });

  it('não altera, finaliza nem exclui a conta de outro usuário', async () => {
    await smoke
      .http()
      .post(`/bills/${billId}/items`)
      .set(intruder.auth)
      .send({ name: 'Item intruso', quantity: 1, unitPrice: 1, totalPrice: 1 })
      .expect(403);

    await smoke
      .http()
      .patch(`/bills/${billId}`)
      .set(intruder.auth)
      .send({ establishmentName: 'Alterado' })
      .expect(403);

    await smoke
      .http()
      .post('/participants')
      .set(intruder.auth)
      .send({ billId, name: 'Participante intruso' })
      .expect(403);

    await smoke
      .http()
      .post('/divisions')
      .set(intruder.auth)
      .send({ billItemId: itemId, participantId, shareAmount: 10 })
      .expect(403);

    await smoke
      .http()
      .post(`/bills/${billId}/finalize`)
      .set(intruder.auth)
      .send({
        divisions: [{ billItemId: itemId, participantId, shareAmount: 50 }],
        fees: [],
      })
      .expect(403);

    await smoke
      .http()
      .delete(`/bills/${billId}`)
      .set(intruder.auth)
      .expect(403);
  });

  it('a conta do dono continua intacta', async () => {
    const response = await smoke
      .http()
      .get(`/bills/${billId}`)
      .set(owner.auth)
      .expect(200);

    expect(response.body.establishmentName).toBe('Conta do dono');
    expect(response.body.items).toHaveLength(1);
    expect(response.body.participants).toHaveLength(1);
    expect(response.body.items[0].divisions).toHaveLength(0);
  });

  // BUG-012 (docs/dev/baseline-qualidade-2026-10-14.md): o finalize não confere
  // se billItemId e participantId pertencem à conta. Hoje o teste falha, e por
  // isso está como `it.failing`. Depois da correção, trocar para `it`.
  it.failing(
    'BUG-012: finalizar a própria conta não grava divisão em item de outro usuário',
    async () => {
      const ownBill = await smoke
        .http()
        .post('/bills')
        .set(intruder.auth)
        .send({
          billName: 'Conta do intruso',
          participantCount: 1,
          participantNames: ['Intruso'],
        })
        .expect(201);

      const ownItem = await smoke
        .http()
        .post(`/bills/${ownBill.body.id}/items`)
        .set(intruder.auth)
        .send({
          name: 'Item do intruso',
          quantity: 1,
          unitPrice: 10,
          totalPrice: 10,
        })
        .expect(201);

      const ownDetails = await smoke
        .http()
        .get(`/bills/${ownBill.body.id}`)
        .set(intruder.auth)
        .expect(200);
      const ownParticipant = ownDetails.body.participants[0].id;

      const response = await smoke
        .http()
        .post(`/bills/${ownBill.body.id}/finalize`)
        .set(intruder.auth)
        .send({
          divisions: [
            {
              billItemId: ownItem.body.id,
              participantId: ownParticipant,
              shareAmount: 10,
            },
            { billItemId: itemId, participantId, shareAmount: 0.01 },
          ],
          fees: [],
        });

      const ownerBill = await smoke
        .http()
        .get(`/bills/${billId}`)
        .set(owner.auth)
        .expect(200);

      expect(ownerBill.body.items[0].divisions).toHaveLength(0);
      expect([400, 403]).toContain(response.status);
    },
  );
});
