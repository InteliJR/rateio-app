# OCR: comparação de sucesso, p50/p95 e custo com o baseline

| Campo | Valor |
| --- | --- |
| Escopo | Semana 5, P1, task 1: comparar sucesso, p50/p95 e custo com o baseline |
| Estado | **Sem dados reais.** O que existe é a ferramenta de cálculo (testada com linhas fictícias) e a comparação de chamadas à OpenAI por cenário, medida por teste. Nenhum número de produção foi medido |
| Vale para | O código da pilha de OCR depois de mergeada e das migrações aplicadas até `20261022000000_add_ocr_run_metrics`. Antes disso, a tabela `ocr_run_metrics` não existe |
| Última revisão | 10/11/2026 |

## 1. O que é o "baseline"

Nunca houve uma medição de OCR em ambiente real: o baseline de qualidade de 14/10/2026 registrou que a duração da fila e de uma leitura **não foi medida**, e a medição da Semana 1 ficou pendente. Por isso:

- **Baseline de comportamento:** o que o código fazia antes das correções da Semana 5, medido por teste (seção 5).
- **Baseline de números reais:** a **primeira medição real** vira o baseline. Quem tiver o ambiente roda o relatório, salva com `--save` e as medições seguintes são comparadas com ele (seção 3).

## 2. Definições (as mesmas do código, em `ocr-report.ts`)

- **Execução:** uma linha de `ocr_run_metrics`. Linhas `DISCARDED` (execução que perdeu o trabalho, ou cujo resultado já não vale) ficam fora de todas as contas e só são contadas à parte.
- **Leitura:** as execuções de um mesmo `ocrJobId`, em ordem de `startedAt`, até uma que termina em `COMPLETED` ou `FAILED_FINAL`. Um trabalho recriado (nova leitura da mesma conta) gera outra leitura. Execuções sem desfecho final são leituras **em andamento** e ficam fora da taxa de sucesso.
- **Taxa de sucesso:** por leitura (concluídas / terminais) e por execução (concluídas / execuções).
- **Percentil:** posto mais próximo (*nearest-rank*): com `n` valores ordenados, o percentil `p` é o valor na posição `ceil(p × n / 100)`. Não interpola. O `percentile_cont` do SQL interpola, então os dois podem diferir um pouco.
- **Tempos:** `queueWaitMs` (espera na fila), `openaiMs` (chamada à OpenAI, incluindo as esperas entre as tentativas do serviço) e `totalMs` (execução inteira). Valores `null` são ignorados, não contados como 0. Cada tempo sai em dois recortes: todas as execuções e só as concluídas.
- **Custo:** estimado (`ocr-pricing.ts`), em micro-dólares inteiros para somar sem erro de ponto flutuante. Custo ausente é `null`, nunca 0. Modelos e versões de preço diferentes nunca entram no mesmo número.
  - Custo médio por leitura concluída = soma dos custos **conhecidos** das execuções da leitura (do mesmo modelo e versão da execução final), dividida pelas leituras concluídas com custo conhecido.
  - Tentativas que falharam **sem resposta** (sem tokens) não têm custo e ficam de fora. O custo pode, portanto, estar abaixo do real quando houve cobrança sem resposta aproveitável.

## 3. Como rodar

Na pasta `backend`. O script é **só leitura**: nunca escreve no banco, e no modo `--db` lê só as colunas de medição (não lê `billId`, `userId`, mensagens de erro nem texto da nota).

```bash
npm run ocr:report -- --file linhas.json
```

```bash
npm run ocr:report -- --db --since 2026-11-01 --until 2026-11-08 --save semana1.json
```

```bash
npm run ocr:report -- --db --since 2026-11-08 --baseline semana1.json
```

