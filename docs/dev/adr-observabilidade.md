# ADR — Observabilidade da API e do aplicativo

## 1. Contexto e problema

| Problema | Onde | Referência |
| --- | --- | --- |
| Métricas vivem na memória da instância e somem a cada cold start ou nova instância da Vercel | [metrics.service.ts](../../backend/src/observability/metrics.service.ts) | E00-T04 |
| `/metrics` e `/health` são públicos; `/health` devolve fila, métricas e a mensagem do último erro | [metrics.controller.ts](../../backend/src/observability/metrics.controller.ts), [app.controller.ts](../../backend/src/app.controller.ts) | BUG-001, BUG-002 |
| Métricas não contam 401, 404 e 429 | `metrics.interceptor.ts` | BUG-004 |
| Respostas sem `x-request-id`; não dá para ligar um erro do app a um log da API | backend | BUG-005 |
| O app descarta todos os logs em produção e não tem `ErrorBoundary` | [logger.ts](../../frontend/lib/logger.ts) | BUG-009 |

Os bugs estão em [baseline-qualidade-2026-10-14.md](baseline-qualidade-2026-10-14.md).

Restrições:

- **custo zero** até a publicação, com limite de gasto configurável;
- **LGPD:** dados de usuários brasileiros; nenhum dado pessoal nos eventos; preferir hospedagem com contrato de tratamento de dados (DPA);
- **Vercel serverless:** sem processo de longa duração para um agente/coletor; a função pode congelar logo depois da resposta. **Log Drains e Trace Drains exigem o plano Pro** da Vercel;
- **Expo 54 com development build/EAS:** o SDK precisa funcionar sem ejetar e enviar source maps no build.

## 2. Opções avaliadas

Preços e limites consultados em 21/10/2026 nas páginas oficiais (seção 11).

| Opção | Plano gratuito | Vercel serverless | Expo | LGPD | Observação |
| --- | --- | --- | --- | --- | --- |
| **Sentry** | 5 mil erros/mês, **1 usuário**, 30 dias | SDK Node; precisa de `flush` antes de responder | Excelente (wizard, source maps automáticos no EAS) | Região UE disponível | Melhor ferramenta de erro, mas 1 usuário não serve a 6 pessoas; Team custa US$ 29/mês |
| **Grafana Cloud + OpenTelemetry** | 10 mil séries, 50 GB de logs e 50 GB de traces, 14 dias, 3 usuários | Exportar OTLP de função serverless exige flush a cada requisição; sem drain, é o mais trabalhoso | Não é ferramenta de erro do app | Região UE disponível | Forte para métricas e alertas; caro em esforço para o prazo |
| **Axiom** (via drain ou SDK) | 500 GB/mês, 30 dias, 1 usuário, 3 monitores | Sem drain no Hobby: envio pelo SDK `@axiomhq/js` em lote com flush | Não é ferramenta de erro do app | A verificar região/DPA | Consultas (APL) dão p50/p95 por rota; 3 monitores bastam para os alertas mínimos |
| **Better Stack** (via drain) | Plano gratuito pequeno de logs | Depende do drain (Pro) | Não | — | Descartado: sem drain não traz vantagem sobre o Axiom |
| **PostHog** | 1 milhão de eventos e **100 mil exceções**/mês, limite de gasto, sem cartão | SDK `posthog-node` com `flush`/`shutdown` | SDK React Native compatível com Expo | **Hospedagem na UE**, DPA disponível | Funil, erros do app e eventos de negócio numa ferramenta só; usuários ilimitados |
| **Só Postgres + logs da Vercel** | Grátis | Nativo | — | Dados ficam no nosso banco | Logs de runtime no Hobby duram pouco; não há painel nem alerta |

## 3. Decisão

1. **Aplicativo (erros e funil): PostHog Cloud UE.**
   - erros com `captureException` no `ErrorBoundary` e em rejeições não tratadas, mais os eventos do funil (E00-T06);
   - **desligados:** autocapture, session replay, captura de tela, geolocalização por IP (`$ip` descartado) e perfis de pessoa;
   - o adaptador de telemetria do app (E00-T05) esconde o fornecedor: trocar por Sentry depois é mudar um arquivo.
2. **API (logs estruturados, latência e alertas): JSON no stdout + Axiom.**
   - toda linha de log é JSON (seção 6), escrita no stdout, o que já funciona nos logs da Vercel;
   - envio ao Axiom pelo SDK em lote, com flush no fim da requisição. Com o plano Pro da Vercel, trocar pelo Log Drain sem mudar o formato;
   - p50/p95, volume e taxa de 5xx por rota normalizada saem de consultas, sem contadores em memória.
3. **OCR e créditos: Postgres como fonte da verdade.** Duração, tentativas, categoria de erro, modelo, tokens e custo ficam no `OcrJob` (E00-T07); ledger e compras já estão no banco. O painel lê esses dados; os eventos `ocr_*` no PostHog servem só para o funil.
4. **`/metrics` em memória é aposentado:** `/health` público passa a devolver só `{ status }`, e o detalhe vai para rota interna protegida pelo segredo do cron (E00-T04).

Por quê:

