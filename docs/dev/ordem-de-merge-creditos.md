# Ordem de merge dos PRs que tocam créditos

**Frentes envolvidas:** 01 — Qualidade, 02 — OCR e IA, 03 — Créditos e Ledger, 04 — Monetização

**Atualizado em:** 26 de novembro de 2026

**Status:** acordo de merge, para evitar regressão

## 1. Por que este documento existe

Vários pull requests abertos mexem nos mesmos arquivos: `credits.service.ts`, `credits.controller.ts`, `ocr-queue.service.ts` e `schema.prisma`.

Mergear fora de ordem não dá conflito em todos os casos. Em alguns o git aceita em silêncio e **apaga código que já estava na `develop`**. O caso concreto está na seção 4.

## 2. Duas regras do repositório que travam o merge

**Toda PR para a `develop` precisa de uma aprovação formal.** Comentário não conta: é preciso usar **Approve** na aba de revisão. O autor não aprova o próprio PR. Até novembro nenhum PR tinha aprovação formal, e por isso nada era mergeado mesmo depois de revisado.

**Desde 20/11, todo PR passa pelo workflow de qualidade** (`.github/workflows/quality.yml`): testes e build do backend e tipos do aplicativo. O workflow só roda num PR se a branch já contiver o arquivo. Branch criada antes de 20/11 precisa de **Update branch** (ou merge da `develop`) para o CI rodar nela.

## 3. O que já está na `develop`

| PR | O que trouxe | Mergeado em |
| --- | --- | --- |
| #230 | verificação de compras da Google Play | 22/10 |
| #235 | correções de segurança em contratos de log e segredos | 28/10 |
| #231 | ledger de créditos, API de saldo, histórico, ajuste administrativo e ligação com a fila | 05/11 |
| #238 | correlação de logs, proteção de uploads e blindagem de health e metrics | 12/11 |
| #243 | compra alimentando o ledger, mais `NegativeBalanceError` e `AdjustReferenceConflictError` | 12/11 |
| #254 | correções de segurança, parte 2 | 16/11 |
| #241 | compras da Google Play creditadas por quantidade | 18/11 |
| #232 | workflow de qualidade nos pull requests | 20/11 |
| #250 | renovação da reserva de crédito a cada reivindicação do trabalho | 26/11 |
| #233 | telas de crédito no aplicativo e `ErrorBoundary` na raiz | 26/11 |

O #238 estabeleceu o contrato de log que vale para todo código novo: **nunca a mensagem crua do erro**, só classe, status e código curto. A mensagem pode conter a URL assinada da imagem ou trecho da nota.

## 4. A regressão que continua valendo

O `credits.controller.ts` do PR #245 tem **apenas** `GET /credits/balance`, porque a base dele é anterior ao merge do #231. A `develop` tem três rotas:

| Rota | Critério de aceite |
| --- | --- |
| `GET /credits/balance` | EPIC-02, consulta de saldo |
| `GET /credits/history` | EPIC-02, "expor saldo, histórico resumido e motivo de cada alteração" |
| `PATCH /credits/:userId/adjust` | EPIC-02, "alterações administrativas registram autor, motivo e data" |

Se o #245 entrar sem rebase, as duas últimas somem junto com `dto/adjust-credits.dto.ts`, e dois critérios de aceite voltam a ficar em aberto. As telas do app (#233) já consomem a primeira.

## 5. O que está aberto

**Pilha de OCR (Lucas Cunha), sete níveis:**

```text
#236 → #239 → #240 → #245 → #246 → #248 → #251
```

| PR | Situação |
| --- | --- |
| #236 | **aprovado e mesclável**, base da pilha |
| #239 | com conflito na própria base |
| #240 | dois pontos para decidir: custo em dólar contra receita em real, e guardar `creditRun` na linha de métrica |
| #245 | regressão do controller (seção 4) |
| #246, #248, #251 | revisados, esperando os de baixo |

**Créditos:** #253 (Enzo), devolução de reservas vencidas no ciclo da fila. Base `develop` desde 26/11. Tem dois ajustes pedidos: a renovação alcança todas as leituras do trabalho, o que pode eternizar uma reserva órfã com o #245, e o log do catch imprime a mensagem crua do erro.

