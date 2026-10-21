# Baseline de qualidade - 14 de outubro de 2026

**Status:** baseline técnico e testes de fumaça da API registrados; verificação visual no dispositivo pendente

**Atualizado em:** 16/10/2026, com a suíte de fumaça (seção 6)

## 1. Contexto da medição

| Campo | Valor |
| --- | --- |
| Data | 14/10/2026 |
| Ambiente | Local, `NODE_ENV=development` |
| Banco | PostgreSQL 16 (`postgres:16-alpine`) descartável, vazio, com `prisma migrate deploy` |
| Dados | Um usuário fictício (`baseline@example.com`); nenhuma conta, nota fiscal ou dado pessoal real |
| Serviços externos | OpenAI, S3 e SMTP não foram chamados; variáveis preenchidas com valores falsos |

As medições locais servem como referência relativa. Elas não representam a latência da Vercel nem do banco de produção.

## 2. Execução dos comandos atuais

| Comando | Pasta | Resultado | Tempo |
| --- | --- | --- | ---: |
| `npm ci` | `backend` | Sucesso | 17,3 s |
| `npm ci` | `frontend` | Sucesso, com avisos de `glob@7` depreciado | 4,6 s |
| `npm test -- --ci` | `backend` | 10 suítes, 19 testes, todos passando | 1,9 s |
| `npm run build` | `backend` | Sucesso; saída gerada em `dist/src/` (ver BUG-008) | 2,9 s |
| `npx prisma migrate deploy` | `backend` | Todas as migrações aplicadas | 1,1 s |
| `npm run test:e2e` (14/10, antes da suíte de fumaça) | `backend` | 1 teste passando, somente com banco, variáveis falsas e `--forceExit` | 1,1 s |
| `npm run test:e2e` (16/10, com a suíte de fumaça) | `backend` | 6 suítes, 26 testes passando; 20 de 20 execuções verdes | ~3 s |
| `npx tsc --noEmit` | `frontend` | 0 erros de tipo | 1,9 s |

Observações:

- em 14/10, sem banco acessível, o E2E falhava em `PrismaService.onModuleInit`;
- em 14/10, sem `OPENAI_API_KEY` e `OPENAI_MODEL`, o E2E falhava antes de subir a aplicação (BUG-007, corrigido);
- em 14/10, sem `--forceExit`, o E2E passava, mas o processo não encerrava (BUG-006, corrigido);
- o frontend não possui scripts `test`, `typecheck` nem `lint` e não há nenhum arquivo de teste.

### Cobertura de testes do backend

| Suítes executadas | Linhas | Instruções | Funções | Branches |
| --- | ---: | ---: | ---: | ---: |
| Somente unitários (`npm test`) | 17,2% | 17,8% | 10,0% | 19,1% |
| Somente fumaça (`npm run test:e2e`) | 51,6% | 53,5% | 44,9% | 31,7% |
| Unitários + fumaça | **57,2%** | 58,8% | 50,1% | 43,6% |

A meta da tarefa *Frente 1 - Tarefa 1* é 70%; a da *Frente 1 - Tarefa 6* é 80% em código crítico.

## 3. Latência inicial da API

API executada localmente com `node dist/src/main` na porta 3100. Testes de carga com `backend/scripts/load-test.cjs` (autocannon, 20 conexões).

| Cenário | Duração | Requisições | Req/s | p50 | p90 | p97,5 | p99 | Status |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `GET /health` | 20 s | 94.213 | 4.711 | 3 ms | 5 ms | 7 ms | 9 ms | 100% 200 |
| `GET /bills?page=1&limit=10` (autenticado, base vazia) | 10 s | 41.825 | 3.803 | 5 ms | 6 ms | 7 ms | 9 ms | 100% 200 |
| `POST /auth/login` (credencial inválida) | 20 s | 290.648 | 14.533 | 1 ms | 1 ms | 2 ms | 2 ms | 3× 401, 290.645× 429 |

Medições sequenciais (uma requisição por vez):

| Operação | Amostras | Tempo |
| --- | ---: | --- |
| `POST /auth/register` | 1 | 43 ms |
| `POST /auth/login` (credencial válida) | 3 | 42 ms, 28 ms, 28 ms |
| `GET /bills` (autenticado) | 5 | 16 ms, 5 ms, 7 ms, 5 ms, 5 ms |

Leitura dos resultados:

