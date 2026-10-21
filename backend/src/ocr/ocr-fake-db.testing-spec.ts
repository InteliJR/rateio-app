import { BillStatus, OcrJobStatus } from '@prisma/client';

/**
 * Banco FALSO em memória, só para os specs de idempotência da fila de OCR.
 *
 * Cada método é uma "instrução" atômica (como um comando SQL único) e entre
 * elas há pontos de espera (`await`), então duas operações concorrentes
 * intercalam de verdade entre as instruções.
 *
 * O QUE ISTO NÃO PROVA (só um Postgres real prova):
 * - o índice único real em (userId, key) e em ocr_jobs.billId, nem o erro P2002 real;
 * - bloqueio de linha, isolamento de transação e atomicidade reais do updateMany;
 * - que o SQL da migração roda sobre as migrações anteriores;
 * - o comportamento do pgbouncer / pooler da Supabase.
 * A semântica de filtros (inclusive `not` ignorar NULL, como no SQL) é uma
 * reprodução fiel o bastante para a lógica, mas continua sendo uma reprodução.
 *
 * Arquivo não-spec de propósito: o jest só roda `*.spec.ts` e o build exclui `*spec.ts`.
 */

type Row = Record<string, any>;
type Undo = () => void;

const uniqueViolation = () =>
  Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
const notFound = () =>
  Object.assign(new Error('Record to update not found.'), { code: 'P2025' });

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([field, cond]) => {
    if (field === 'OR') {
      return (cond as Row[]).some((w) => matches(row, w));
    }
    if (field === 'AND') {
      return (cond as Row[]).every((w) => matches(row, w));
    }

    const value = row[field] ?? null;

    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
      if ('in' in cond) return cond.in.includes(value);
      if ('not' in cond) {
        // SQL: NULL <> 'x' é desconhecido (falso). Reproduzido de propósito.
        return cond.not === null
          ? value !== null
          : value !== null && value !== cond.not;
      }
      if ('lte' in cond) return value !== null && value <= cond.lte;
      if ('lt' in cond) return value !== null && value < cond.lt;
      throw new Error(`Filtro não suportado no banco falso: ${field}`);
    }

    return value === (cond ?? null);
  });
}

function applyData(row: Row, data: Row) {
  for (const [field, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && 'increment' in value) {
      row[field] = (row[field] ?? 0) + value.increment;
    } else {
      row[field] = value;
    }
  }
  row.updatedAt = new Date();
}

export class FakeOcrDb {
  jobs: Row[] = [];
  bills: Row[] = [];
  items: Row[] = [];
  idempotencyKeys: Row[] = [];
  private seq = 0;
  private readonly baseTime = Date.now() - 1_000_000;

  private nextId(prefix: string) {
    this.seq += 1;
    return `${prefix}-${this.seq}`;
  }

  private tick() {
    return new Date(this.baseTime + this.seq * 1000);
  }

  private update(table: Row[], row: Row, data: Row, journal?: Undo[]): Row {
    const before = { ...row };
    journal?.push(() => {
      Object.keys(row).forEach((key) => delete row[key]);
      Object.assign(row, before);
    });
    applyData(row, data);
    return row;
  }

  private insert(table: Row[], row: Row, journal?: Undo[]): Row {
    table.push(row);
    journal?.push(() => {
      const index = table.indexOf(row);
      if (index >= 0) table.splice(index, 1);
    });
    return row;
  }

  private remove(table: Row[], rows: Row[], journal?: Undo[]) {
    for (const row of rows) {
      const index = table.indexOf(row);
      if (index >= 0) table.splice(index, 1);
      journal?.push(() => {
        table.push(row);
      });
    }
  }

  private jobWithBill(job: Row, include?: Row) {
    if (!include?.bill) return { ...job };
    const bill = this.bills.find((b) => b.id === job.billId) ?? null;
    return {
      ...job,
      bill: bill && {
        id: bill.id,
        imageUrl: bill.imageUrl,
        imageKey: bill.imageKey,
      },
    };
  }