- é a única combinação que cabe no gratuito com a equipe inteira tendo acesso (o PostHog não limita usuários);
- não depende do plano Pro da Vercel;
- o PostHog já entrega o funil, que de outra forma seria uma terceira ferramenta;
- o dado de negócio (OCR, crédito, compra) fica no banco, auditável e sem limite de retenção de fornecedor.

Custo aceito: o Sentry simboliza stack traces nativos melhor. Se crashes nativos aparecerem na trilha interna, reavaliar o Sentry Team (US$ 29/mês) só para o app.

## 4. Catálogo de eventos e métricas

### Padrão de nomes

- `snake_case`, no formato `<objeto>_<ação no passado>`: `bill_created`, `ocr_processing_failed`;
- toda emissão leva `schema_version` (inteiro, começa em `1`). Mudar o significado ou o tipo de uma propriedade sobe a versão; adicionar uma propriedade opcional não sobe;
- propriedades comuns a todos os eventos: `env` (`development`|`preview`|`production`), `source` (`app`|`api`), `app_version` ou `api_version` (commit curto) e `occurred_at` (ISO 8601, UTC).

### Eventos do funil (E00-T06)

| Evento | Origem | Momento | Propriedades além das comuns |
| --- | --- | --- | --- |
| `auth_login_completed` | app | login aceito pela API | `method`: `password`\|`google` |
| `bill_creation_started` | app | usuário escolhe o tipo de conta | `input_type`: `manual`\|`image` |
| `bill_created` | api | `POST /bills` com sucesso | `input_type`, `bill_id` |
| `bill_image_upload_completed` | app | upload aceito | `bill_id`, `duration_ms`, `size_bucket`: `<1MB`\|`1-3MB`\|`>3MB` |
| `ocr_processing_completed` | api | job `COMPLETED` | `bill_id`, `ocr_job_id`, `attempts`, `duration_ms`, `item_count` |
| `ocr_processing_failed` | api | job `FAILED` (não a cada tentativa) | `bill_id`, `ocr_job_id`, `attempts`, `error_category` |
| `bill_review_completed` | app | usuário confirma os itens | `bill_id`, `edited`: booleano |
| `participants_step_completed` | app | sai da etapa de participantes | `bill_id`, `participant_count_bucket`: `2`\|`3-5`\|`6+` |
| `split_step_completed` | app | divisão salva | `bill_id` |
| `bill_finalized` | api | `finalize` com sucesso | `bill_id`, `input_type` |

Eventos da fatia de créditos, para a semana 3 (mesmo padrão):

| Evento | Origem | Propriedades |
| --- | --- | --- |
| `credit_reserved` / `credit_consumed` / `credit_released` | api | `ocr_job_id`, `reason_category` |
| `credit_insufficient_shown` | app | `screen` |
| `purchase_started` / `purchase_completed` / `purchase_failed` | app/api | `product_id`, `error_category` (nunca `purchaseToken`) |

Regras: um evento por operação lógica (retentativa da fila não emite `ocr_processing_failed`); `ocr_*` e `bill_created` vêm só da API, para não duplicar com o app.

### Categorias de erro

`validation`, `auth`, `forbidden`, `not_found`, `conflict`, `rate_limited`, `insufficient_credits`, `provider_timeout`, `provider_invalid_response`, `provider_error`, `image_missing`, `attempts_exhausted`, `network`, `internal`. Mensagens livres não viram propriedade.

### Métricas da API (consultas no Axiom)

| Métrica | Dimensões permitidas |
| --- | --- |
| volume de requisições | `env`, `method`, `route` (normalizada, ex.: `/bills/:id`), `status_class` |
| taxa de 4xx e 5xx | idem |
| duração p50/p95/p99 | idem |
| profundidade e idade da fila | `env` (a partir do snapshot do cron) |

Proibido como dimensão: URL completa, `userId`, `billId`, mensagem de erro.

## 5. Convenção de identificadores

| Campo | Formato | Quem gera | Onde aparece |
| --- | --- | --- | --- |
| `requestId` | UUID v4; aceita o `x-request-id` recebido se for UUID válido, senão gera | API (E00-T03) | header `x-request-id` na resposta, todo log da requisição, corpo de erro, erros do app |
| `userId` | UUID interno do banco | banco | logs da API (restrito); no PostHog, só como `distinct_id` com hash SHA-256 e sal por ambiente |
| `billId` | UUID interno | banco | logs e eventos, como `bill_id` |
| `ocrJobId` | UUID interno | banco | logs e eventos, como `ocr_job_id`; acompanha a leitura do enfileiramento ao fim |

Nos logs, os campos são `camelCase` (`requestId`, `billId`); nos eventos do PostHog, `snake_case` (`bill_id`). E-mail nunca é usado como identificador.

## 6. Formato dos logs da API

```json
{
  "level": "error",
  "time": "2026-10-21T14:03:12.481Z",
  "env": "production",
  "service": "api",
  "version": "a1b2c3d",
  "requestId": "6f1c...",
  "method": "POST",
  "route": "/bills/:id/retry-ocr",
  "status": 500,
  "durationMs": 182,
  "userId": "4e2a...",
  "billId": "9c0d...",
  "errorCategory": "internal",
  "errorName": "PrismaClientKnownRequestError",
  "errorCode": "P2025",
  "msg": "Falha ao reprocessar OCR"
}
```