- o rate limit de login (3 por minuto) funciona: o cenário `login` mede o limitador, não o login. Para medir o login sob carga é preciso desativar o limite em ambiente controlado;
- o contador do rate limit fica em memória: na Vercel cada instância tem seu próprio contador, então o limite efetivo pode ser maior que 3 por minuto;
- `GET /bills` usa `@SkipThrottle()` e não tem limite de requisições;
- a duração da fila e de uma leitura de OCR **não foi medida**, porque exige chamada real à OpenAI. Fica com a frente de OCR (semana 2, P1) em ambiente controlado.

## 4. Matriz de severidade

| Severidade | Definição | Exemplos no Por Partes | Resposta |
| --- | --- | --- | --- |
| **P0** | Perda ou vazamento de dados, falha de segurança explorável, ou fluxo principal indisponível para todos | Usuário lê a conta de outro usuário; login quebrado para todos; cobrança de crédito sem leitura; app fecha ao abrir | Interrompe a sprint; correção ou contenção imediata |
| **P1** | Fluxo crítico quebrado para parte dos usuários, ou exposição que exige contenção rápida | OCR falha sempre em um tipo de nota; finalização não salva a divisão; endpoint operacional público com dados internos | Entra na sprint atual com responsável |
| **P2** | Defeito com contorno conhecido, ou lacuna que reduz a capacidade de diagnosticar | Total arredondado errado em um caso raro; erro sem mensagem; métrica que não conta erros; teste que trava o CI | Compete pela reserva de 20% para bugs |
| **P3** | Cosmético, documentação ou melhoria sem impacto no fluxo | Texto desalinhado no tema escuro; variável sobrando no `.env.example`; saída de script incorreta | Fica no backlog |

## 5. Inventário de bugs

Todos os itens abaixo foram reproduzidos em 14/10/2026 no ambiente descrito na seção 1.

### BUG-001 - `/health` público expõe métricas, fila e configuração

- **Severidade:** P1
- **Responsável sugerido:** Gabriel (segurança, E00-T04)
- **Passos:** subir a API e chamar `GET /health` sem autenticação.
- **Esperado:** apenas o estado necessário para disponibilidade (`status`, talvez `version`).
- **Obtido:** retorna estado do banco com tempo de resposta, snapshot completo da fila (`pending`, `failed`, `maxConcurrency`, `maxAttempts`, `retryDelayMs`, `lockTimeoutMs`), métricas HTTP por rota e `uptime`.
- **Evidência:** [app.controller.ts](../../backend/src/app.controller.ts) (`healthCheck`).
- **Contenção:** reduzir a resposta pública de `/health` antes de qualquer outra mudança de observabilidade.

### BUG-002 - `/metrics` público e sem limite de requisições

- **Severidade:** P1
- **Responsável sugerido:** Gabriel (segurança, E00-T04)
- **Passos:** `curl -i http://localhost:3100/metrics` sem token.
- **Esperado:** 401 para usuário anônimo.
- **Obtido:** 200 com contagem, erros e duração de cada rota e todos os contadores de OCR. A rota também tem `@SkipThrottle()`.
- **Evidência:** [metrics.controller.ts](../../backend/src/observability/metrics.controller.ts).

### BUG-003 - Segredos JWT com valor padrão no código

- **Severidade:** P1
- **Responsável sugerido:** Gabriel (segurança)
- **Passos:** iniciar a API sem `JWT_SECRET` e `JWT_REFRESH_SECRET`.
- **Esperado:** a API se recusa a iniciar.
- **Obtido:** a API inicia e assina tokens com `'your-secret-key-change-in-production'` e `'refresh-secret-key'`. Quem conhece o repositório consegue forjar tokens se a variável faltar em algum ambiente.
- **Evidência:** [auth.module.ts](../../backend/src/auth/auth.module.ts), [jwt.strategy.ts](../../backend/src/auth/strategies/jwt.strategy.ts), [auth.service.ts](../../backend/src/auth/auth.service.ts).
- **Contenção:** confirmar que as duas variáveis estão definidas em produção e preview na Vercel.

### BUG-004 - Métricas não registram 401, 404 e 429

- **Severidade:** P2
- **Responsável sugerido:** Gabriel (E00-T04), com apoio de Enzo
- **Passos:** chamar `GET /bills/<uuid>` sem token (401), uma rota inexistente (404) e exceder o limite de login (429); depois consultar `/metrics`.
- **Esperado:** as três respostas aparecem em `errors4xx`.
- **Obtido:** nenhuma aparece. O `MetricsInterceptor` só roda depois dos guards (JWT e throttler) e não roda para rotas sem handler. Ataques de força bruta e tokens expirados ficam invisíveis.
- **Evidência:** [metrics.interceptor.ts](../../backend/src/observability/metrics.interceptor.ts).
- **Correção sugerida:** medir em middleware ou filtro global de exceções, não somente no interceptor.

