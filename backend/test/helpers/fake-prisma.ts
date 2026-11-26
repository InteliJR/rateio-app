/**
 * Prisma em memória para a suíte de segurança.
 *
 * Reproduz o subconjunto do Prisma Client usado pela API, com a semântica que importa
 * para os testes: defaults do schema, @unique (P2002), registro inexistente (P2025),
 * campos Decimal (serializados como string no JSON, como no Postgres), relações com
 * include/select/_count, cascata de exclusão e $transaction interativa com rollback.
 *
 * Limitação conhecida: não substitui o Postgres. Os e2e com banco real continuam
 * necessários (checkpoints do tasks.md).
 */
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';

type Row = Record<string, any>;
type Relation =
  | { kind: 'one'; model: string; fk: string } // fk neste modelo
  | { kind: 'many'; model: string; fk: string } // fk no modelo relacionado
  | { kind: 'reverseOne'; model: string; fk: string }; // fk no relacionado, 1:1

interface ModelMeta {
  defaults: () => Row;
  unique: string[];
  compound?: Record<string, string[]>;
  decimals?: string[];
  relations: Record<string, Relation>;
  updatedAt?: boolean;
}

const nullable = (...fields: string[]) =>
  Object.fromEntries(fields.map((f) => [f, null]));

const MODELS: Record<string, ModelMeta> = {
  user: {
    defaults: () => ({
      role: 'USER',
      isActive: true,
      ...nullable(
        'password',
        'avatarUrl',
        'googleId',
        'googleAvatarUrl',
        'emailVerifiedAt',
      ),
    }),
    unique: ['id', 'email', 'googleId'],
    updatedAt: true,
    relations: {
      bills: { kind: 'many', model: 'bill', fk: 'userId' },
      ocrJobs: { kind: 'many', model: 'ocrJob', fk: 'userId' },
      revokedTokens: { kind: 'many', model: 'revokedToken', fk: 'userId' },
    },
  },
  revokedToken: {
    defaults: () => ({}),
    unique: ['id', 'token'],
    relations: { user: { kind: 'one', model: 'user', fk: 'userId' } },
  },
  passwordResetToken: {
    defaults: () => ({ used: false }),
    unique: ['id', 'token'],
    relations: {},
  },
  bill: {
    defaults: () => ({
      status: 'PENDING_OCR',
      ...nullable(
        'imageUrl',
        'imageKey',
        'ocrRawText',
        'totalAmount',
        'establishmentName',
      ),
    }),
    unique: ['id'],
    decimals: ['totalAmount'],
    updatedAt: true,
    relations: {
      user: { kind: 'one', model: 'user', fk: 'userId' },
      items: { kind: 'many', model: 'billItem', fk: 'billId' },
      participants: { kind: 'many', model: 'participant', fk: 'billId' },
      fees: { kind: 'many', model: 'fee', fk: 'billId' },
      ocrJob: { kind: 'reverseOne', model: 'ocrJob', fk: 'billId' },
    },
  },
  billItem: {
    defaults: () => ({ quantity: 1, measurementUnit: 'UNIT' }),
    unique: ['id'],
    decimals: ['quantity', 'unitPrice', 'totalPrice'],
    updatedAt: true,
    relations: {
      bill: { kind: 'one', model: 'bill', fk: 'billId' },
      divisions: { kind: 'many', model: 'division', fk: 'billItemId' },
    },
  },
  participant: {
    defaults: () => ({}),
    unique: ['id'],
    updatedAt: true,
    relations: {
      bill: { kind: 'one', model: 'bill', fk: 'billId' },
      divisions: { kind: 'many', model: 'division', fk: 'participantId' },
    },
  },
  division: {
    defaults: () => ({}),
    unique: ['id'],
    compound: { billItemId_participantId: ['billItemId', 'participantId'] },
    decimals: ['shareAmount'],
    updatedAt: true,
    relations: {
      billItem: { kind: 'one', model: 'billItem', fk: 'billItemId' },
      participant: { kind: 'one', model: 'participant', fk: 'participantId' },
    },
  },
  fee: {
    defaults: () => ({ description: null }),
    unique: ['id'],
    decimals: ['value'],
    updatedAt: true,
    relations: { bill: { kind: 'one', model: 'bill', fk: 'billId' } },
  },
  ocrJob: {
    defaults: () => ({
      status: 'PENDING',
      attempts: 0,
      availableAt: new Date(),
      ...nullable('lockedAt', 'startedAt', 'finishedAt', 'lastError'),
    }),
    unique: ['id', 'billId'],
    updatedAt: true,
    relations: {
      bill: { kind: 'one', model: 'bill', fk: 'billId' },
      user: { kind: 'one', model: 'user', fk: 'userId' },
    },
  },
};