- `--file`: JSON com um array de linhas de `ocr_run_metrics` (campos: `ocrJobId`, `attempt`, `startedAt`, `outcome`, `errorCategory`, `model`, `pricingVersion`, `queueWaitMs`, `openaiMs`, `totalMs`, `estimatedCostUsd`). Linha inválida é contada como ignorada, sem derrubar o relatório.
- `--db`: lê pelo Prisma (precisa de `DATABASE_URL`). `--since` é inclusivo e `--until` é exclusivo, ambos em UTC.
- `--save`: grava o relatório em JSON. É o arquivo usado como baseline depois.
- `--baseline`: imprime a comparação, com diferença absoluta e variação percentual. Falta de dado aparece como `—`, nunca como 0.
- A comparação **avisa** quando há menos de 30 leituras terminais, menos de 20 execuções concluídas (o p95 vira praticamente o máximo) ou quando o conjunto de modelo e versão de preço difere entre os dois lados.

## 4. SQL equivalente (para quem não roda o script)

**Não foram executadas em Postgres.** Os nomes de tabela e coluna foram conferidos contra o `schema.prisma`. Os valores de data são exemplos.

**Q1. Desfechos e categorias (sem `DISCARDED`)**

```sql
SELECT outcome, "errorCategory", count(*) AS execucoes
FROM ocr_run_metrics
WHERE "startedAt" >= TIMESTAMP '2026-11-01'
  AND "startedAt" <  TIMESTAMP '2026-11-08'
  AND outcome <> 'DISCARDED'
GROUP BY outcome, "errorCategory"
ORDER BY execucoes DESC;
```

**Q2. p50 e p95 (interpolados, diferem um pouco do script)**

```sql
SELECT
  count(*) FILTER (WHERE outcome = 'COMPLETED') AS concluidas,
  percentile_cont(0.5)  WITHIN GROUP (ORDER BY "queueWaitMs") AS fila_p50_ms,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY "queueWaitMs") AS fila_p95_ms,
  percentile_cont(0.5)  WITHIN GROUP (ORDER BY "openaiMs") FILTER (WHERE outcome = 'COMPLETED') AS openai_p50_ms,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY "openaiMs") FILTER (WHERE outcome = 'COMPLETED') AS openai_p95_ms,
  percentile_cont(0.5)  WITHIN GROUP (ORDER BY "totalMs")  FILTER (WHERE outcome = 'COMPLETED') AS total_p50_ms,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY "totalMs")  FILTER (WHERE outcome = 'COMPLETED') AS total_p95_ms
FROM ocr_run_metrics
WHERE "startedAt" >= TIMESTAMP '2026-11-01'
  AND "startedAt" <  TIMESTAMP '2026-11-08'
  AND outcome <> 'DISCARDED';
```

**Q3. Custo por modelo e versão de preço (nunca misturar)**

```sql
SELECT model, "pricingVersion",
       count(*) AS execucoes,
       count("estimatedCostUsd") AS com_custo,
       sum("estimatedCostUsd") AS custo_total_usd
FROM ocr_run_metrics
WHERE "startedAt" >= TIMESTAMP '2026-11-01'
  AND "startedAt" <  TIMESTAMP '2026-11-08'
  AND outcome <> 'DISCARDED'
GROUP BY model, "pricingVersion"
ORDER BY model, "pricingVersion";
```

**Q4. Taxa de sucesso por leitura (aproximada: uma leitura por trabalho)**

```sql
SELECT count(*) FILTER (WHERE outcome = 'COMPLETED') AS concluidas,
       count(*) AS leituras_terminais
FROM (
  SELECT DISTINCT ON ("ocrJobId") "ocrJobId", outcome
  FROM ocr_run_metrics
  WHERE outcome IN ('COMPLETED', 'FAILED_FINAL')
    AND "startedAt" >= TIMESTAMP '2026-11-01'
    AND "startedAt" <  TIMESTAMP '2026-11-08'
  ORDER BY "ocrJobId", "startedAt" DESC
) ultimas;
```

A Q4 conta uma leitura por trabalho (a última com desfecho final). O script conta uma leitura por desfecho final, então um trabalho recriado vale duas leituras no script e uma na Q4.

## 5. Comparação por cenário: chamadas à OpenAI

Medida **por teste**, com o cliente real do SDK e o `fetch` trocado por um mock (cada chamada HTTP conta uma). "Antes" é o commit `220a304` (topo da pilha antes da Semana 5); "depois" é `9a35579` (com `OPENAI_TIMEOUT_MS` e `maxRetries: 0`).