### BUG-005 - Respostas sem `x-request-id`

- **Severidade:** P2
- **Responsável sugerido:** Gabriel (E00-T03)
- **Passos:** `curl -I http://localhost:3100/health`.
- **Esperado:** cabeçalho `x-request-id` em toda resposta.
- **Obtido:** cabeçalho ausente; não há como ligar um erro do app a um log da API.

### BUG-006 - E2E não encerra o processo

- **Severidade:** P2
- **Responsável sugerido:** Enzo (E00-T09)
- **Status:** corrigido em 16/10 - todas as suítes chamam `app.close()` via `createSmokeApp`
- **Passos:** com banco e variáveis definidos, rodar `npx jest --config ./test/jest-e2e.json`.
- **Esperado:** o processo termina após os testes.
- **Obtido:** o teste passa, mas o Jest informa "did not exit one second after the test run has completed" e o processo continua rodando por mais de 45 segundos. O teste não chama `app.close()`. No CI, o job ficaria preso até o tempo limite.
- **Evidência:** [app.e2e-spec.ts](../../backend/test/app.e2e-spec.ts).

### BUG-007 - E2E depende de chave da OpenAI e de banco real para iniciar

- **Severidade:** P2
- **Responsável sugerido:** Enzo (E00-T09)
- **Passos:** rodar `npm run test:e2e` sem `.env`.
- **Esperado:** a suíte roda sem segredos e sem serviços externos, conforme E00-T09.
- **Obtido:** falha com `OPENAI_API_KEY não está definida`; depois com `OPENAI_MODEL não está definida`; depois com `Can't reach database server`.
- **Evidência:** construtor de [ocr.service.ts](../../backend/src/ocr/ocr.service.ts).
- **Status:** corrigido em 16/10 - [test-env.ts](../../backend/test/support/test-env.ts) define valores falsos, `OcrService` e o upload são simulados e `npm run test:db:up` sobe o banco de teste.

### BUG-008 - `start:prod` e Dockerfile apontam para arquivo inexistente

- **Severidade:** P2
- **Responsável sugerido:** Enzo (release)
- **Passos:** `npm run build` e depois `npm run start:prod`.
- **Esperado:** API inicia.
- **Obtido:** `Error: Cannot find module '.../backend/dist/main'`. O build gera `dist/src/main.js`, provavelmente porque [app.controller.ts](../../backend/src/app.controller.ts) importa `../package.json`, o que move a raiz da compilação. O `CMD ["node", "dist/main"]` do `Dockerfile` tem o mesmo problema.
- **Impacto:** a Vercel usa `api/index.ts` e não é afetada. Afetam-se Docker e qualquer execução com `start:prod`.

### BUG-009 - Erros do app descartados em produção e sem `ErrorBoundary`

- **Severidade:** P2
- **Responsável sugerido:** frente de experiência (E00-T05)
- **Passos:** ler [logger.ts](../../frontend/lib/logger.ts) e buscar `ErrorBoundary` em `frontend/`.
- **Esperado:** erros de produção chegam a um coletor; uma falha de renderização mostra tela recuperável.
- **Obtido:** em produção todas as chamadas do `logger` são descartadas; não existe `ErrorBoundary`. Há 153 chamadas de log no app, várias registrando o objeto de erro completo (por exemplo, em `profile.tsx`, `camera.tsx`, `edit.tsx`), que em erros Axios inclui cabeçalhos da requisição.

### BUG-010 - Script de carga imprime p95 como `NaN`

- **Severidade:** P3
- **Responsável sugerido:** Enzo
- **Passos:** `npm run load:test:health`.
- **Esperado:** valor de p95 em milissegundos.
- **Obtido:** `Latency p95: NaN ms`. O autocannon não calcula p95; os percentis disponíveis são p90, p97,5 e p99.
- **Evidência:** [load-test.cjs](../../backend/scripts/load-test.cjs).

### BUG-011 - Fluxo de release bloqueado pelo workflow de restrição

- **Severidade:** P2
- **Responsável sugerido:** Enzo (release)
- **Passos:** abrir PR de `release/x.y` para `main`.
- **Esperado:** PR aceito, conforme o fluxo `branch → develop → release → main`.
- **Obtido:** o job falha, porque [restrict_prs.yml](../../.github/workflows/restrict_prs.yml) só aceita `develop` e `hotfix/*`.
- **Status:** corrigido nesta mesma entrega.

