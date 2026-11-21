# Runbook: falha e fila parada do OCR

| Campo | Valor |
| --- | --- |
| Escopo | Leitura de notas por IA: fila `ocr_jobs`, chamada à OpenAI, métricas por execução e liquidação de créditos ligada à leitura |
| Vale para | O código da pilha de OCR (métricas, idempotência, métricas por execução, créditos e lock vencido) **depois de mergeada** e com as migrações aplicadas até `20261029000000_add_ocr_job_credit_run`. Antes disso, as consultas que usam `ocr_run_metrics`, `imageKey` e `creditRun` não funcionam |
| Responsável pelo OCR | Lucas Cunha |
| Responsável pelo ledger de créditos | Lucas Delmirio |
| Quem administra Vercel e Supabase | _a definir_ |
| Canal de incidente | _a definir_ |
| Estado | **Não exercitado.** Escrito a partir do código; nenhum passo foi executado em ambiente real (ver seção 9) |
| Última revisão | 10/11/2026 |

Este documento cobre só o OCR. O runbook geral de incidentes previsto no EPIC-00 (E00-T08) é `docs/dev/runbook-incidentes.md`.

## 1. Como a fila funciona (o mínimo para o plantão)

- Ao enviar a foto, a conta é criada em `PENDING_OCR` junto com um trabalho em `ocr_jobs` (`PENDING`). A criação manual de conta não passa pela fila e continua funcionando com o OCR fora do ar.
- **Na Vercel**, quem processa a fila é o cron do `backend/vercel.json`: `GET /internal/ocr/process-pending` a cada minuto (`* * * * *`). O disparo logo após o envio é desligado quando a variável `VERCEL` existe. **Fora da Vercel** (local), um `@Cron` roda a cada 10 s e o envio também dispara o processamento.
- Cada chamada processa no máximo `OCR_QUEUE_MAX_JOBS_PER_RUN` trabalhos (padrão 1 na Vercel), um depois do outro. Antes, ela trata os trabalhos com lock vencido. Teto teórico na Vercel com os padrões: cerca de 1 leitura por minuto; uma rajada de N envios faz o último esperar perto de N minutos. É conta feita a partir do código, não medição.
- O processador "reivindica" o trabalho (`RUNNING`, `attempts + 1`, `lockedAt`). O valor novo de `attempts` identifica a execução: só ela pode gravar o resultado ou a falha.
- Falha com tentativas sobrando: o trabalho volta a `PENDING` com `availableAt` = agora + `OCR_QUEUE_RETRY_DELAY_MS` (30 s). Falha final (`attempts` chegou a `OCR_QUEUE_MAX_ATTEMPTS`, padrão 3): trabalho `FAILED` e conta `OCR_FAILED`. A conta só vira `OCR_FAILED` na falha final.
- Lock vencido (`RUNNING` há mais de `OCR_QUEUE_LOCK_TIMEOUT_MS`, padrão 120 s): com tentativas sobrando, volta a `PENDING` e grava métrica `TIMEOUT`; sem tentativas, vira `FAILED`, a conta vira `OCR_FAILED`, a métrica sai com `EXHAUSTED` e o crédito é liberado.
- O usuário pode pedir nova leitura de uma conta `OCR_FAILED` pelo app (`POST /bills/:id/retry-ocr`, com o token dele; limite de 1 pedido a cada 5 minutos). O suporte não consegue chamar essa rota em nome do usuário.
- Com `CREDITS_ENFORCEMENT_ENABLED=true`, um crédito é reservado ao enfileirar, consumido quando a leitura é utilizável e liberado na falha. Com a bandeira desligada (padrão), o ledger não é tocado. A bandeira é lida quando o serviço sobe: mudar o valor exige novo deploy.

## 2. Onde olhar

