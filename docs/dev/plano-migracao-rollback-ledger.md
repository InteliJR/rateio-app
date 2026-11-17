# Plano de migração e rollback do ledger de créditos

**Frente:** 01 — Qualidade e Observabilidade (release) e 03 — Créditos e Ledger

**Migration:** `20261014000000_add_credits_ledger` (branch `feat/credits-ledger`)

**Atualizado em:** 21/10/2026

**Status:** rollback testado em banco descartável; aguardando revisão do Lucas (ledger) e do Gabriel (segurança)

## 1. O que a migration cria e altera

| Objeto | Tipo | Detalhe |
| --- | --- | --- |
| `CreditPolicy` | enum | `METERED` (padrão) e `UNLIMITED` (conta isenta) |
| `CreditTransactionType` | enum | `FREE_GRANT`, `PURCHASE`, `AD_REWARD`, `RESERVE`, `CONSUME`, `RELEASE`, `ADMIN_ADJUST` |
| `CreditReservationStatus` | enum | `HELD`, `CONSUMED`, `RELEASED` |
| `users.creditPolicy` | coluna nova | `NOT NULL DEFAULT 'METERED'`; única alteração em tabela existente |
| `credit_transactions` | tabela nova | Ledger imutável. Saldo = soma de `amount` |
| `credit_reservations` | tabela nova | Uma reserva por trabalho de OCR |

Índices e restrições:

| Índice | Função |
| --- | --- |
| `credit_transactions_idempotencyKey_key` (único) | Chave de idempotência de toda movimentação |
| `credit_transactions_userId_createdAt_idx` | Saldo e histórico por usuário |
| `credit_transactions_ocrJobId_idx` | Movimentações de uma leitura |
| `credit_reservations_ocrJobId_key` (único) | No máximo uma reserva por `OcrJob` |
| `credit_reservations_userId_idx` | Reservas do usuário (saldo `held`) |
| `credit_reservations_status_expiresAt_idx` | Busca de reservas vencidas (`releaseExpired`) |
| FKs `userId → users.id` | `ON DELETE CASCADE` nas duas tabelas |

Chaves de idempotência usadas pelo código ([credits.service.ts](../../backend/src/credits/credits.service.ts)):

| Movimento | Chave | Valor |
| --- | --- | ---: |
| Cota gratuita | `free-grant:${userId}` | +`CREDITS_FREE_QUOTA` (3) |
| Compra / anúncio | `reference` recebida (ex.: `purchaseToken`) | +N |
| Reserva | `reserve:${ocrJobId}` | −1 |
| Devolução | `release:${ocrJobId}` | +1 |
| Consumo | nenhuma linha no ledger; só muda a reserva para `CONSUMED` | 0 |
| Ajuste administrativo | `admin:${userId}:${Date.now()}` | ±N |

Pontos de atenção encontrados na leitura:

- `purchaseToken` **não é único** na tabela. A unicidade da compra depende de a verificação usar o token como `reference`. Ver seção 5.
- não há `CHECK` impedindo saldo negativo. A garantia está só no código (`SELECT ... FOR UPDATE` em `users` dentro do `reserve`), e o `adminAdjust` pode deixar o saldo negativo.
- o ledger é imutável só por convenção: não existe trigger nem permissão que impeça `UPDATE` ou `DELETE`. O `ON DELETE CASCADE` apaga o histórico quando a conta é excluída (tema de retenção da semana 4, P2).
- o consumo não deixa linha no ledger. A auditoria de "leitura cobrada" depende de juntar `RESERVE` com `credit_reservations.status`.

## 2. Compatibilidade com a versão anterior do código

A migration é **aditiva**: só cria tipos e tabelas e adiciona uma coluna com valor padrão. O código atual da `develop`, que não conhece o ledger, continua funcionando com o banco migrado:

- o Prisma Client antigo não seleciona colunas que não conhece, e `creditPolicy` tem `DEFAULT`, então `INSERT` em `users` sem a coluna funciona;
- nenhuma tabela ou coluna usada hoje foi renomeada ou removida.

O contrário **não** vale: o código novo com o banco antigo quebra em qualquer rota que toque créditos (`GET /credits/balance`) e, com a cobrança ligada, em todo upload.

## 3. Ordem segura de deploy

A Vercel não executa `prisma migrate deploy` no build ([vercel.json](../../backend/vercel.json)); a migration é aplicada manualmente, como no [README](../../README.md).

1. **Backup:** confirmar o backup diário do Supabase e anotar o horário. Em plano sem PITR, fazer `pg_dump` das tabelas `users` e `_prisma_migrations`.
2. **Migration primeiro:** `DATABASE_URL=<produção> DIRECT_URL=<produção> npx prisma migrate deploy`. O código em produção continua o antigo, que é compatível (seção 2).
3. **Conferir:** `npx prisma migrate status` sem pendências, e as consultas da seção 7.
4. **Deploy do código** com `CREDITS_ENFORCEMENT_ENABLED=false`. A rota de saldo passa a existir, mas a fila não cobra.
5. **Ligar a cobrança** só depois de BUG-015 e BUG-016 corrigidos e da suíte `credits-ledger` verde no CI: mudar a variável para `true` e **republicar**. Na Vercel, mudar a variável não afeta o deploy em execução. O comentário em `ocr-queue.service.ts` ("sem nova publicação") não vale para a Vercel.
6. Fazer primeiro no **preview** com banco próprio, nunca apontando o preview para o banco de produção.

