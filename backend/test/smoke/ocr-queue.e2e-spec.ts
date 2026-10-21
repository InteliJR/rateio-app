import {
  FAKE_RECEIPT_IMAGE,
  SmokeApp,
  SmokeUser,
  createSmokeApp,
  fakeOcrResult,
  registerUser,
  waitForBillStatus,
  waitUntil,
} from '../support/smoke-app';

// Fila de OCR real (banco, tentativas, locks) com a OpenAI simulada.
// Mede o caminho upload → fila → itens sem custo nem chamada externa.
describe('Fumaça: fila de OCR com provedor simulado', () => {
  let smoke: SmokeApp;
  let user: SmokeUser;

  beforeAll(async () => {
    smoke = await createSmokeApp();
    user = await registerUser(smoke, 'ocr');
  });

  beforeEach(() => {
    smoke.ocr.processImage.mockReset();
  });

  afterAll(async () => {
    await smoke.close();
  });

  async function uploadReceipt() {
    const response = await smoke
      .http()
      .post('/bills')
      .set(user.auth)
      .attach('image', FAKE_RECEIPT_IMAGE, {
        filename: 'nota.jpg',
        contentType: 'image/jpeg',
      })
      .expect(201);

    expect(response.body.status).toBe('PENDING_OCR');
    return response.body.id as string;
  }

  function waitForJob(billId: string, status: string) {
    return waitUntil(
      `job de OCR da conta ${billId} com status ${status}`,
      async () => {
        const job = await smoke.prisma.ocrJob.findUnique({ where: { billId } });
        return job?.status === status ? job : undefined;
      },
    );
  }

  it('leitura bem-sucedida gera os itens para revisão', async () => {
    smoke.ocr.processImage.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return fakeOcrResult();
    });

    const billId = await uploadReceipt();
    const bill = await waitForBillStatus(smoke, user, billId, 'REVIEWING');
    const job = await waitForJob(billId, 'COMPLETED');

    expect(bill.establishmentName).toBe('Restaurante Ficticio');
    expect(Number(bill.totalAmount)).toBe(50);
    expect(
      bill.items.map((item: { name: string }) => item.name).sort(),
    ).toEqual(['Suco', 'X-Burguer']);
    expect(job.attempts).toBe(1);
    expect(smoke.ocr.processImage).toHaveBeenCalledTimes(1);
    expect(smoke.ocr.processImage).toHaveBeenCalledWith(
      expect.stringContaining('/uploads/bills/'),
    );
  });

  it('falha transitória é repetida e a leitura conclui', async () => {
    smoke.ocr.processImage
      .mockRejectedValueOnce(new Error('timeout simulado do provedor'))
      .mockResolvedValue(fakeOcrResult());

    const billId = await uploadReceipt();
    await waitForBillStatus(smoke, user, billId, 'REVIEWING');
    const job = await waitForJob(billId, 'COMPLETED');

    expect(job.attempts).toBe(2);
    expect(smoke.ocr.processImage).toHaveBeenCalledTimes(2);
  });

  it('esgota as tentativas, marca falha e permite reprocessar', async () => {
    smoke.ocr.processImage.mockRejectedValue(
      new Error('falha simulada do provedor'),
    );

    const billId = await uploadReceipt();
    await waitForBillStatus(smoke, user, billId, 'OCR_FAILED');
    const failedJob = await waitForJob(billId, 'FAILED');

    // Deveria ser exatamente 3. Com processamentos concorrentes (disparo do
    // upload + polling da conta), a fila às vezes faz uma tentativa a mais:
    // BUG-013 em docs/dev/baseline-qualidade-2026-10-14.md.
    expect(failedJob.attempts).toBeGreaterThanOrEqual(3);
    expect(failedJob.lastError).toBe('falha simulada do provedor');

    smoke.ocr.processImage.mockReset();
    smoke.ocr.processImage.mockResolvedValue(fakeOcrResult());

    await smoke
      .http()
      .post(`/bills/${billId}/retry-ocr`)
      .set(user.auth)
      .expect(201);
    const bill = await waitForBillStatus(smoke, user, billId, 'REVIEWING');

    expect(bill.items).toHaveLength(2);
  });

  it('recusa arquivo que não é imagem sem criar job', async () => {
    const before = await smoke.prisma.ocrJob.count({
      where: { userId: user.id },
    });

    await smoke
      .http()
      .post('/bills')
      .set(user.auth)
      .attach('image', Buffer.from('texto'), {
        filename: 'nota.txt',
        contentType: 'text/plain',
      })
      .expect(400);

    expect(
      await smoke.prisma.ocrJob.count({ where: { userId: user.id } }),
    ).toBe(before);
    expect(smoke.ocr.processImage).not.toHaveBeenCalled();
  });

  it('endpoint interno da fila exige o segredo do cron', async () => {
    await smoke.http().post('/internal/ocr/process-pending').expect(403);

    await smoke
      .http()
      .post('/internal/ocr/process-pending')
      .set({
        'x-internal-cron-secret': process.env.INTERNAL_CRON_SECRET as string,
      })
      .expect(200);
  });
});