| Ferramenta | Acesso | O que mostra | Limitações |
| --- | --- | --- | --- |
| `GET /health` | Público | Banco (`connected` ou `disconnected`) e resumo da fila: contagem por status (`pending`, `running`, `failed`, `completed`) e a configuração em uso | Não mostra a idade do trabalho mais antigo. `activeWorkers` é de uma instância só e não serve na Vercel |
| `GET /internal/ocr/queue` | Cabeçalho `Authorization: Bearer <CRON_SECRET>` ou `x-internal-cron-secret` (aceita `CRON_SECRET` ou `INTERNAL_CRON_SECRET`) | O mesmo resumo da fila | Responde 403 se nenhum dos dois segredos estiver configurado |
| `POST /internal/ocr/process-pending` | Mesmo segredo | Processa a fila uma vez, como o cron; devolve `{ processed, activeWorkers }` | Ver os cuidados no cenário A |
| Logs da Vercel | Painel da Vercel | `OCR_METRIC` (`stage` `openai` e `job`), `Released N stale OCR job lock(s).`, `STALE_LOCK_FAILED`, `CREDIT_SETTLED`, `CREDIT_SETTLE_FAILED`, `Não foi possível gravar a métrica da execução do OCR`, `OCR failed for bill ...` | Ver "Cuidados" abaixo |
| Tabela `ocr_run_metrics` | SQL de leitura no Supabase | Uma linha por execução: desfecho, categoria do erro, status HTTP, tempos, tokens e custo estimado | Gravação em melhor esforço: uma falha ao gravar não derruba a leitura, então pode faltar linha |
| `GET /metrics` | `Authorization: Bearer <METRICS_TOKEN>`; sem `METRICS_TOKEN` configurado responde 404 | Contadores em memória | Em memória e por instância: na Vercel cada instância tem a sua e tudo zera a cada reinício. Não usar para decidir |

**Cuidados com dados:**

- `ocr_jobs.lastError`, a linha `OCR failed for bill ...` e os logs `[OCR_RETRY]` e `[OCR_ERROR]` guardam a mensagem de erro original. Os logs `[OCR_RETRY]` e `[OCR_ERROR]` também gravam a URL assinada da imagem, que vale 1 hora. **Não copie esses campos para o canal do incidente nem para tickets.** Para diagnóstico, use `errorCategory`, `httpStatus` e `errorCode` de `ocr_run_metrics`, que não guardam conteúdo.
- As consultas da seção 7 são só de leitura. **Não altere `ocr_jobs`, `credit_reservations` nem `credit_transactions` por SQL** (ver "O que não fazer" em cada cenário).
- As colunas de data são `TIMESTAMP` sem fuso, gravadas em UTC. As consultas usam `now() AT TIME ZONE 'UTC'` para não depender do fuso da sessão.

## 3. Triagem (primeiros 5 minutos)

1. Abra `GET /health`. Se `database.status` não for `connected`, o problema é o banco, não o OCR: siga o runbook geral.
2. Rode a consulta Q1 (profundidade e idade da fila) e a Q4 (última execução).
3. Rode a Q5 (desfechos e categorias da última hora).
4. Escolha o cenário:

| O que você vê | Cenário |
| --- | --- |
| `PENDING` prontos acumulando e nenhuma execução nova há mais de 3 minutos (Q2 e Q4) | A. Fila parada |
| Trabalhos em `RUNNING` com lock vencido que não saem do lugar (Q3) | B. Trabalhos presos |
| Execuções acontecendo, mas a maioria termina em `RETRY_SCHEDULED` ou `FAILED_FINAL` (Q5) | C. Falha em massa |
| Reclamação de crédito descontado sem leitura, ou `CREDIT_SETTLE_FAILED` nos logs (só com cobrança ligada) | D. Créditos presos |

Mais de um cenário pode valer ao mesmo tempo (por exemplo, C causando B). Comece pelo que impede a fila de andar (A, depois B).

## 4. Cenários

### A. Fila parada (o cron não dispara ou falha)