## 4. Plano de rollback

Do menos para o mais invasivo. Na maioria dos incidentes basta o nível 1.

### Nível 1 — desligar a cobrança, sem mexer no banco

- **Como:** `CREDITS_ENFORCEMENT_ENABLED=false` e republicar (ou promover o deploy anterior na Vercel).
- **Já existe:** sim, a variável está em [.env.example](../../backend/.env.example) e é lida em `OcrQueueService`.
- **Limitações:**
  - a variável só controla a fila. `GET /credits/balance` continua gravando `FREE_GRANT` para quem consultar;
  - reservas `HELD` no momento do desligamento ficam presas: com a flag desligada a fila não chama `consume` nem `release`, e `releaseExpired` **não é agendado em lugar nenhum** (ver seção 5). É preciso devolver manualmente (abaixo).
- **Devolver reservas presas** (registra a devolução no ledger em vez de apagar a reserva):

```sql
BEGIN;
INSERT INTO credit_transactions (id, "userId", type, amount, "idempotencyKey", "ocrJobId", reason)
SELECT gen_random_uuid()::text, "userId", 'RELEASE', 1, 'release:' || "ocrJobId", "ocrJobId",
       'Rollback: reserva devolvida manualmente'
FROM credit_reservations
WHERE status = 'HELD'
ON CONFLICT ("idempotencyKey") DO NOTHING;

UPDATE credit_reservations SET status = 'RELEASED', "updatedAt" = now() WHERE status = 'HELD';
COMMIT;
```

### Nível 2 — voltar o código

Promover na Vercel o deploy anterior ao ledger. O banco migrado é compatível com ele (seção 2), então **não é preciso reverter a migration**. As tabelas ficam paradas, sem escrita.

### Nível 3 — reverter a migration

Só se a própria migration causar problema (ex.: travar a tabela `users`) ou se a decisão for abandonar o ledger. Antes, fazer o nível 2.

```sql
-- Reversão de 20261014000000_add_credits_ledger
BEGIN;
DROP TABLE IF EXISTS "credit_reservations";
DROP TABLE IF EXISTS "credit_transactions";
ALTER TABLE "users" DROP COLUMN IF EXISTS "creditPolicy";
DROP TYPE IF EXISTS "CreditReservationStatus";
DROP TYPE IF EXISTS "CreditTransactionType";
DROP TYPE IF EXISTS "CreditPolicy";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261014000000_add_credits_ledger';
COMMIT;
```

### O que fazer com os lançamentos já gravados

O ledger é imutável: no nível 1 e no nível 2 **nada é apagado nem editado**. Correções entram como novas linhas (`RELEASE` ou `ADMIN_ADJUST` com motivo e autor).

O nível 3 apaga tudo. Se já houver `PURCHASE` gravado, isso é dinheiro do usuário: antes de reverter, exportar as tabelas e combinar com produto e com a Fabi (compras) como honrar esses saldos.

```bash
pg_dump "$DIRECT_URL" -t credit_transactions -t credit_reservations --data-only > ledger-backup-$(date +%Y%m%d%H%M).sql
```

## 5. Riscos

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| Usuários existentes | Recebem a cota gratuita na primeira consulta de saldo ou reserva (`ensureFreeGrant`), de forma idempotente | Testado com 10 consultas simultâneas: uma concessão só |
| Concessão retroativa em massa | Toda conta existente ganha 3 créditos, inclusive contas antigas ou abandonadas. Se o produto mudar `CREDITS_FREE_QUOTA` depois, quem já recebeu não é ajustado | Produto confirmar a cota antes do deploy (checkpoint 11/10) |
| Cota alterada depois | A chave `free-grant:${userId}` impede uma segunda concessão; aumentar a cota não chega a quem já recebeu | Nova concessão com outra chave (ex.: `free-grant-v2:`) |
| Reservas `HELD` no rollback | Crédito do usuário preso; aparece em `held`, mas não em `available` | SQL de devolução do nível 1 |
| `releaseExpired` sem agendamento | Queda do processo no meio da leitura deixa a reserva presa para sempre, mesmo com a cobrança ligada | Chamar `releaseExpired` no cron `/internal/ocr/process-pending` (já roda a cada minuto) |
| BUG-015 | `consume` e `release` simultâneos devolvem crédito já consumido | Corrigir antes de ligar a cobrança |
| BUG-016 | Sem saldo: 500 e leitura grátis | Corrigir antes de ligar a cobrança |
| BUG-017 | Retry depois da devolução não cobra | Decisão de produto |
| `purchaseToken` sem índice único | Mesma compra creditada duas vezes se a verificação usar outra `reference` | Índice único parcial em `purchaseToken`, ou garantir `reference = purchaseToken` na integração de compras (semana 3) |
| `ON DELETE CASCADE` | Excluir a conta apaga o histórico de compras | Revisar com o Gabriel (retenção, semana 4) |

