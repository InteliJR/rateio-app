# Plano da semana 3 — P6 (ledger, qualidade e release)

## 1. Estado das branches em 21/10

| Branch | Autor | O que tem | Situação |
| --- | --- | --- | --- |
| `feat/quality-monitoring` | Enzo | Baseline, suíte de fumaça (38 testes E2E), merge do ledger, testes de concorrência do ledger, plano de rollback, ADR de observabilidade | PR para `develop` a abrir |
| `feat/credits-ledger` | Lucas | Schema e migration do ledger, `CreditsService` (grant, reserve, consume, release, releaseExpired, adminAdjust), `GET /credits/balance`, cobrança na fila atrás de `CREDITS_ENFORCEMENT_ENABLED` | Sem PR; já mesclada em `feat/quality-monitoring` |
| `feat/google-play-purchases` | Fabi | Tabela `purchases` (token único), verificador real e falso do Google Play, `POST /purchases/google` e `/purchases/reconcile`, porta `CreditsGranter` com implementação provisória que **não credita** | Sem PR; conflita com o ledger em `schema.prisma`, `app.module.ts` e `.env.example` |
| `feat/ci-quality-gate` | — | Gate de PR (E00-T10) | Fora desta semana |

Dependências: `quality-monitoring` → `credits-ledger` ← `google-play-purchases`. A integração de compra só existe depois das três juntas.

## 2. Tarefas

### T1 — Expor saldo, resumo de movimentações e ajuste administrativo auditável

| Campo | Conteúdo |
| --- | --- |
| Responsável | Enzo; saldo já feito pelo Lucas |
| Já existe | `GET /credits/balance` (`available`, `held`, `balance`, `policy`); `CreditsService.adminAdjust` sem rota |
| Falta | `GET /credits/transactions` com paginação e só tipos visíveis ao usuário (sem `RESERVE` + `RELEASE` em par); `POST /admin/credits/adjust` com `RolesGuard` de ADMIN, motivo obrigatório e `actorId` do token; idempotência do ajuste por chave enviada pelo cliente (hoje usa `Date.now()`); regra para não deixar saldo negativo |
| Aceite | Usuário só vê o próprio histórico; ajuste sem ADMIN → 403; todo ajuste tem autor e motivo; E2E cobrindo isolamento e 403 |
| Estimativa | 6 h |
| Riscos | Contrato do histórico precisa ser combinado com o P4 (Lucas, frontend), e o corte "histórico detalhado no app" já foi feito: entregar só o resumo mínimo |

### T2 — Integrar compra confirmada ao ledger

| Campo | Conteúdo |
| --- | --- |
| Responsável | Enzo, com revisão da Fabi |
| Já existe | `PurchasesService.settle` chama `CreditsGranter.grant({ reference: purchase.id })` só depois da verificação no Google; `CreditsService.grant` é idempotente por `reference` (testado com 10 chamadas simultâneas) |
| Falta | Mesclar `feat/google-play-purchases` resolvendo os conflitos; trocar `PlaceholderCreditsGranter` por um adaptador que chama `CreditsService.grant` com `type: PURCHASE`, `reference: purchase:${purchase.id}` e `purchaseToken`; renomear a migration de compras (`20260901…`) para depois da do ledger (`20261014…`), para a ordem ser a de criação |
| Aceite | Compra verificada soma exatamente `credits` ao saldo; a mesma compra enviada 10 vezes em paralelo credita uma vez; compra `PENDING` ou `CANCELED` não credita; o token não aparece em log |
| Estimativa | 4 h |
| Riscos | A Fabi pode estar mexendo na mesma branch: combinar quem faz o merge; o `purchaseToken` também é gravado em `credit_transactions` (avaliar com o Gabriel se é necessário) |

### T3 — E2E de reserva → OCR → consumo/liberação e de compra → crédito