**Compras:** #252 (Enzo), consulta a Google antes de gravar a compra. A base ainda é `feat/purchases-quantity`, cujo PR (#241) já entrou. Precisa ser reapontado para a `develop` antes do merge.

**Soltos:**

| PR | Situação |
| --- | --- |
| #247 | **aprovado e mesclável** |
| #242 | aguardando confirmação do `expo-doctor` |
| #244 | runbook: falta trocar a orientação do cenário D, que do jeito atual devolve crédito em dobro |
| #255 | segurança, parte 3, em revisão |
| #249 | este documento |

## 6. Ordem recomendada

1. **#236** e **#247**: já aprovados, só falta o autor mergear. O #236 destrava a pilha de OCR.
2. **#253**, depois dos dois ajustes. Vem antes do #245 pelo motivo da seção 4.
3. **#244**, **#242** e **#249**, quando aprovados: não conflitam com nada.
4. **Pilha de OCR**, de baixo para cima: #239, #240, #245, #246, #248, #251. Cada um atualiza com a `develop` antes de entrar.
5. **#252**, depois de reapontado para a `develop`. Independente dos demais.

### Cuidado ao apagar branch no merge

Mergear um PR apagando a branch **fecha** os PRs que usam essa branch como base, em vez de reapontá-los. Aconteceu com o #253 quando o #250 entrou. Antes de mergear a base de uma pilha, reaponte o PR de cima para a `develop`, ou mergeie sem apagar a branch e apague depois.

## 7. Conferência antes de cada merge

Para qualquer PR que toque créditos:

- [ ] tem aprovação formal, não só comentário;
- [ ] o workflow de qualidade rodou e passou neste PR (se não rodou, a branch é anterior a 20/11 e precisa de **Update branch**);
- [ ] `credits.controller.ts` continua com as três rotas da seção 4;
- [ ] `schema.prisma` termina com cada modelo fechando no seu próprio `@@map`;
- [ ] nenhum log novo imprime a mensagem crua do erro, conforme o contrato do #238;
- [ ] nenhuma migration existente foi editada, só acrescentada;
- [ ] nenhum PR aberto usa a branch deste como base, ou já foi reapontado.

O quarto item merece atenção: quando duas branches acrescentam modelos no fim do `schema.prisma`, o git tenta fundir os dois blocos e embaralha os campos. Já aconteceu duas vezes neste repositório.

## 8. Como uma frente afeta a outra

| Frente | PRs | Efeito sobre créditos |
| --- | --- | --- |
| OCR e IA | #245, #246 | reescrevem `ocr-queue.service.ts` e `credits.service.ts`. Ao entrar, precisam conciliar a renovação do #250 dentro do `claimNextJob` |
| Compras | #252 | muda quando a compra é gravada, logo quando o crédito é concedido |
| Segurança | #238 (mergeado), #255 | o #255 acrescenta um filtro global de exceções. Quando o #245 entrar com o filtro que transforma `InsufficientCreditsError` em 402, vale um teste garantindo que o 402 chega ao app: é dele que depende a tela de saldo insuficiente |
| Aplicativo | #242 | traz a biblioteca de compra que as telas de crédito vão usar |
| Métricas | #240, #251 | é onde a comparação entre custo de IA e receita vai aparecer |

## 9. Decisões pendentes com a cliente

As três travam comportamento já escrito em código. Quanto mais tarde a resposta vier, mais caro fica mudar.

1. **A cota gratuita renova?** Hoje é concedida uma vez por usuário, e o campo `resetsAt` da API volta nulo.
2. **Tentar de novo depois de uma falha consome outra leitura?** O #245 implementa que sim, pelo `creditRun`. Antes dele, não consome.
3. **Leitura feita pelo leitor de contingência deve ser cobrada?** Hoje não é, e os itens são gravados na conta do mesmo jeito. Quem cair sempre nesse caminho lê de graça.

Uma quarta questão, que é nossa e não da cliente: **o custo estimado no #240 está em dólar e a receita em real.** Sem registrar a cotação usada, ninguém consegue responder se uma leitura dá lucro.