**Sintomas:** contas ficam em "lendo" no app; Q2 mostra trabalhos prontos com espera crescente; Q4 mostra a última execução há vários minutos.

**Diagnóstico:**

1. No painel da Vercel, aba de cron jobs: o cron de `/internal/ocr/process-pending` está ativo e é chamado a cada minuto? Pela documentação da Vercel, crons só rodam no deploy de produção e a frequência permitida depende do plano (_a confirmar no painel_).
2. Nos logs da Vercel, filtre por `/internal/ocr/process-pending`:
   - **403** com `INTERNAL_CRON_SECRET or CRON_SECRET is not configured.`: nenhum dos segredos está nas variáveis de ambiente;
   - **403** com `Invalid internal credential.`: o segredo não confere. A Vercel envia `Authorization: Bearer <CRON_SECRET>` quando `CRON_SECRET` está configurado (_comportamento da Vercel a confirmar no painel_);
   - **5xx ou tempo esgotado:** a função falhou ou passou do tempo máximo. Veja se há erro de banco ou de Prisma no mesmo horário.
3. Rode a Q1. Muitos `RUNNING` com lock vencido e nenhum avanço: é o cenário B junto.

**Contenção:**

- Avise que a leitura por foto está lenta ou parada e que a criação manual funciona (seção 5).
- Para esvaziar a fila enquanto o cron não volta, chame `POST /internal/ocr/process-pending` com o segredo. Cada chamada processa até `OCR_QUEUE_MAX_JOBS_PER_RUN` trabalhos. Faça chamadas espaçadas (uma por vez, esperando a resposta): várias em paralelo viram várias instâncias chamando a OpenAI ao mesmo tempo.

**Recuperação:**

- Segredo ausente ou errado: corrija `CRON_SECRET` (e `INTERNAL_CRON_SECRET`, se usado) na Vercel e faça novo deploy. Variável de ambiente nova só vale depois de um deploy.
- Cron desativado ou fora do plano: reative no painel ou ajuste o plano (decisão de quem administra a Vercel).
- Função passando do tempo: veja o cenário B e a seção 10 (falta de timeout na chamada à OpenAI).
- Fila grande depois da volta: com 1 trabalho por minuto, o atraso cai devagar. Subir `OCR_QUEUE_MAX_JOBS_PER_RUN` acelera, mas os trabalhos rodam em sequência dentro de uma chamada e o total precisa caber no tempo máximo da função. Só suba com esse tempo confirmado no painel, e lembre que exige novo deploy.

**Encerramento:** a Q2 volta a zero (ou a espera máxima fica abaixo de 2 minutos) e a Q4 mostra execuções a cada minuto por 15 minutos seguidos.

**O que não fazer:** não chamar `process-pending` em laço ou em paralelo; não mudar `status` de trabalho por SQL.

### B. Trabalhos presos em `RUNNING`

**Sintomas:** a Q3 lista trabalhos em `RUNNING` com lock mais velho que `OCR_QUEUE_LOCK_TIMEOUT_MS`.

**Como o sistema se recupera sozinho:** cada execução do cron começa tratando os locks vencidos (seção 1). Com o cron rodando, um trabalho preso sai de `RUNNING` em até cerca de 1 minuto depois de o lock vencer. Se ele continua preso, o cron não está rodando (cenário A) ou a atualização está falhando (`STALE_LOCK_FAILED` nos logs).

**Diagnóstico:**

1. Q4: há execuções recentes? Se não, é o cenário A.
2. Logs `STALE_LOCK_FAILED`: trazem só `jobId` e `errorName`. Erro repetido no mesmo trabalho indica problema de banco nesse registro; acione o responsável pelo OCR.
3. Q5 com muitas linhas `TIMEOUT`: as execuções estão demorando mais que o lock. Causas prováveis: OpenAI lenta, ou a função da Vercel encerrada no meio da execução (ver seção 10, sem timeout na chamada à OpenAI).