const CLIENT_VERSION = '6.17.1';

export function prismaError(code: string, message: string, meta?: Row) {
  return new Prisma.PrismaClientKnownRequestError(message, {
    code,
    clientVersion: CLIENT_VERSION,
    meta,
  });
}

const isPlainObject = (v: unknown): v is Row =>
  typeof v === 'object' &&
  v !== null &&
  !(v instanceof Date) &&
  !Prisma.Decimal.isDecimal(v) &&
  !Array.isArray(v);

function comparable(v: any, insensitive = false): any {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (Prisma.Decimal.isDecimal(v)) return v.toNumber();
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'string' && insensitive) return v.toLowerCase();
  return v;
}

function cloneValue(v: any): any {
  if (v instanceof Date) return new Date(v.getTime());
  return v; // Decimal é imutável; primitivos copiam por valor
}

export type InjectHandler = (args: any) => void | Promise<void>;

export interface PrismaCall {
  model: string;
  op: string;
  args: any;
}

export class FakePrisma {
  tables: Record<string, Row[]> = Object.fromEntries(
    Object.keys(MODELS).map((m) => [m, []]),
  );
  calls: PrismaCall[] = [];
  private injections = new Map<string, InjectHandler>();
  queryRawFails = false;
  [model: string]: any;

  constructor() {
    for (const model of Object.keys(MODELS)) {
      this[model] = this.delegate(model);
    }
  }

  // ------------------------------------------------------------------ controle

  /** Faz `model.op` executar `handler` antes da operação (pode lançar para simular falha). */
  inject(model: string, op: string, handler: InjectHandler) {
    this.injections.set(`${model}.${op}`, handler);
  }

  clearInjections() {
    this.injections.clear();
  }

  callsTo(model: string, op?: string) {
    return this.calls.filter((c) => c.model === model && (!op || c.op === op));
  }

  /** Insere linha diretamente (fábricas de teste), aplicando defaults e Decimal. */
  seed(model: string, data: Row): Row {
    const row = this.buildRow(model, data);
    this.tables[model].push(row);
    return { ...row };
  }

  // ----------------------------------------------------------- API do Prisma

  async $connect() {}
  async $disconnect() {}
  async onModuleInit() {}
  async onModuleDestroy() {}

  async $queryRaw(..._args: any[]) {
    this.calls.push({ model: '$', op: 'queryRaw', args: _args });
    if (this.queryRawFails) {
      throw new Error(
        'Can\'t reach database server at `db-internal.example:5432` (column "secret_col")',
      );
    }
    return [{ '?column?': 1 }];
  }

  async $executeRaw(...args: any[]) {
    this.calls.push({ model: '$', op: 'executeRaw', args });
    return 0;
  }

  // O segundo argumento do Prisma (opções de isolamento/timeout) não se aplica em memória
  async $transaction(arg: any) {
    this.calls.push({ model: '$', op: 'transaction', args: typeof arg });
    if (typeof arg === 'function') {
      const snapshot = this.snapshot();
      try {
        return await arg(this);
      } catch (error) {
        this.tables = snapshot; // rollback
        throw error;
      }
    }
    return Promise.all(arg);
  }

  // ------------------------------------------------------------------ internos

  private snapshot(): Record<string, Row[]> {
    return Object.fromEntries(
      Object.entries(this.tables).map(([m, rows]) => [
        m,
        rows.map((r) =>
          Object.fromEntries(
            Object.entries(r).map(([k, v]) => [k, cloneValue(v)]),
          ),
        ),
      ]),
    );
  }