  /** Cliente com a mesma forma do usado pelos serviços (Prisma ou transação). */
  client(journal?: Undo[]): any {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const db = this;

    const ocrJob = {
      createMany: async ({ data, skipDuplicates }: Row) => {
        let count = 0;
        for (const input of data as Row[]) {
          if (db.jobs.some((j) => j.billId === input.billId)) {
            if (skipDuplicates) continue;
            throw uniqueViolation();
          }
          db.insert(
            db.jobs,
            {
              id: db.nextId('job'),
              status: OcrJobStatus.PENDING,
              attempts: 0,
              lockedAt: null,
              availableAt: new Date(),
              startedAt: null,
              finishedAt: null,
              lastError: null,
              imageKey: null,
              createdAt: db.tick(),
              updatedAt: new Date(),
              ...input,
            },
            journal,
          );
          count += 1;
        }
        return { count };
      },
      findUnique: async ({ where }: Row) =>
        db.jobs.find((j) => matches(j, where)) ?? null,
      findUniqueOrThrow: async ({ where }: Row) => {
        const job = db.jobs.find((j) => matches(j, where));
        if (!job) throw notFound();
        return { ...job };
      },
      findFirst: async ({ where, include }: Row) => {
        const found = db.jobs
          .filter((j) => matches(j, where))
          .sort((a, b) => a.createdAt - b.createdAt)[0];
        return found ? db.jobWithBill(found, include) : null;
      },
      updateMany: async ({ where, data }: Row) => {
        const rows = db.jobs.filter((j) => matches(j, where));
        rows.forEach((row) => db.update(db.jobs, row, data, journal));
        return { count: rows.length };
      },
      update: async ({ where, data }: Row) => {
        const row = db.jobs.find((j) => matches(j, where));
        if (!row) throw notFound();
        return { ...db.update(db.jobs, row, data, journal) };
      },
      count: async ({ where }: Row = {}) =>
        db.jobs.filter((j) => matches(j, where)).length,
    };

    const bill = {
      create: async ({ data }: Row) => {
        const row = db.insert(
          db.bills,
          {
            id: db.nextId('bill'),
            status: BillStatus.PENDING_OCR,
            imageUrl: null,
            imageKey: null,
            ocrRawText: null,
            totalAmount: null,
            establishmentName: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...data,
          },
          journal,
        );
        return { ...row };
      },
      findUnique: async ({ where }: Row) => {
        const row = db.bills.find((b) => matches(b, where));
        return row ? { ...row } : null;
      },
      findUniqueOrThrow: async ({ where }: Row) => {
        const row = db.bills.find((b) => matches(b, where));
        if (!row) throw notFound();
        return { ...row };
      },
      findFirst: async ({ where }: Row) => {
        const row = db.bills.find((b) => matches(b, where));
        return row ? { ...row } : null;
      },
      update: async ({ where, data }: Row) => {
        const row = db.bills.find((b) => matches(b, where));
        if (!row) throw notFound();
        return { ...db.update(db.bills, row, data, journal) };
      },
      updateMany: async ({ where, data }: Row) => {
        const rows = db.bills.filter((b) => matches(b, where));
        rows.forEach((row) => db.update(db.bills, row, data, journal));
        return { count: rows.length };
      },
    };

    const billItem = {
      deleteMany: async ({ where }: Row) => {
        const rows = db.items.filter((i) => matches(i, where));
        db.remove(db.items, rows, journal);
        return { count: rows.length };
      },
      createMany: async ({ data }: Row) => {
        for (const input of data as Row[]) {
          db.insert(db.items, { id: db.nextId('item'), ...input }, journal);
        }
        return { count: (data as Row[]).length };
      },
    };

    const idempotencyKey = {
      findUnique: async ({ where }: Row) => {
        const { userId, key } = where.userId_key;
        return (
          db.idempotencyKeys.find(
            (r) => r.userId === userId && r.key === key,
          ) ?? null
        );
      },
      create: async ({ data }: Row) => {
        if (
          db.idempotencyKeys.some(
            (r) => r.userId === data.userId && r.key === data.key,
          )
        ) {
          throw uniqueViolation();
        }
        return {
          ...db.insert(
            db.idempotencyKeys,
            { id: db.nextId('idem'), createdAt: new Date(), ...data },
            journal,
          ),
        };
      },
    };

    const base: any = {
      ocrJob,
      bill,
      billItem,
      idempotencyKey,
      $transaction: async (callback: (tx: any) => Promise<unknown>) => {
        const txJournal: Undo[] = [];
        try {
          return await callback(db.client(txJournal));
        } catch (error) {
          // Rollback: desfaz só as escritas desta transação
          txJournal.reverse().forEach((undo) => undo());
          throw error;
        }
      },
    };

    return base;
  }

  addBill(data: Row = {}): Row {
    const row: Row = {
      id: this.nextId('bill'),
      userId: 'user-1',
      status: BillStatus.PENDING_OCR,
      imageUrl: 'https://img.test/old.jpg',
      imageKey: 'bills/user-1/old.jpg',
      ocrRawText: null,
      totalAmount: null,
      establishmentName: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...data,
    };
    this.bills.push(row);
    return row;
  }

  addJob(billId: string, data: Row = {}): Row {
    const row: Row = {
      id: this.nextId('job'),
      billId,
      userId: 'user-1',
      status: OcrJobStatus.PENDING,
      attempts: 0,
      lockedAt: null,
      availableAt: new Date(Date.now() - 1000),
      startedAt: null,
      finishedAt: null,
      lastError: null,
      imageKey: null,
      createdAt: this.tick(),
      updatedAt: new Date(),
      ...data,
    };
    this.jobs.push(row);
    return row;
  }

  addItem(billId: string, data: Row = {}): Row {
    const row: Row = { id: this.nextId('item'), billId, ...data };
    this.items.push(row);
    return row;
  }
}

export function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Deixa as promessas pendentes avançarem até o próximo ponto de espera real. */
export const flush = () =>
  new Promise<void>((resolve) => setImmediate(resolve));