**Contenção e recuperação:**

- Com o cron rodando, não é preciso intervir: o trabalho volta a `PENDING` ou, se já esgotou as tentativas, vira `FAILED` e a conta vira `OCR_FAILED`. O usuário pode pedir nova leitura pelo app.
- Se a Q5 mostra muitos `TIMEOUT`, trate como o cenário C (categoria `TIMEOUT`).
- Uma execução lenta que termina depois de perder o lock é descartada e grava uma linha `DISCARDED`. Isso é esperado e não muda a conta.

**Encerramento:** a Q3 fica vazia por 15 minutos.

**O que não fazer:** não mudar `RUNNING` para `PENDING` por SQL. A atualização automática confere que a execução ainda é a dona do trabalho; uma atualização manual pode criar duas execuções do mesmo trabalho.

### C. Falha em massa na leitura

**Sintomas:** muitas contas em `OCR_FAILED` (Q1 ou `/health`, contagem `failed` subindo); a Q5 mostra a maioria das execuções em `RETRY_SCHEDULED` ou `FAILED_FINAL`.

**Diagnóstico pela categoria** (Q5 e Q6):

| `errorCategory` | Significado | Ação |
| --- | --- | --- |
| `CREDENTIAL` | 401 ou 403 da OpenAI: chave inválida, revogada ou sem permissão | Quem tem a conta da OpenAI confere a chave e o faturamento; trocar `OPENAI_API_KEY` na Vercel e fazer novo deploy |
| `TRANSIENT` | 429, 5xx ou queda de conexão | Ver a página de status da OpenAI e o limite da conta. As tentativas são limitadas (seção 1); não aumente a vazão da fila enquanto durar |
| `TIMEOUT` | Provedor demorou ou lock vencido | Ver o cenário B e a seção 10 |
| `INVALID_REQUEST` | 400 ou outro 4xx | Comparar `model` na Q5 com `OPENAI_MODEL`. Mudou o modelo ou o formato da imagem? Acionar o responsável pelo OCR |
| `INVALID_RESULT` | Resposta vazia, sem itens ou texto curto | Pico isolado pode ser foto ruim. Pico geral sugere mudança de modelo ou de prompt; acionar o responsável pelo OCR |
| `IMAGE_MISSING` | Conta sem imagem utilizável | Ver se o S3 está acessível e se as chaves de imagem existem; acionar o responsável pelo OCR |
| `EXHAUSTED` | Lock vencido sem tentativas sobrando | Consequência de B ou de `TIMEOUT` |
| `INTERNAL` / `UNKNOWN` | Erro nosso (por exemplo, banco) | Logs da Vercel no mesmo horário; acionar o responsável pelo OCR |

**Contenção:**

- Avise que a leitura por foto está com problema e que a criação manual funciona (seção 5).
- **Não existe chave para desligar só o OCR** (seção 10). Enquanto a causa não é resolvida, as leituras novas vão falhar depois de 3 tentativas, sem efeito em outras partes do app.
- Com a cobrança ligada, a falha libera o crédito. Se houver qualquer sinal de cobrança indevida, passe ao cenário D.

**Recuperação:**

- Depois de corrigir a causa (chave, limite, modelo), as leituras novas voltam a funcionar sozinhas.
- As contas que já estão em `OCR_FAILED` não voltam sozinhas: o usuário precisa pedir nova leitura no app. Se forem muitas, combine com o produto uma mensagem para os usuários afetados.

**Encerramento:** a Q5 da última hora volta a ter a maior parte das execuções em `COMPLETED` (o limiar exato está pendente de medição; ver seção 8).

**O que não fazer:** não mudar trabalhos `FAILED` para `PENDING` por SQL. A recriação certa passa pela rota de nova leitura, que incrementa `creditRun` e devolve a conta para `PENDING_OCR`. Mudando à mão, a conta fica em `OCR_FAILED` e, com a cobrança ligada, a nova leitura sai sem custo.