  private delegate(model: string) {
    const ops = [
      'findUnique',
      'findUniqueOrThrow',
      'findFirst',
      'findFirstOrThrow',
      'findMany',
      'create',
      'createMany',
      'update',
      'updateMany',
      'upsert',
      'delete',
      'deleteMany',
      'count',
    ];
    const target: Row = {};
    for (const op of ops) {
      target[op] = async (args: any = {}) => {
        this.calls.push({ model, op, args });
        const injected = this.injections.get(`${model}.${op}`);
        if (injected) await injected(args);
        return (this as any)[`op_${op}`](model, args);
      };
    }
    return target;
  }

  private meta(model: string): ModelMeta {
    const meta = MODELS[model];
    if (!meta) throw new Error(`FakePrisma: modelo desconhecido ${model}`);
    return meta;
  }

  private toStored(model: string, field: string, value: any) {
    const meta = this.meta(model);
    if (
      meta.decimals?.includes(field) &&
      value !== null &&
      value !== undefined
    ) {
      return new Prisma.Decimal(value);
    }
    if (
      typeof value === 'string' &&
      /At$/.test(field) &&
      !Number.isNaN(Date.parse(value))
    ) {
      return new Date(value);
    }
    return value;
  }

  /**
   * Relógio estritamente crescente para createdAt. Sem ele, registros criados no mesmo
   * milissegundo (comum em máquinas rápidas) empatam na ordenação por data e a ordem
   * passa a depender da velocidade da máquina, tornando os testes instáveis.
   */
  private lastTimestamp = 0;

  private nextTimestamp(): Date {
    const t = Math.max(Date.now(), this.lastTimestamp + 1);
    this.lastTimestamp = t;
    return new Date(t);
  }

  private buildRow(model: string, data: Row): Row {
    const meta = this.meta(model);
    const now = this.nextTimestamp();
    const row: Row = { id: randomUUID(), ...meta.defaults(), createdAt: now };
    if (meta.updatedAt) row.updatedAt = now;
    for (const [field, value] of Object.entries(data)) {
      if (meta.relations[field] || value === undefined) continue;
      row[field] = this.toStored(model, field, value);
    }
    return row;
  }

