/**
 * Relatório de métricas do OCR (sucesso, p50/p95 e custo) e comparação com um baseline.
 *
 * SÓ LEITURA. Nunca escreve no banco. Uso (na pasta backend):
 *
 *   npm run ocr:report -- --file linhas.json
 *   npm run ocr:report -- --db --since 2026-11-01 --until 2026-11-08 --save semana1.json
 *   npm run ocr:report -- --db --since 2026-11-08 --baseline semana1.json
 *
 * Fontes das linhas (escolha uma):
 *   --file <arquivo>   JSON com um array de linhas de ocr_run_metrics (ver docs/dev/ocr-metricas-comparacao.md)
 *   --db               lê ocr_run_metrics pelo Prisma (precisa de DATABASE_URL); só SELECT, só colunas
 *                      de medição: não lê billId, userId, erros nem texto da nota
 * Opções:
 *   --since <data>     (--db) início, em UTC, inclusive. Ex.: 2026-11-01 ou 2026-11-01T00:00:00Z
 *   --until <data>     (--db) fim, em UTC, exclusivo
 *   --baseline <arq>   relatório salvo antes com --save; imprime a comparação
 *   --save <arq>       grava o relatório em JSON (vira o baseline de uma próxima comparação)
 *   --json             imprime JSON em vez de Markdown
 */
import { readFileSync, writeFileSync } from 'fs';
import {
  buildOcrReport,
  compareOcrReports,
  parseOcrRunRows,
  parseSavedOcrReport,
  renderComparisonMarkdown,
  renderOcrReportMarkdown,
} from '../src/ocr/ocr-report';
import { loadOcrRunRows } from '../src/ocr/ocr-report-query';

interface Args {
  file?: string;
  db: boolean;
  since?: string;
  until?: string;
  baseline?: string;
  save?: string;
  json: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { db: false, json: false };
  const valueOf = (index: number, name: string): string => {
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`A opção ${name} precisa de um valor.`);
    }
    return value;
  };

  for (let i = 0; i < argv.length; i += 1) {
    const name = argv[i];
    switch (name) {
      case '--file':
        args.file = valueOf(i++, name);
        break;
      case '--since':
        args.since = valueOf(i++, name);
        break;
      case '--until':
        args.until = valueOf(i++, name);
        break;
      case '--baseline':
        args.baseline = valueOf(i++, name);
        break;
      case '--save':
        args.save = valueOf(i++, name);
        break;
      case '--db':
        args.db = true;
        break;
      case '--json':
        args.json = true;
        break;
      default:
        throw new Error(`Opção desconhecida: ${name}`);
    }
  }

  if (args.file && args.db) {
    throw new Error('Use --file ou --db, não os dois.');
  }
  if (!args.file && !args.db) {
    throw new Error('Informe a fonte das linhas: --file <arquivo> ou --db.');
  }
  if (args.file && (args.since || args.until)) {
    throw new Error('--since e --until só valem com --db.');
  }
  return args;
}

function parseDate(text: string, name: string): Date {
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${name} não é uma data válida: ${text}`);
  }
  return date;
}

async function loadFromDb(args: Args): Promise<unknown[]> {
  // Import dinâmico: o modo --file não carrega o Prisma nem o motor do banco
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  try {
    return await loadOcrRunRows(prisma, {
      since: args.since ? parseDate(args.since, '--since') : undefined,
      until: args.until ? parseDate(args.until, '--until') : undefined,
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const rawRows: unknown = args.file
    ? JSON.parse(readFileSync(args.file, 'utf8'))
    : await loadFromDb(args);

  const report = buildOcrReport(parseOcrRunRows(rawRows));

  if (args.save) {
    writeFileSync(args.save, JSON.stringify(report, null, 2) + '\n');
  }

  const comparison = args.baseline
    ? compareOcrReports(
        parseSavedOcrReport(JSON.parse(readFileSync(args.baseline, 'utf8'))),
        report,
      )
    : null;

  if (args.json) {
    console.log(
      JSON.stringify(comparison ? { report, comparison } : report, null, 2),
    );
    return;
  }

  console.log('# Relatório de métricas do OCR\n');
  console.log(renderOcrReportMarkdown(report));
  if (comparison) {
    console.log('\n## Comparação com o baseline\n');
    console.log(renderComparisonMarkdown(comparison));
  }
}

main().catch((error: unknown) => {
  console.error(
    `Erro: ${error instanceof Error ? error.message : 'falha desconhecida'}`,
  );
  process.exitCode = 1;
});