| Campo | Conteúdo |
| --- | --- |
| Responsável | Enzo |
| Já existe | Reserva → OCR → consumo/devolução, retry, saldo zero, tentativa extra da fila: [credits-ledger.e2e-spec.ts](../../backend/test/smoke/credits-ledger.e2e-spec.ts) (12 testes; BUG-015 e BUG-016 como `it.failing`) |
| Falta | `purchases.e2e-spec.ts` com o verificador falso: compra → crédito → saldo; replay do token; token de outro usuário (403); `PENDING` → `reconcile` → crédito; compra e leitura na mesma conta |
| Aceite | Suíte verde 10 vezes seguidas; nenhum segredo real; roda no gate de PR quando ele existir |
| Estimativa | 5 h |
| Riscos | Depende da T2 |

### T4 — Correções que bloqueiam ligar a cobrança

| Campo | Conteúdo |
| --- | --- |
| Responsável | Lucas (código do ledger e da fila); Enzo valida com os testes |
| Já existe | BUG-015, BUG-016 e BUG-017 documentados no [baseline](baseline-qualidade-2026-10-14.md), com testes prontos |
| Falta | Correção dos dois P1; decisão do produto sobre o BUG-017; agendar `releaseExpired` no cron |
| Aceite | Remover `.failing` dos testes e a suíte continuar verde |
| Estimativa | 3 h (Lucas) + 1 h (Enzo) |
| Riscos | Sem isso, o checkpoint de 25/10 vale só com a cobrança desligada |

### T5 — Kanban F1-T5: auditoria de qualidade de código (19/10 a 01/11)

| Campo | Conteúdo |
| --- | --- |
| Responsável | Enzo |
| Já existe | Baseline com 18 bugs triados, matriz de severidade, cobertura medida (57,2%) |
| Falta | Revisar as branches novas (ledger, compras, anúncios, telas de crédito); abrir as issues no GitHub a partir do baseline; plano de correções por responsável |
| Aceite | Relatório, issues criadas com severidade e responsável, plano aprovado na weekly |
| Estimativa | 6 h nesta semana, o restante na semana 4 |
| Riscos | Depende de as branches de P3 e P4 estarem publicadas |

### Atrasada: Kanban F1-T4, tratamento global de erros (prazo 18/10)

Mapeia `InsufficientCreditsError` para 4xx, o que ajuda o BUG-016. Estimativa: 5 h. Entra só se T1 a T3 fecharem antes de sexta; senão, vai como "em andamento".

## 3. O que eu entrego até sexta (24/10)

1. PR de `feat/quality-monitoring`: baseline, fumaça, testes do ledger, rollback e ADR.
2. T2: compra integrada ao ledger, em branch própria a partir da junção das três.
3. T3: E2E de compra → crédito.
4. T1: histórico resumido e ajuste administrativo.
5. Auditoria F1-T5: issues abertas a partir do baseline.

Total estimado: cerca de 21 h. Se faltar tempo, T1 fica com o ajuste administrativo e o histórico passa para a semana 4.

## 4. O que preciso dos outros

| Pessoa | Pedido | Até |
| --- | --- | --- |
| Lucas | Corrigir BUG-015 e BUG-016; dizer se o schema do ledger ainda muda; abrir o PR de `feat/credits-ledger` | 23/10 |
| Fabi | Combinar quem faz o merge com o ledger; confirmar que `reference = purchase.id` é a chave definitiva; status da trilha interna e das contas licenciadas | 22/10 |
| Gabriel | Usuário do GitHub para revisão; revisar autorização das rotas `/credits` e `/purchases`; aprovar a classificação de dados do ADR | 23/10 |
| Gabi (produto) | Retry depois da devolução cobra ou não (BUG-017); confirmar cota gratuita de 3; aprovar o ADR (PostHog, política de privacidade, orçamento) | 22/10 |
| Lucas (frontend) | Contrato de `GET /credits/transactions` e do erro de saldo insuficiente | 22/10 |