  private assertUnique(model: string, row: Row, ignore?: Row) {
    const meta = this.meta(model);
    const fieldSets = [
      ...meta.unique.map((f) => [f]),
      ...Object.values(meta.compound ?? {}),
    ];
    for (const fields of fieldSets) {
      if (fields.some((f) => row[f] === null || row[f] === undefined)) continue;
      const clash = this.tables[model].find(
        (other) =>
          other !== ignore &&
          fields.every((f) => comparable(other[f]) === comparable(row[f])),
      );
      if (clash) {
        throw prismaError(
          'P2002',
          `Unique constraint failed on the fields: (${fields.map((f) => `\`${f}\``).join(',')})`,
          { modelName: model, target: fields },
        );
      }
    }
  }

  private expandWhere(model: string, where: Row = {}): Row {
    const compound = this.meta(model).compound ?? {};
    const out: Row = {};
    for (const [key, value] of Object.entries(where)) {
      if (compound[key] && isPlainObject(value)) Object.assign(out, value);
      else out[key] = value;
    }
    return out;
  }

  private related(model: string, row: Row, relName: string): Row[] {
    const rel = this.meta(model).relations[relName];
    if (rel.kind === 'one') {
      return this.tables[rel.model].filter((r) => r.id === row[rel.fk]);
    }
    return this.tables[rel.model].filter((r) => r[rel.fk] === row.id);
  }

  private matchField(value: any, filter: any): boolean {
    if (!isPlainObject(filter)) {
      return comparable(value) === comparable(filter);
    }
    const insensitive = filter.mode === 'insensitive';
    const v = comparable(value, insensitive);
    for (const [op, raw] of Object.entries(filter)) {
      if (op === 'mode') continue;
      const arg = Array.isArray(raw)
        ? raw.map((x) => comparable(x, insensitive))
        : comparable(raw, insensitive);
      switch (op) {
        case 'equals':
          if (v !== arg) return false;
          break;
        case 'not':
          if (isPlainObject(raw) ? this.matchField(value, raw) : v === arg)
            return false;
          break;
        case 'in':
          if (!(arg as any[]).includes(v)) return false;
          break;
        case 'notIn':
          if ((arg as any[]).includes(v)) return false;
          break;
        case 'lt':
          if (!(v !== null && v < arg)) return false;
          break;
        case 'lte':
          if (!(v !== null && v <= arg)) return false;
          break;
        case 'gt':
          if (!(v !== null && v > arg)) return false;
          break;
        case 'gte':
          if (!(v !== null && v >= arg)) return false;
          break;
        case 'contains':
          if (typeof v !== 'string' || !v.includes(arg)) return false;
          break;
        case 'startsWith':
          if (typeof v !== 'string' || !v.startsWith(arg)) return false;
          break;
        case 'endsWith':
          if (typeof v !== 'string' || !v.endsWith(arg)) return false;
          break;
        default:
          throw new Error(`FakePrisma: operador não suportado ${op}`);
      }
    }
    return true;
  }

  matches(model: string, row: Row, where: Row = {}): boolean {
    const meta = this.meta(model);
    for (const [key, filter] of Object.entries(
      this.expandWhere(model, where),
    )) {
      if (filter === undefined) continue;
      if (key === 'AND') {
        const list = Array.isArray(filter) ? filter : [filter];
        if (!list.every((w) => this.matches(model, row, w))) return false;
      } else if (key === 'OR') {
        if (!(filter as Row[]).some((w) => this.matches(model, row, w)))
          return false;
      } else if (key === 'NOT') {
        const list = Array.isArray(filter) ? filter : [filter];
        if (list.some((w) => this.matches(model, row, w))) return false;
      } else if (meta.relations[key]) {
        const rel = meta.relations[key];
        const rows = this.related(model, row, key);
        if (rel.kind === 'many') {
          const f = filter as Row;
          if (f.some && !rows.some((r) => this.matches(rel.model, r, f.some)))
            return false;
          if (
            f.every &&
            !rows.every((r) => this.matches(rel.model, r, f.every))
          )
            return false;
          if (f.none && rows.some((r) => this.matches(rel.model, r, f.none)))
            return false;
        } else {
          const f = filter as Row;
          if (f === null) {
            if (rows.length) return false;
            continue;
          }
          const inner = f.is ?? f;
          if (!rows[0] || !this.matches(rel.model, rows[0], inner))
            return false;
        }
      } else if (!this.matchField(row[key], filter)) {
        return false;
      }
    }
    return true;
  }

  private sort(model: string, rows: Row[], orderBy: any): Row[] {
    if (!orderBy) return rows;
    const specs: Row[] = Array.isArray(orderBy) ? orderBy : [orderBy];
    return [...rows].sort((a, b) => {
      for (const spec of specs) {
        for (const [field, dirRaw] of Object.entries(spec)) {
          const dir =
            typeof dirRaw === 'object' ? (dirRaw as Row).sort : dirRaw;
          const av = comparable(a[field]);
          const bv = comparable(b[field]);
          if (av === bv) continue;
          const cmp = av === null ? -1 : bv === null ? 1 : av < bv ? -1 : 1;
          return dir === 'desc' ? -cmp : cmp;
        }
      }
      return 0;
    });
  }

  private find(model: string, args: Row): Row[] {
    let rows = this.tables[model].filter((r) =>
      this.matches(model, r, args.where),
    );
    rows = this.sort(model, rows, args.orderBy);
    if (args.skip) rows = rows.slice(args.skip);
    if (args.take !== undefined) rows = rows.slice(0, args.take);
    return rows;
  }

  private scalars(model: string, row: Row): Row {
    const relations = this.meta(model).relations;
    const out: Row = {};
    for (const [k, v] of Object.entries(row)) {
      if (!relations[k]) out[k] = cloneValue(v);
    }
    return out;
  }

  private relationValue(model: string, row: Row, relName: string, spec: any) {
    const rel = this.meta(model).relations[relName];
    let rows = this.related(model, row, relName);
    const nested = isPlainObject(spec) ? spec : {};
    if (rel.kind === 'many') {
      rows = rows.filter((r) => this.matches(rel.model, r, nested.where));
      rows = this.sort(rel.model, rows, nested.orderBy);
      if (nested.skip) rows = rows.slice(nested.skip);
      if (nested.take !== undefined) rows = rows.slice(0, nested.take);
      return rows.map((r) => this.project(rel.model, r, nested));
    }
    return rows[0] ? this.project(rel.model, rows[0], nested) : null;
  }

  private countValue(model: string, row: Row, spec: any): Row {
    const relations = this.meta(model).relations;
    const selected =
      isPlainObject(spec) && isPlainObject(spec.select)
        ? Object.keys(spec.select).filter((k) => spec.select[k])
        : Object.keys(relations).filter((k) => relations[k].kind === 'many');
    const out: Row = {};
    for (const relName of selected) {
      const rel = relations[relName];
      const where = isPlainObject(spec?.select?.[relName])
        ? spec.select[relName].where
        : undefined;
      out[relName] = this.related(model, row, relName).filter((r) =>
        this.matches(rel.model, r, where),
      ).length;
    }
    return out;
  }

  project(model: string, row: Row, args: Row = {}): Row {
    const relations = this.meta(model).relations;
    if (args.select) {
      const out: Row = {};
      for (const [key, spec] of Object.entries(args.select)) {
        if (!spec) continue;
        if (key === '_count') out._count = this.countValue(model, row, spec);
        else if (relations[key])
          out[key] = this.relationValue(model, row, key, spec);
        else out[key] = cloneValue(row[key]);
      }
      return out;
    }
    const out = this.scalars(model, row);
    for (const [key, spec] of Object.entries(args.include ?? {})) {
      if (!spec) continue;
      if (key === '_count') out._count = this.countValue(model, row, spec);
      else out[key] = this.relationValue(model, row, key, spec);
    }
    return out;
  }

  private applyScalarUpdate(
    model: string,
    row: Row,
    field: string,
    value: any,
  ) {
    if (isPlainObject(value)) {
      const current = comparable(row[field]) ?? 0;
      if ('set' in value) row[field] = this.toStored(model, field, value.set);
      else if ('increment' in value)
        row[field] = this.toStored(
          model,
          field,
          current + Number(value.increment),
        );
      else if ('decrement' in value)
        row[field] = this.toStored(
          model,
          field,
          current - Number(value.decrement),
        );
      else if ('multiply' in value)
        row[field] = this.toStored(
          model,
          field,
          current * Number(value.multiply),
        );
      else if ('divide' in value)
        row[field] = this.toStored(
          model,
          field,
          current / Number(value.divide),
        );
      else
        throw new Error(
          `FakePrisma: update não suportado em ${model}.${field}`,
        );
      return;
    }
    row[field] = this.toStored(model, field, value);
  }

  private nestedWrites(model: string, row: Row, data: Row) {
    const relations = this.meta(model).relations;
    for (const [relName, spec] of Object.entries(data)) {
      const rel = relations[relName];
      if (!rel || !isPlainObject(spec)) continue;
      if (rel.kind === 'one') {
        if (spec.connect) {
          const target = this.tables[rel.model].find((r) =>
            this.matches(rel.model, r, spec.connect),
          );
          if (!target)
            throw prismaError('P2025', 'Record to connect not found');
          row[rel.fk] = target.id;
        }
        continue;
      }
      const creates = [
        ...(spec.create
          ? Array.isArray(spec.create)
            ? spec.create
            : [spec.create]
          : []),
        ...(spec.createMany?.data ?? []),
      ];
      if (spec.deleteMany !== undefined) {
        const where = isPlainObject(spec.deleteMany) ? spec.deleteMany : {};
        const victims = this.tables[rel.model].filter(
          (r) => r[rel.fk] === row.id && this.matches(rel.model, r, where),
        );
        victims.forEach((v) => this.cascadeDelete(rel.model, v));
      }
      for (const child of creates) {
        this.insert(rel.model, { ...child, [rel.fk]: row.id });
      }
    }
  }

  private insert(model: string, data: Row): Row {
    const row = this.buildRow(model, data);
    // fk de relação "one" via connect
    this.nestedWrites(
      model,
      row,
      Object.fromEntries(
        Object.entries(data).filter(
          ([k]) => this.meta(model).relations[k]?.kind === 'one',
        ),
      ),
    );
    this.assertUnique(model, row);
    this.tables[model].push(row);
    this.nestedWrites(
      model,
      row,
      Object.fromEntries(
        Object.entries(data).filter(([k]) => {
          const rel = this.meta(model).relations[k];
          return rel && rel.kind !== 'one';
        }),
      ),
    );
    return row;
  }

  private cascadeDelete(model: string, row: Row) {
    const relations = this.meta(model).relations;
    for (const [relName, rel] of Object.entries(relations)) {
      if (rel.kind === 'one') continue;
      for (const child of this.related(model, row, relName)) {
        this.cascadeDelete(rel.model, child);
      }
    }
    this.tables[model] = this.tables[model].filter((r) => r !== row);
  }

  private updateRow(model: string, row: Row, data: Row) {
    const meta = this.meta(model);
    const candidate: Row = { ...row };
    for (const [field, value] of Object.entries(data)) {
      if (value === undefined || meta.relations[field]) continue;
      this.applyScalarUpdate(model, candidate, field, value);
    }
    if (meta.updatedAt) candidate.updatedAt = new Date();
    this.assertUnique(model, candidate, row);
    Object.assign(row, candidate);
    this.nestedWrites(model, row, data);
  }

  // ------------------------------------------------------------- operações

  private op_findUnique(model: string, args: Row) {
    const row = this.find(model, args)[0];
    return row ? this.project(model, row, args) : null;
  }

  private op_findUniqueOrThrow(model: string, args: Row) {
    const row = this.find(model, args)[0];
    if (!row) throw prismaError('P2025', 'No record found');
    return this.project(model, row, args);
  }

  private op_findFirst(model: string, args: Row) {
    return this.op_findUnique(model, args);
  }

  private op_findFirstOrThrow(model: string, args: Row) {
    return this.op_findUniqueOrThrow(model, args);
  }

  private op_findMany(model: string, args: Row) {
    return this.find(model, args).map((r) => this.project(model, r, args));
  }

  private op_count(model: string, args: Row) {
    return this.find(model, { where: args.where }).length;
  }

  private op_create(model: string, args: Row) {
    return this.project(model, this.insert(model, args.data ?? {}), args);
  }

  private op_createMany(model: string, args: Row) {
    let count = 0;
    for (const data of args.data ?? []) {
      try {
        this.insert(model, data);
        count++;
      } catch (error) {
        if (!(args.skipDuplicates && (error as any)?.code === 'P2002'))
          throw error;
      }
    }
    return { count };
  }

  private op_update(model: string, args: Row) {
    const row = this.tables[model].find((r) =>
      this.matches(model, r, args.where),
    );
    if (!row) {
      throw prismaError(
        'P2025',
        'An operation failed because it depends on one or more records that were required but not found. Record to update not found.',
        { modelName: model },
      );
    }
    this.updateRow(model, row, args.data ?? {});
    return this.project(model, row, args);
  }

  private op_updateMany(model: string, args: Row) {
    const rows = this.tables[model].filter((r) =>
      this.matches(model, r, args.where),
    );
    rows.forEach((r) => this.updateRow(model, r, args.data ?? {}));
    return { count: rows.length };
  }

  private op_upsert(model: string, args: Row) {
    const row = this.tables[model].find((r) =>
      this.matches(model, r, args.where),
    );
    if (row) {
      this.updateRow(model, row, args.update ?? {});
      return this.project(model, row, args);
    }
    return this.project(model, this.insert(model, args.create ?? {}), args);
  }

  private op_delete(model: string, args: Row) {
    const row = this.tables[model].find((r) =>
      this.matches(model, r, args.where),
    );
    if (!row) {
      throw prismaError(
        'P2025',
        'An operation failed because it depends on one or more records that were required but not found. Record to delete does not exist.',
        { modelName: model },
      );
    }
    const projected = this.project(model, row, args);
    this.cascadeDelete(model, row);
    return projected;
  }

  private op_deleteMany(model: string, args: Row) {
    const rows = this.tables[model].filter((r) =>
      this.matches(model, r, args.where),
    );
    rows.forEach((r) => this.cascadeDelete(model, r));
    return { count: rows.length };
  }
}
