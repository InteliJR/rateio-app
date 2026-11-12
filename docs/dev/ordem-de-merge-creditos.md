# Ordem de merge dos PRs que tocam créditos

**Frentes envolvidas:** 01 — Qualidade, 02 — OCR e IA, 03 — Créditos e Ledger, 04 — Monetização

**Atualizado em:** 12 de novembro de 2026

**Status:** acordo de merge, para evitar regressão

## 1. Por que este documento existe

Dezessete pull requests estão abertos, e boa parte deles mexe nos mesmos arquivos: `credits.service.ts`, `credits.controller.ts`, `ocr-queue.service.ts` e `schema.prisma`.

Mergear fora de ordem não dá conflito em todos os casos. Em alguns o git aceita em silêncio e **apaga código que já estava na `develop`**.

Isso quase aconteceu: o PR #245 carrega uma cópia do `credits.controller.ts` anterior ao merge do ledger, com só a rota de saldo. Entrar sem rebase apagaria o histórico e o ajuste administrativo. O caso está descrito na seção 4.

## 2. O que já está na `develop`

| PR | O que trouxe | Mergeado em |
| --- | --- | --- |
| #230 | verificação de compras da Google Play | 22/10 |
| #231 | ledger de créditos, API de saldo, histórico, ajuste administrativo e ligação com a fila | 05/11 |
| #235 | correções de segurança em contratos de log e segredos | 29/10 |
| #238 | correlação de logs, proteção de uploads e blindagem de health e metrics | 12/11 |
| #243 | compra alimentando o ledger, mais `NegativeBalanceError` e `AdjustReferenceConflictError` | 12/11 |

O #238 estabeleceu o contrato de log que vale para todo mundo: **nunca a mensagem crua do erro**, só classe, status e código curto. A mensagem pode conter a URL assinada da imagem ou trecho da nota.

## 3. As três pilhas abertas

```text
OCR e IA (Lucas), sete níveis
  #236 → #239 → #240 → #245 → #246 → #248 → #251

Créditos (Lucas Delmirio, depois Enzo), dois níveis
  #250 → #253

Compras (Fabi, depois Enzo), dois níveis
  #241 → #252
```

Direto na `develop`, sem dependência: **#232**, **#233**, **#249** (meus), **#242** (Fabi), **#244** e **#247** (Lucas).

Consequência prática: **nenhum PR do meio de uma pilha pode ser rebaseado sozinho.** Rebasear o topo arrasta tudo que está embaixo. A ordem é de baixo para cima, e cada autor rebaseia o seu depois que o de baixo entrar.

## 4. A regressão já identificada

O `credits.controller.ts` do PR #245 tem **apenas** `GET /credits/balance`, porque a base dele é anterior ao merge do #231. A `develop` hoje tem três rotas:

| Rota | Critério de aceite |
| --- | --- |
| `GET /credits/balance` | EPIC-02, consulta de saldo |
| `GET /credits/history` | EPIC-02, "expor saldo, histórico resumido e motivo de cada alteração" |
| `PATCH /credits/:userId/adjust` | EPIC-02, "alterações administrativas registram autor, motivo e data" |

Se o #245 entrar sem rebase, as duas últimas somem junto com `dto/adjust-credits.dto.ts`, e dois critérios de aceite voltam a ficar em aberto.

O `credits.service.ts` daquele PR já tem o `adminAdjust` e a correção do BUG-015, então falta só o controller e o DTO.

## 5. Ordem recomendada

**Primeiro, o que não conflita com nada.**

1. **#232** — gate de qualidade. Vem antes de todos: a partir dele, todo PR passa a rodar testes, build e tipos automaticamente.
2. **#249**, **#244**, **#247** — documentação e testes, risco zero.
3. **#233**, **#242** — só aplicativo, não encostam no backend.

**Segundo, a pilha de créditos.** #250, depois #253. São dois PRs pequenos e já revisados.

**Terceiro, a pilha de OCR**, de baixo para cima: #236, #239, #240, #245, #246, #248, #251. Cada um rebaseia antes de entrar.

**A pilha de compras** (#241 → #252) é independente das outras duas e pode entrar a qualquer momento.

### Por que os créditos antes do OCR

O #245 precisa de rebase de qualquer jeito, pela seção 4. Se a `develop` já tiver a versão final dos créditos, ele resolve uma vez só, em vez de resolver agora e de novo depois.

## 6. Conferência antes de cada merge

Para qualquer PR que toque créditos:

- [ ] a branch foi rebaseada na `develop` atual;
- [ ] `credits.controller.ts` continua com as três rotas da seção 4;
- [ ] `schema.prisma` termina com cada modelo fechando no seu próprio `@@map`;
- [ ] nenhum log novo imprime a mensagem crua do erro, conforme o contrato do #238;
- [ ] a suíte do backend passa;
- [ ] nenhuma migration existente foi editada, só acrescentada.

O terceiro item merece atenção: quando duas branches acrescentam modelos no fim do `schema.prisma`, o git tenta fundir os dois blocos e embaralha os campos. Já aconteceu duas vezes neste repositório.

## 7. Como uma frente afeta a outra

| Frente | PRs | Efeito sobre créditos |
| --- | --- | --- |
| OCR e IA | #245, #246 | reescrevem `ocr-queue.service.ts` e `credits.service.ts`. Conflito direto com #250 e #253 |
| Compras | #241, #252 | alimentam o ledger pelo `CreditsGranter`. O #252 muda quando a compra é gravada, logo quando o crédito é concedido |
| Segurança | #238, mergeado | mudou o contrato de log, que vale para todo código novo de crédito |
| Aplicativo | #242 | traz a biblioteca de compra que as telas de crédito vão consumir |
| Métricas | #240, #251 | é onde a comparação entre custo de IA e receita vai aparecer |

## 8. Decisões pendentes com a cliente

As três travam comportamento já escrito em código. Quanto mais tarde a resposta vier, mais caro fica mudar.

1. **A cota gratuita renova?** Hoje é concedida uma vez por usuário, e o campo `resetsAt` da API volta nulo.
2. **Tentar de novo depois de uma falha consome outra leitura?** O #245 implementa que sim, pelo `creditRun`. Antes dele, não consumia.
3. **Leitura feita pelo leitor de contingência deve ser cobrada?** Hoje não é, e os itens são gravados na conta do mesmo jeito. Quem cair sempre nesse caminho lê de graça.

Uma quarta questão, que é nossa e não da cliente: **o custo estimado no #240 está em dólar e a receita em real.** Sem registrar a cotação usada, ninguém consegue responder se uma leitura dá lucro.