Níveis: `error` (5xx e falhas definitivas), `warn` (retentativa, reserva expirada), `info` (início e fim de operação de negócio), `debug` (só em desenvolvimento). O nível mínimo vem de `LOG_LEVEL`.

## 7. Classificação dos dados

| Classe | Dados | Regra |
| --- | --- | --- |
| **Permitido** | `env`, versão, rota normalizada, método, status, duração, categorias, contagens e faixas (`item_count`, `size_bucket`), `requestId`, `billId`, `ocrJobId`, `product_id`, modelo e provedor de OCR, tokens e custo estimado | Pode ir para logs e eventos |
| **Restrito** | `userId` em claro, código de erro do Prisma, nome da exceção, IP (só nos logs da Vercel, nunca enviado adiante) | Só nos logs da API, com acesso restrito; no PostHog só com hash |
| **Proibido** | tokens de acesso e refresh, senhas, cabeçalho `Authorization`, cookies, `purchaseToken`, segredo do cron, URL assinada do S3, imagens, texto de OCR (`rawText`), itens, preços e totais, nome do estabelecimento, nomes e e-mails de usuários e participantes, body e resposta completos, query string | Nunca sai do processo. A sanitização (Gabriel, E00-T03/T05) remove por nome de campo e os testes conferem |

Impacto na Política de Privacidade: hoje ela não cita telemetria. É preciso incluir "dados técnicos de uso e falhas, sem conteúdo das notas" e o PostHog como operador, com hospedagem na UE.

## 8. Retenção, acesso e ambientes

| Item | Decisão |
| --- | --- |
| Retenção de logs (Axiom) | 30 dias (máximo do gratuito) |
| Retenção de eventos e erros (PostHog) | padrão do plano; erros revistos em 90 dias |
| Telemetria de OCR e ledger (Postgres) | segue a retenção da conta; o ledger segue a decisão de retenção da semana 4 (P2) |
| Remoção por pedido do titular | apagar a pessoa no PostHog pelo `distinct_id` com hash, junto com a exclusão da conta |
| Acesso | contas individuais, sem senha compartilhada; Axiom gratuito tem 1 usuário: dono Enzo, painéis compartilhados por link somente leitura |
| Ambientes | um projeto PostHog por ambiente (`dev`, `preview`, `prod`) ou propriedade `env` obrigatória; datasets separados no Axiom (`api-dev`, `api-preview`, `api-prod`). Dev e preview nunca apontam para os dados de produção |
| Chaves | chave pública do PostHog no app via variável `EXPO_PUBLIC_*`; chave de ingestão do Axiom só na Vercel, com permissão apenas de escrita |

## 9. Responsáveis (proposta, confirmar na weekly)

| Painel ou alerta | Responsável | Canal |
| --- | --- | --- |
| Painel da API (volume, erro, p95) e alerta de 5xx sustentado | Enzo (P6) | grupo da equipe |
| Fila e OCR (sucesso, p95, custo, fila parada) | Lucas (P1) | grupo da equipe |
| Falhas do app por versão e tela | Lucas (frontend) | grupo da equipe |
| Funil e conversão | Gabi (produto) | revisão semanal |
| Sanitização, acesso e retenção | Gabriel (P2) | — |
| Ledger e compras (saldo negativo, reserva presa, compra sem crédito) | Enzo (P6) e Fabi (P5) | grupo da equipe |

## 10. Pendente de aprovação

**Produto (Gabi):**

- [ ] aprovar PostHog UE como operador e o texto novo da Política de Privacidade;
- [ ] confirmar os eventos do funil e as faixas (`participant_count_bucket`, `size_bucket`);
- [ ] confirmar se existe orçamento (Sentry Team US$ 29/mês; Vercel Pro para drains), ou se fica só no gratuito;
- [ ] definir o canal de alertas (grupo da equipe, e-mail ou Discord).

**Segurança (Gabriel):**

- [ ] validar a classificação da seção 7, principalmente `userId` em claro nos logs da API;
- [ ] validar o hash com sal para o `distinct_id`;
- [ ] confirmar a região e o DPA do Axiom; se não houver UE, usar o Grafana Cloud UE para os logs;
- [ ] alinhar o formato `x-request-id` com a E00-T03.

**Equipe:**

- [ ] confirmar o plano da Vercel do projeto (Hobby ou Pro), que define SDK ou drain.

## 11. Fontes

- [Sentry — preços](https://sentry.io/pricing/)
- [Expo — Using Sentry](https://docs.expo.dev/guides/using-sentry/)
- [Grafana Cloud — preços](https://grafana.com/pricing/)
- [Axiom — preços](https://axiom.co/pricing)
- [PostHog — FAQ e limites gratuitos](https://posthog.com/faq) e [preço de error tracking](https://posthog.com/docs/error-tracking/pricing.md)
- [Vercel — Drains (Pro e Enterprise)](https://vercel.com/docs/drains)