### BUG-012 - Finalizar uma conta grava divisão na conta de outro usuário

- **Severidade:** P1
- **Responsável sugerido:** Gabriel (segurança)
- **Passos:** usuário B finaliza a própria conta enviando, junto com as divisões válidas, uma divisão com `billItemId` e `participantId` da conta do usuário A.
- **Esperado:** 400 ou 403, sem alterar a conta de A.
- **Obtido:** 201, e a conta de A passa a ter uma divisão de R$ 0,01 criada por B. O `finalize` valida a soma só dos itens da própria conta e faz `upsert` de todas as divisões recebidas, sem conferir a que conta pertencem. A rota `POST /divisions` faz essa verificação; o `finalize` não.
- **Exploração:** exige conhecer os UUIDs do item e do participante de outra pessoa, o que reduz a probabilidade, mas não o impacto.
- **Evidência:** [bills.service.ts](../../backend/src/bills/bills.service.ts) (`validateFinalize` e `finalize`); teste `BUG-012` em [isolation.e2e-spec.ts](../../backend/test/smoke/isolation.e2e-spec.ts), marcado como `it.failing` até a correção.
- **Correção sugerida:** rejeitar divisões cujo item ou participante não pertença à conta antes de qualquer escrita, e fazer as escritas em uma transação.

### BUG-013 - Fila de OCR pode passar do limite de tentativas

- **Severidade:** P2 (custo de OCR e futura cobrança de créditos)
- **Responsável sugerido:** Lucas (OCR)
- **Passos:** OCR simulado falhando sempre; enviar uma imagem e acompanhar a conta pelo `GET /bills/:id`, como o app faz.
- **Esperado:** no máximo `OCR_QUEUE_MAX_ATTEMPTS` (3) chamadas ao provedor.
- **Obtido:** em 2 de 13 execuções o job terminou com `attempts = 4`.
- **Causa:** `claimNextJob` lê o job, depois o marca como `RUNNING` conferindo só `status: PENDING`, e `runJob` decide a retentativa com o valor de `attempts` lido antes do incremento. O disparo do upload, o polling da conta e o cron rodam `processPendingJobs` em paralelo; dois deles podem "ganhar" o mesmo job em sequência com o contador desatualizado.
- **Evidência:** [ocr-queue.service.ts](../../backend/src/ocr/ocr-queue.service.ts).
- **Correção sugerida:** incluir `attempts: job.attempts` no `where` do `updateMany` (trava otimista) e usar o valor já incrementado para decidir a retentativa.

### BUG-014 - Rotas `/bill-items` geradas pelo Nest ficam públicas

- **Severidade:** P3
- **Responsável sugerido:** Enzo
- **Obtido:** [bill-items.controller.ts](../../backend/src/bill-items/bill-items.controller.ts) expõe `GET/POST/PATCH/DELETE /bill-items` sem autenticação. O serviço só devolve textos fixos ("This action returns all billItems"), então não há acesso a dados, mas as rotas não são usadas e confundem auditorias.
- **Correção sugerida:** remover o controller e manter apenas os DTOs, que são usados por `BillsController`.

### Observações de segurança para revisão (P3)

Registradas para a frente de segurança decidir se viram itens `BUG-###`:

- o logout revoga só o refresh token; o access token continua válido até expirar;
- se a consulta de tokens revogados falhar (por exemplo, banco indisponível), o [jwt.strategy.ts](../../backend/src/auth/strategies/jwt.strategy.ts) aceita o token mesmo assim;
- erros de criação de conta devolvem ao cliente a mensagem interna da exceção (`Erro ao criar conta: ${error.message}`);
- [divisions.service.ts](../../backend/src/divisions/divisions.service.ts) registra com `console.log` IDs de usuário e item a cada validação;
- a configuração da aplicação (helmet, `ValidationPipe`, CORS) está duplicada em `src/main.ts` e `api/index.ts`; uma divergência entre os dois só apareceria em produção.

## 6. Testes de fumaça (simulação dos fluxos)

Como não houve aparelho nem chave real da OpenAI disponíveis, os fluxos críticos foram simulados pela API, do mesmo jeito que o app chama o backend. A suíte fica em [backend/test/smoke](../../backend/test/smoke).

