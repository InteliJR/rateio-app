# Ordem de merge dos PRs que tocam créditos

**Frentes envolvidas:** 02 — OCR e IA, 03 — Créditos e Ledger, 04 — Monetização

**Atualizado em:** 11 de novembro de 2026

**Status:** acordo de merge, para evitar regressão

## 1. Por que este documento existe

Cinco pull requests abertos mexem no mesmo conjunto de arquivos: `credits.service.ts`, `credits.controller.ts`, `ocr-queue.service.ts` e `schema.prisma`. Três deles nasceram antes de o ledger entrar na `develop`, em 5 de novembro, pelo PR #231.

Quem nasceu antes carrega uma cópia antiga desses arquivos. Mergear fora de ordem não dá conflito em todos os casos: em alguns o git aceita em silêncio e **apaga código que já estava na `develop`**.

Já existe um caso concreto, descrito na seção 3.

## 2. A pilha do OCR

Os PRs da frente de OCR são encadeados, cada um com base no anterior:

```text
develop
  └── #236  feat/metricas-ocr
        └── #239  feat/ocr-idempotencia
              └── #240  feat/ocr-persistencia-metricas
                    └── #245  feat/ocr-integracao-creditos
```

Consequência prática: **o #245 não pode ser rebaseado sozinho na `develop`**. Rebasear o topo da pilha arrasta todo o resto junto e desfaz o encadeamento. A ordem é de baixo para cima, e cada autor rebaseia o seu depois que o de baixo entrar.

## 3. A regressão já identificada

O PR #231 entrou na `develop` em 5 de novembro trazendo três rotas de crédito:

| Rota | O que faz | Critério de aceite |
| --- | --- | --- |
| `GET /credits/balance` | saldo do usuário | EPIC-02, consulta de saldo |
| `GET /credits/history` | histórico paginado, com o motivo de cada alteração | EPIC-02, "expor saldo, histórico resumido e motivo de cada alteração" |
| `PATCH /credits/:userId/adjust` | ajuste do suporte, restrito a ADMIN | EPIC-02, "alterações administrativas registram autor, motivo e data" |

O `credits.controller.ts` do PR #245 tem **apenas** `GET /credits/balance`, porque a base dele é anterior ao merge. Se ele entrar sem rebase, as outras duas rotas desaparecem, junto com `dto/adjust-credits.dto.ts`, e dois critérios de aceite voltam a ficar em aberto.

O `credits.service.ts` do #245 já tem o `adminAdjust` e a correção do BUG-015, então o que falta é só o controller e o DTO.

## 4. Ordem acordada

1. **#236** — métricas de OCR. Base `develop`, entra primeiro.
2. **#239** — idempotência. Rebase em `develop`, depois merge.
3. **#240** — persistência de métricas. Mesma coisa.
4. **#245** — integração com créditos. Rebase em `develop` e **conferir o `credits.controller.ts` antes de aprovar**, pela seção 3.
5. **#241 e #242** — compras por quantidade e `expo-iap`. Independentes da pilha; podem entrar a qualquer momento.
6. **#243** — ainda traz o ledger inteiro, que já mergeou. Precisa de rebase antes de ser revisado.

## 5. Conferência antes de cada merge

Para qualquer PR que toque créditos:

- [ ] a branch foi rebaseada na `develop` atual;
- [ ] `credits.controller.ts` continua com as três rotas;
- [ ] `schema.prisma` termina com cada modelo fechando no seu próprio `@@map`;
- [ ] a suíte do backend passa;
- [ ] nenhuma migration existente foi editada, só acrescentada.

O terceiro item merece atenção: quando duas branches acrescentam modelos no fim do `schema.prisma`, o git tenta fundir os dois blocos e embaralha os campos. Já aconteceu duas vezes neste repositório.

## 6. Decisões pendentes com a cliente que afetam estes PRs

As duas travam comportamento já escrito em código, e quanto mais tarde a resposta vier, mais caro fica mudar:

1. **A cota gratuita renova?** Hoje é concedida uma vez por usuário, e o campo `resetsAt` da API volta nulo.
2. **Tentar de novo depois de uma falha consome outra leitura?** O #245 implementa que sim, através do `creditRun`. Antes dele, não consumia.

Uma terceira apareceu na revisão do #245: **leitura feita pelo leitor de contingência não é cobrada**, e os itens são gravados na conta do mesmo jeito. Quem cair sempre nesse caminho lê de graça.
