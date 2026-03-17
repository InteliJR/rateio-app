# Load Testing

## O que este teste mede

O script `scripts/load-test.cjs` mede trÃªs cenÃ¡rios diferentes:

- `health`: capacidade bruta do backend sem OCR e sem rate limit.
- `login`: valida se o throttle do login estÃ¡ protegendo o endpoint sem bloquear uso normal.
- `auth`: mede um endpoint autenticado de leitura, usando um token real.

## Observabilidade e fila de OCR

O backend agora expÃµe:

- `GET /metrics`: contadores de `4xx`, `5xx`, latÃªncia mÃ©dia e mÃ¡xima por rota.
- `GET /health`: inclui estado do banco, fila de OCR e snapshot das mÃ©tricas.
- `POST /internal/ocr/process-pending`: processa jobs pendentes da fila de OCR.
- `GET /internal/ocr/queue`: mostra o estado da fila de OCR.

As rotas internas exigem o header `x-internal-cron-secret` com o valor de `INTERNAL_CRON_SECRET`.

## Como rodar

Suba o backend localmente ou use a URL publicada na Vercel.

```bash
npm run load:test:health
```

```bash
LOAD_TEST_URL=https://seu-backend.vercel.app npm run load:test:health
```

```bash
LOAD_TEST_URL=https://seu-backend.vercel.app \
LOAD_TEST_LOGIN_EMAIL=usuario@exemplo.com \
LOAD_TEST_LOGIN_PASSWORD=senha \
npm run load:test:login
```

```bash
LOAD_TEST_URL=https://seu-backend.vercel.app \
LOAD_TEST_BEARER_TOKEN=seu-jwt \
npm run load:test:auth
```

TambÃ©m Ã© possÃ­vel ajustar a carga:

- `LOAD_TEST_CONNECTIONS`: padrÃ£o `20`
- `LOAD_TEST_DURATION`: padrÃ£o `20` segundos
- `LOAD_TEST_PIPELINING`: padrÃ£o `1`
- `LOAD_TEST_AUTH_PATH`: padrÃ£o `/bills?page=1&limit=10`

## Como interpretar

- `4xx` alto no `login` normalmente indica throttle do app, nÃ£o falta de infra.
- `5xx` alto no `health` sugere saturacÃ£o real de runtime, banco ou cold starts.
- `5xx` alto em upload/OCR tende a apontar para OpenAI, timeout de serverless ou processamento sÃ­ncrono longo.
- `p95` acima de 1000 ms em `health` com pouco erro jÃ¡ indica degradaÃ§Ã£o perceptÃ­vel.

## DiagnÃ³stico para este projeto

Hoje o risco maior nÃ£o parece ser "Vercel pequena demais" por si sÃ³. HÃ¡ dois gargalos mais provÃ¡veis:

1. O rate limit global estava muito baixo para uso normal.
2. O backend estava atrÃ¡s de proxy sem confiar no IP real do cliente, o que pode agrupar muitos usuÃ¡rios no mesmo identificador e gerar `429` indevido.
3. O OCR era processado dentro do request. Agora ele foi movido para fila no banco para o upload responder rÃ¡pido.

## Quando ficar na Vercel

Pode continuar na Vercel se:

- `health` e `auth` sustentarem a sua carga alvo com `5xx` prÃ³ximo de zero.
- O problema principal desaparecer ao corrigir proxy e throttle.
- A fila de OCR escoar normalmente com baixa taxa de falha.
- VocÃª configurar um cron externo ou cron da plataforma para chamar `POST /internal/ocr/process-pending`.

## Quando migrar para AWS

Vale considerar AWS se ocorrer um destes casos depois dos ajustes:

- vocÃª precisa de processamento OCR concorrente e previsÃ­vel;
- o tempo de resposta do OCR estoura o limite prÃ¡tico do serverless;
- a aplicaÃ§Ã£o passa a exigir filas, workers e jobs assÃ­ncronos;
- o custo da Vercel sobe por execuÃ§Ãµes longas e bursts frequentes.

Nesse cenÃ¡rio, o ganho real nÃ£o Ã© "AWS por AWS", e sim mover OCR para fila assÃ­ncrona com worker dedicado.