| Suíte | O que verifica | Testes |
| --- | --- | ---: |
| `auth` | Cadastro, login, token ausente ou inválido, bloqueio de cadastro como ADMIN, refresh e logout | 5 |
| `manual-bill-flow` | Conta manual → itens → participantes → divisão → taxa de 10% → finalização → resumo por pessoa → histórico → exclusão | 8 |
| `isolation` | Outro usuário não lê, não altera, não finaliza e não exclui a conta; inclui o BUG-012 | 5 |
| `ocr-queue` | Upload → fila → itens para revisão; falha transitória com retentativa; esgotamento e reprocessamento; arquivo inválido; segredo do cron | 5 |
| `rate-limit` | Quarta tentativa de login no mesmo minuto recebe 429 | 1 |
| `app` | `GET /` e `GET /health` | 2 |

O que é real e o que é simulado:

| Componente | Nos testes |
| --- | --- |
| API NestJS, validação, guards, banco e fila de OCR | Reais |
| OpenAI (`OcrService.processImage`) | Simulada; devolve uma nota fictícia ou o erro configurado no teste |
| Upload para S3 ou disco (`StorageService.uploadFile`) | Simulado; não grava arquivos |
| Rate limit | Desligado nas suítes que criam muitas contas; ligado em `rate-limit` |
| Dados | Usuários `@smoke.test` criados e removidos por suíte; nenhum dado real |

Medições com o OCR simulado:

- leitura bem-sucedida com provedor simulado de 200 ms: 253 ms do upload até os itens em revisão, ou seja, cerca de 50 ms de fila, banco e polling;
- leitura com uma falha transitória: concluída em 38 ms, com 2 tentativas;
- esgotamento de 3 tentativas e reprocessamento: 381 ms.

Estes números medem a fila, não a OpenAI. A latência e o custo reais dependem de uma leitura com a chave da equipe (seção 8).

Estabilidade: 20 execuções seguidas com `npm run test:e2e` e 5 com quatro workers em paralelo, todas verdes.

## 7. Lacunas de cobertura

Não são bugs, mas limitam a capacidade de detectar regressões:

| Lacuna | Situação atual | Task que trata |
| --- | --- | --- |
| E2E da API | 26 testes de fumaça; ainda não rodam no CI | E00-T09 / E00-T10 |
| Testes do app | 0 arquivos de teste, sem script `test` | E00-T09 (checklist de dispositivo) |
| Typecheck do app | Passa com `npx tsc --noEmit`, mas não há script nem execução automática | E00-T10 (`feat/ci-quality-gate`) |
| Gate de PR | Não existe workflow de testes e build em PRs | E00-T10 (`feat/ci-quality-gate`) |
| Medição de OCR | Sem duração, tokens ou custo persistidos | E00-T07 |

## 8. Pendências desta task

- [x] Fluxos críticos da API (login, criação manual, upload, OCR, participantes, divisão, resumo, histórico) - simulados pela suíte de fumaça.
- [ ] Verificação visual no aparelho ou emulador: tema claro/escuro, fonte 1.4, câmera/galeria e reabrir o app no meio do fluxo (frente de experiência).
- [ ] Uma leitura de OCR real com a chave da equipe, para registrar duração, tokens e custo (frente de OCR).
- [ ] Confirmar responsáveis dos P1 (BUG-001, BUG-002, BUG-003, BUG-012) na weekly.
- [ ] Incluir `npm run test:e2e` no workflow de qualidade (`feat/ci-quality-gate`) com um serviço Postgres.
- [ ] Distribuir a reserva de 20% para bugs depois da confirmação dos responsáveis.

## 9. Como reproduzir este baseline

```bash
cd backend
npm ci

# Testes unitários e build
DATABASE_URL=postgresql://ci:ci@localhost:5432/ci npm test -- --ci
npm run build

# Testes de fumaça: banco descartável na porta 55432 (precisa do Docker)
npm run test:db:up
npm run test:e2e
npm run test:db:down

# Carga: API local apontando para o banco de teste
npm run test:db:up
DATABASE_URL=postgresql://ci:ci@localhost:55432/rateio_test \
DIRECT_URL=postgresql://ci:ci@localhost:55432/rateio_test \
OPENAI_API_KEY=sk-fake OPENAI_MODEL=fake JWT_SECRET=x JWT_REFRESH_SECRET=y \
PORT=3100 node dist/src/main &
LOAD_TEST_URL=http://localhost:3100 npm run load:test:health
LOAD_TEST_URL=http://localhost:3100 npm run load:test:login

cd ../frontend
npm ci
npx tsc --noEmit
```