### D. Créditos presos (só com `CREDITS_ENFORCEMENT_ENABLED=true`)

**Sintomas:** usuário reclama de crédito descontado sem leitura; logs com `CREDIT_SETTLE_FAILED`; a Q8 lista reservas `HELD` de trabalhos que já terminaram.

**Contexto:** se o consumo ou a liberação falham, a reserva fica em `HELD`. **Ainda não existe reconciliador** que corrija isso sozinho, e `releaseExpired` não está agendado. Ele não pode ser chamado como está, porque liberaria também reservas de trabalhos que ainda estão na fila.

**Diagnóstico:**

1. Logs `CREDIT_SETTLE_FAILED`: trazem `jobId`, `action` (`consume`, `release` ou `decide`) e `errorName`.
2. Q8: reservas `HELD` cujo trabalho está `FAILED` ou `COMPLETED` há mais de 10 minutos.

**Contenção:**

- Se o problema for geral (muitas linhas na Q8 ou `CREDIT_SETTLE_FAILED` repetido), a decisão de desligar a cobrança (`CREDITS_ENFORCEMENT_ENABLED=false` e novo deploy) é do responsável pelo ledger com o produto. Desligada, a leitura volta a ser grátis e o ledger não é tocado; as reservas já presas continuam lá.

**Recuperação:**

- A correção de saldo é feita pelo responsável pelo ledger com o ajuste administrativo `PATCH /credits/:userId/adjust` (só `ADMIN`), que grava autor, motivo e referência. Use o `ocrJobId` da reserva como referência.
- Sempre conferir antes, pela Q8, se o trabalho terminou `COMPLETED` (o crédito deveria ser consumido) ou `FAILED` (deveria ser liberado).

**Encerramento:** a Q8 vazia (ou cada linha restante com ajuste registrado) e nenhum `CREDIT_SETTLE_FAILED` novo por 1 hora.

**O que não fazer:** não alterar `credit_reservations` nem `credit_transactions` por SQL (o ledger é imutável e auditável); não chamar `releaseExpired` manualmente.

## 5. Comunicação

| Momento | Para quem | Mensagem base |
| --- | --- | --- |
| Início | Canal interno (_a definir_) | "Incidente no OCR: [sintoma]. Cenário [A/B/C/D]. Responsável: [nome]. Próxima atualização em 30 min." |
| Início, se afeta usuários | Usuários (canal e texto a combinar com o produto) | "A leitura automática de notas está instável. Você pode criar a conta manualmente enquanto isso. Avisaremos quando normalizar." |
| A cada 30 min | Canal interno | O que mudou, o que foi tentado, próxima ação |
| Fim | Canal interno e, se houve aviso, usuários | "Normalizado às [hora]. Contas que falharam podem ser lidas de novo pelo app." |

Nunca colar no canal: `lastError`, logs `[OCR_RETRY]` ou `[OCR_ERROR]`, URLs de imagem, texto lido ou itens de contas.

## 6. Encerramento do incidente

- [ ] O critério de encerramento do cenário foi atingido.
- [ ] As contas afetadas foram contadas (Q1/Q7) e a orientação aos usuários foi dada.
- [ ] Com cobrança ligada: a Q8 foi conferida e os ajustes de crédito foram registrados.
- [ ] O registro do incidente foi feito (data, duração, cenário, causa, ação, pendências), sem dados de usuários.
- [ ] Este runbook foi atualizado se algum passo estava errado ou faltando.

## 7. Consultas SQL (só leitura)

Rodar no editor SQL do Supabase com um usuário de leitura, quando houver. Os valores de tempo (120 s, 10 min, 1 hora) seguem os padrões do código; ajuste se as variáveis da seção 1 tiverem outro valor.

**Q1. Profundidade e idade da fila**