## 6. Rollback testado no banco descartável

Ambiente: `postgres:16-alpine` em `localhost:55432` (`npm run test:db:up`), 21/10/2026.

Usado um segundo container (`postgres:16-alpine` na porta 55433), para não interferir na suíte E2E.

| Passo | Comando | Resultado |
| --- | --- | --- |
| 1. Banco no estado anterior | `prisma migrate deploy` sem a pasta da migration do ledger | 6 migrations aplicadas |
| 2. Usuário existente | `INSERT INTO users ...` (sem `creditPolicy`) | 1 linha |
| 3. Aplicar o ledger | `prisma migrate deploy` | Aplicada; usuário existente ficou com `creditPolicy = METERED` |
| 4. Dados de exemplo | `FREE_GRANT` +3, duas reservas (`HELD` e `CONSUMED`) com `RESERVE` −1 cada | Saldo disponível 1 |
| 5. Nível 1: devolver `HELD` | SQL da seção 4, executado **duas vezes** | 1ª: `INSERT 0 1`, `UPDATE 1`; 2ª: `INSERT 0 0`, `UPDATE 0`. Saldo 2; `job-a` `RELEASED`, `job-b` continua `CONSUMED` |
| 6. Nível 3: reverter | SQL de reversão da seção 4 | Tabelas, coluna e 3 tipos removidos; `migrate status` volta a listar o ledger como pendente |
| 7. Reaplicar | `prisma migrate deploy` | Aplicada de novo; `Database schema is up to date!`; usuário existente preservado |
| 8. Reverter de novo | SQL de reversão, duas vezes seguidas | Segunda execução só emite `NOTICE ... skipping` e `COMMIT`: o script é idempotente |

Não testado aqui: duração da migration com a tabela `users` de produção. O `ADD COLUMN ... DEFAULT` é só de metadados no Postgres 11+ e não reescreve a tabela, então não deve travar `users` por tempo relevante.

## 7. Checklist depois do deploy

- [ ] `npx prisma migrate status`: nenhuma migration pendente.
- [ ] As três tabelas e a coluna existem:

```sql
SELECT to_regclass('credit_transactions'), to_regclass('credit_reservations');
SELECT count(*) FROM users WHERE "creditPolicy" IS NULL; -- deve ser 0
```

- [ ] `GET /credits/balance` com usuário de teste devolve `{ available: 3, held: 0 }` e grava exatamente um `FREE_GRANT`.
- [ ] Fluxo existente sem regressão: login, conta manual, upload com OCR (cobrança desligada).
- [ ] Nenhum saldo negativo:

```sql
SELECT "userId", sum(amount) FROM credit_transactions GROUP BY "userId" HAVING sum(amount) < 0;
```

- [ ] Nenhuma reserva vencida presa:

```sql
SELECT count(*) FROM credit_reservations WHERE status = 'HELD' AND "expiresAt" < now();
```

- [ ] Nenhuma reserva consumida com devolução (assinatura do BUG-015):

```sql
SELECT r."ocrJobId" FROM credit_reservations r
JOIN credit_transactions t ON t."ocrJobId" = r."ocrJobId" AND t.type = 'RELEASE'
WHERE r.status = 'CONSUMED';
```

- [ ] Depois de ligar a cobrança: uma leitura real consome 1 crédito; uma falha devolve 1.

## 8. Testes concorrentes

Implementados em [credits-ledger.e2e-spec.ts](../../backend/test/smoke/credits-ledger.e2e-spec.ts), contra Postgres real:

| Cenário | Resultado |
| --- | --- |
| 10 reservas simultâneas com saldo 3 | Passa: 3 aceitas, 7 recusadas, saldo nunca negativo |
| Mesma reserva (mesmo `ocrJobId`) 5 vezes | Passa: um débito |
| `grant` com a mesma referência 10 vezes | Passa: uma concessão |
| Cota gratuita pedida 10 vezes | Passa: uma concessão |
| `consume` e `release` simultâneos | **Falha: BUG-015** (`it.failing`) |
| `release` repetido | Passa: uma devolução |
| `releaseExpired` só pega vencidas e abertas | Passa |
| Upload → OCR com sucesso → consumo | Passa |
| OCR falha em todas as tentativas → devolução | Passa |
| Retry depois da devolução | Não cobra (BUG-017, comportamento atual travado) |
| Saldo zero no upload | **Falha: BUG-016** (`it.failing`) |
| Tentativa a mais da fila (BUG-013) | Passa: um `RESERVE` e um `RELEASE` por job |

Faltam, para a próxima etapa:

- compra → crédito com o mesmo `purchaseToken` em paralelo (depende de `feat/google-play-purchases`);
- `adminAdjust` não pode deixar saldo negativo (decidir a regra);
- exclusão da conta com reserva `HELD`;
- lock de OCR expirado com reserva aberta (semana 4, P1).