| Cenário | Chamadas por execução, antes | Chamadas por execução, depois | Chamadas por leitura, antes | Chamadas por leitura, depois | Como foi obtido |
| --- | ---: | ---: | ---: | ---: | --- |
| HTTP 500 persistente | 9 | 3 | 27 | 9 | Medido (ambos) |
| HTTP 429 persistente | 9 | 3 | 27 | 9 | Medido (ambos) |
| Queda de conexão | 9 | 3 | 27 | 9 | Medido (ambos) |
| HTTP 400 ou 401 | 1 | 1 | 3 | 3 | Medido (ambos); a fila retenta mesmo assim (ver abaixo) |
| HTTP 403 | 1 | 1 | 3 | 3 | Pelo código: segue o mesmo caminho do 401 |
| Timeout da OpenAI | até 9, cada uma até 10 min | 3, cada uma até 30 s | 27 | 9 | **Depois: medido** (3 chamadas, abortadas pelo timeout, classificadas `TIMEOUT`). **Antes: pelo código** (padrão do SDK de 10 min), não medido |

- **Por leitura** = execuções × 3, porque a fila retenta até `OCR_QUEUE_MAX_ATTEMPTS` (padrão 3) **sem olhar a categoria do erro**: um 400 ou 401 também gasta as 3 execuções (achado F3, ainda aberto). É o pior caso, quando todas as execuções falham.
- **Tempo de uma execução, no pior caso:** antes, sem limite prático (até 9 chamadas de 10 min). Depois, 3 × 30 s + 2 × 10 s de espera = 110 s, que cabe no lock de 120 s da fila. Um teste confere essa conta.
- **Custo:** o custo estimado só existe quando a resposta volta com tokens. Menos chamadas por erro não muda o custo de uma leitura que dá certo; reduz o número de tentativas que **poderiam** ser cobradas pela OpenAI sem produzir resultado. Esse efeito só aparece em dado real.

## 6. Espaço para dados reais

Preencher quando houver ambiente com banco, cron e chave da OpenAI. A primeira linha medida é o baseline.

| Medida | Baseline (1ª medição real) | Depois das correções | Diferença | Período e quem mediu |
| --- | ---: | ---: | ---: | --- |
| Leituras terminais | _pendente_ | _pendente_ | | |
| Taxa de sucesso por leitura | _pendente_ | _pendente_ | | |
| Execuções por leitura (média) | _pendente_ | _pendente_ | | |
| Espera na fila p50 / p95 | _pendente_ | _pendente_ | | |
| OpenAI p50 / p95 (concluídas) | _pendente_ | _pendente_ | | |
| Total p50 / p95 (concluídas) | _pendente_ | _pendente_ | | |
| Custo médio por leitura concluída (USD, por modelo e versão) | _pendente_ | _pendente_ | | |
| Falhas por categoria | _pendente_ | _pendente_ | | |

| Verificação | Como | Resultado |
| --- | --- | --- |
| O script lê `ocr_run_metrics` sem erro | `npm run ocr:report -- --db --since ...` | _pendente_ |
| As consultas Q1 a Q4 rodam sem erro | Editor SQL do Supabase | _pendente_ |
| O p50/p95 do script e o da Q2 ficam próximos | Comparar os dois | _pendente_ |
| O `OPENAI_TIMEOUT_MS` de 30 s é adequado | p95 de `openaiMs` das leituras concluídas bem abaixo de 30 s | _pendente_ |

## 7. Limitações

- Nenhum número de produção: o relatório foi validado só com linhas fictícias e resultados calculados à mão. O modo `--db` foi testado só com um cliente falso (colunas lidas, filtro de datas, conversão do custo), não contra um Postgres.
- A tabela `ocr_run_metrics` é gravada em melhor esforço: uma falha ao gravar não derruba a leitura, então pode faltar linha. A taxa de sucesso é a das linhas que existem.
- O custo é estimado e não aplica desconto de cache nem de Batch.
- Execuções que perdem o lock gravam uma linha `DISCARDED` e uma linha de lock vencido com o mesmo `attempt`; por isso as contas filtram por `outcome` e nunca contam linhas por `attempt`.