```sql
SELECT status,
       count(*) AS trabalhos,
       round(extract(epoch FROM (now() AT TIME ZONE 'UTC') - min("availableAt"))) AS idade_max_s
FROM ocr_jobs
WHERE status IN ('PENDING', 'RUNNING')
GROUP BY status;
```

**Q2. Trabalhos prontos esperando**

```sql
SELECT count(*) AS prontos,
       round(extract(epoch FROM (now() AT TIME ZONE 'UTC') - min("availableAt"))) AS espera_max_s
FROM ocr_jobs
WHERE status = 'PENDING'
  AND "availableAt" <= (now() AT TIME ZONE 'UTC');
```

**Q3. `RUNNING` com lock vencido**

```sql
SELECT id, "billId", attempts, "lockedAt",
       round(extract(epoch FROM (now() AT TIME ZONE 'UTC') - "lockedAt")) AS lock_s
FROM ocr_jobs
WHERE status = 'RUNNING'
  AND "lockedAt" < (now() AT TIME ZONE 'UTC') - interval '120 seconds'
ORDER BY "lockedAt";
```

**Q4. Última execução (o cron está vivo?)**

```sql
SELECT max("startedAt") AS ultima_execucao,
       round(extract(epoch FROM (now() AT TIME ZONE 'UTC') - max("startedAt"))) AS ha_s
FROM ocr_run_metrics;
```

Se `ocr_run_metrics` estiver vazia ou atrasada (a gravação é em melhor esforço), confira também `SELECT max("startedAt") FROM ocr_jobs;`.

**Q5. Desfechos e categorias na última hora**

```sql
SELECT outcome, "errorCategory", model, count(*) AS execucoes
FROM ocr_run_metrics
WHERE "createdAt" >= (now() AT TIME ZONE 'UTC') - interval '1 hour'
GROUP BY outcome, "errorCategory", model
ORDER BY execucoes DESC;
```

Conte por `outcome`, nunca por `attempt`: um lock vencido pode gerar duas linhas com o mesmo `attempt`.

**Q6. Status HTTP e códigos das falhas na última hora**

```sql
SELECT "errorCategory", "httpStatus", "errorCode", count(*) AS execucoes
FROM ocr_run_metrics
WHERE "createdAt" >= (now() AT TIME ZONE 'UTC') - interval '1 hour'
  AND outcome <> 'COMPLETED'
GROUP BY "errorCategory", "httpStatus", "errorCode"
ORDER BY execucoes DESC;
```

**Q7. Contas em `PENDING_OCR` sem trabalho ativo**

```sql
SELECT b.id AS bill_id, b."createdAt", j.status AS status_trabalho
FROM bills b
LEFT JOIN ocr_jobs j ON j."billId" = b.id
WHERE b.status = 'PENDING_OCR'
  AND b."createdAt" < (now() AT TIME ZONE 'UTC') - interval '10 minutes'
  AND (j.id IS NULL OR j.status IN ('FAILED', 'COMPLETED'));
```

Pelo código, toda conta entra em `PENDING_OCR` junto com um trabalho ativo. Qualquer linha aqui é inconsistência: acione o responsável pelo OCR e não corrija à mão.

**Q8. Reservas `HELD` de trabalhos que já terminaram** (só com cobrança ligada)

```sql
SELECT r."ocrJobId", r."userId", r."expiresAt", j.status AS status_trabalho, j."finishedAt"
FROM credit_reservations r
LEFT JOIN ocr_jobs j ON j.id = split_part(r."ocrJobId", ':', 1)
WHERE r.status = 'HELD'
  AND (
    j.id IS NULL
    OR (j.status IN ('FAILED', 'COMPLETED')
        AND j."finishedAt" < (now() AT TIME ZONE 'UTC') - interval '10 minutes')
  );
```

A chave da reserva é o `id` do trabalho, ou `id:n` quando a leitura foi recriada (`creditRun` maior que 1); por isso o `split_part`.

## 8. Limiares de alerta (pendentes de medição)

Ainda não há dados reais de fila e de OCR, então nenhum limiar foi calibrado. Os valores abaixo são **pontos de partida derivados da configuração**, não de medição, e devem ser revistos depois de sete dias de dados (critério do E00-T08).

| Alerta | Condição | Ponto de partida | Valor medido | Severidade | Canal / responsável |
| --- | --- | --- | --- | --- | --- |
| Fila sem progresso | Q2 com `prontos > 0` e Q4 com `ha_s` acima do limite | 3 min (3 ciclos do cron) | _pendente de medição_ | _a definir_ | _a definir_ |
| Trabalho velho na fila | Q2 `espera_max_s` acima do limite | 10 min | _pendente de medição_ | _a definir_ | _a definir_ |
| Lock vencido parado | Q3 com linhas por mais de 2 ciclos | 2 min | _pendente de medição_ | _a definir_ | _a definir_ |
| Queda de sucesso | `COMPLETED` / execuções terminais da última hora (Q5) abaixo do limite | _pendente de medição_ | _pendente de medição_ | _a definir_ | _a definir_ |
| Credencial | Qualquer `CREDENTIAL` na Q5 | 1 ocorrência | _não se aplica_ | _a definir_ | _a definir_ |
| Crédito preso | Q8 com linhas, ou `CREDIT_SETTLE_FAILED` nos logs | 1 ocorrência | _não se aplica_ | _a definir_ | _a definir_ |

## 9. Espaço para dados reais e exercício

Este runbook foi escrito e conferido contra o código; **nada foi executado em ambiente real**. Quando houver ambiente com banco, cron e chave da OpenAI, preencher:

| Verificação | Como | Resultado | Data / quem |
| --- | --- | --- | --- |
| As consultas Q1 a Q8 rodam sem erro | Rodar no editor SQL | _pendente_ | |
| O cron chama `process-pending` com o segredo certo | Logs da Vercel | _pendente_ | |
| Plano da Vercel, frequência do cron e tempo máximo da função | Painel da Vercel | _pendente_ | |
| Chamada manual de `process-pending` processa um trabalho | Cenário A, contenção | _pendente_ | |
| Exercício controlado: cron desligado em ambiente de teste, fila acumula, cron volta e esvazia | Cenário A de ponta a ponta | _pendente_ | |
| Exercício controlado: chave da OpenAI inválida em ambiente de teste gera `CREDENTIAL` | Cenário C | _pendente_ | |
| Valores medidos para a seção 8 | Q2, Q4 e Q5 ao longo de sete dias | _pendente_ | |

## 10. Lacunas conhecidas que afetam este runbook

- **Sem timeout na chamada à OpenAI:** o cliente usa o padrão do SDK (10 minutos e 2 retentativas internas), além das 3 tentativas do serviço e das 3 da fila. Uma chamada lenta passa do lock de 120 s e alimenta o cenário B. Correção prevista na Semana 5, task 2.
- **URL assinada e mensagem crua nos logs** `[OCR_RETRY]` e `[OCR_ERROR]`: por isso os cuidados da seção 2. Correção prevista na Semana 5, task 2.
- **Erros permanentes são retentados pela fila** (401, 403, 400): uma chave inválida leva 3 tentativas até a conta virar `OCR_FAILED`, em vez de falhar na primeira.
- **Sem reconciliador de reservas `HELD`** e `releaseExpired` não agendável como está: o cenário D depende de ajuste manual. Pré-requisito para ligar a cobrança.
- **Sem chave para desligar só o OCR:** na falha em massa, a contenção é comunicar e orientar a criação manual.
- **O resumo da fila não mostra a idade do trabalho mais antigo:** por isso a Q1 e a Q2.
- **`METRICS_TOKEN` não está no `backend/.env.example`:** sem ele, `/metrics` responde 404.
- **Ainda sem responsáveis, canal e severidade dos alertas** (tabela do início e seção 8).
