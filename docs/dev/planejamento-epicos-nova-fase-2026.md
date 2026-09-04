# Planejamento de épicos — nova fase do Por Partes

**Horizonte:** até 12 semanas

**Equipe:** no mínimo 6 pessoas desenvolvedoras

**Atualizado em:** 25 de agosto de 2026

**Status:** planejamento

## 1. Objetivo da fase

Preparar o Por Partes para crescer de forma sustentável, preservando a divisão manual de contas e evoluindo quatro frentes principais:

1. confiabilidade e custo da leitura de notas fiscais por IA;
2. cobrança avulsa por leituras adicionais (*pay-as-you-go*);
3. anúncios com limites de experiência e privacidade;
4. desempenho, observabilidade e correção contínua de bugs.

Ao fim das 12 semanas, a meta é ter uma versão Android publicável, com compra de créditos validada no servidor, consumo de IA auditável, anúncios controlados por configuração remota e os fluxos críticos protegidos por testes e métricas.

## 2. Premissas e limites

- A entrada e a edição manual de uma conta continuam gratuitas e não dependem de crédito.
- Uma leitura só pode gerar cobrança uma vez. Retentativas técnicas do mesmo trabalho de OCR não consomem créditos adicionais.
- Falhas internas ou do provedor liberam a reserva do crédito; o usuário não paga por uma leitura sem resultado utilizável.
- Créditos são um produto digital consumido no aplicativo Android. A implementação deverá usar o faturamento da Google Play e validar a compra no backend antes de liberar saldo.
- Anúncios não devem interromper login, captura, revisão, divisão ou recuperação de erro.
- Cobrança e anúncios entram atrás de *feature flags* e só são ativados depois da validação técnica, jurídica e de loja.
- Valores, pacotes, cota gratuita e formatos de anúncio são decisões de produto configuráveis, não constantes espalhadas pelo código.

## 3. Capacidade e organização da equipe

A equipe trabalhará em seis sprints de duas semanas. Em cada sprint, no máximo 75% da capacidade deve ser comprometida antecipadamente; os outros 25% ficam reservados para bugs, integração, revisão de loja e imprevistos.

### Duas frentes de trabalho

| Frente | Composição inicial | Responsabilidade principal |
| --- | --- | --- |
| Experiência e aplicativo | 3 pessoas | Fluxos mobile, estados de compra/crédito, anúncios, acessibilidade e desempenho percebido |
| Plataforma e monetização | 3 pessoas | OCR, ledger de créditos, verificação de compras, banco, segurança, observabilidade e desempenho da API |

A separação é de responsabilidade, não de silos. Cada entrega monetizada deve ter uma pessoa de cada frente trabalhando na mesma fatia vertical. Uma pessoa assume a coordenação de release a cada sprint, com rotação, sem deixar de desenvolver.

Ritos mínimos:

- planejamento e demonstração a cada duas semanas;
- sincronização de dependências entre as frentes duas vezes por semana;
- triagem de bugs semanal;
- revisão de métricas e riscos no encerramento de cada sprint.

## 4. Mapa dos épicos

| Épico | Resultado | Janela principal |
| --- | --- | --- |
| EPIC-00 — Qualidade e observabilidade | Baseline, backlog de bugs e telemetria confiável | Sprint 1 e contínuo |
| EPIC-01 — OCR confiável e mensurável | Cada leitura tem estado, custo, retentativa e resultado rastreáveis | Sprints 1–2 |
| EPIC-02 — Cota e ledger de créditos | Saldo consistente e consumo idempotente | Sprints 2–3 |
| EPIC-03 — Compra avulsa pela Google Play | Créditos comprados, verificados e restauráveis | Sprints 3–5 |
| EPIC-04 — Anúncios responsáveis | Receita publicitária sem degradar fluxos críticos | Sprints 4–5 |
| EPIC-05 — Otimização ponta a ponta | App e API dentro dos orçamentos definidos | Sprints 4–5 |
| EPIC-06 — Estabilização e lançamento | Release gradual, observável e reversível | Sprint 6 |

## 5. Detalhamento dos épicos

### EPIC-00 — Qualidade, bugs e observabilidade

**Objetivo:** estabelecer evidências para priorizar problemas e medir o efeito das demais entregas.

**Escopo:**

- inventariar bugs por severidade, frequência e fluxo afetado;
- definir responsáveis e prazo de resposta para P0, P1, P2 e P3;
- instrumentar login, criação manual, upload, fila de OCR, revisão, divisão, finalização e compra;
- padronizar logs com identificadores de usuário, conta, trabalho de OCR e compra, sem dados sensíveis;
- criar painel mínimo de saúde e alertas para erros, latência, fila e gasto de IA;
- criar testes de fumaça para os caminhos críticos.

**Critérios de aceite:**

- todo bug aberto contém reprodução, impacto, ambiente e evidência;
- falhas de OCR e compra podem ser rastreadas de ponta a ponta por identificador;
- há um baseline registrado para taxa de erro, duração do OCR, latência da API e travamentos do app;
- nenhum P0 ou P1 conhecido permanece sem decisão de correção ou contenção.

**Dependências:** nenhuma. Este épico inicia a fase e continua em todas as sprints.

**Backlog detalhado:** [tasks do EPIC-00](./epic-00-qualidade-observabilidade.md).

### EPIC-01 — OCR confiável, idempotente e mensurável

**Objetivo:** transformar a leitura por IA em uma operação previsível antes de cobrar por ela.

**Escopo:**

- formalizar estados da fila, tempo limite, bloqueio, número máximo de tentativas e política de reprocessamento;
- impedir trabalhos duplicados para a mesma solicitação;
- registrar provedor, modelo, duração, tentativas, sucesso, erro e estimativa de custo por leitura;
- validar e normalizar o retorno estruturado antes de gravar itens;
- melhorar mensagens e ações de recuperação no aplicativo;
- definir limites de tamanho e compressão de imagem antes do envio;
- preservar a criação manual quando OCR estiver indisponível.

**Critérios de aceite:**

- duas requisições com a mesma chave de idempotência não criam duas cobranças nem dois resultados concorrentes;
- uma retentativa automática do mesmo trabalho não é apresentada como nova leitura;
- erros transitórios, erros definitivos e erros de validação têm tratamento distinto;
- o painel informa taxa de sucesso, p50/p95 de duração e custo estimado por leitura;
- testes cobrem sucesso, timeout, resposta inválida, duplicidade e esgotamento de tentativas.

**Dependências:** EPIC-00.

### EPIC-02 — Cota gratuita e ledger de créditos

**Objetivo:** limitar o uso pago da IA sem comprometer consistência, suporte ou auditoria.

**Escopo:**

- criar ledger imutável de concessões, reservas, consumos, liberações, ajustes e compras;
- calcular saldo a partir de transações auditáveis;
- conceder cota gratuita por regra configurável;
- reservar um crédito antes de enfileirar o OCR e consumi-lo somente após resultado utilizável;
- liberar a reserva em falha interna ou do provedor;
- expor saldo, histórico resumido e motivo de cada alteração;
- apresentar estados de saldo insuficiente, reserva em andamento e falha recuperável no aplicativo;
- fornecer ajuste administrativo rastreável para suporte.

**Critérios de aceite:**

- saldo nunca fica negativo, mesmo com requisições concorrentes;
- a mesma chave de idempotência não altera o saldo duas vezes;
- a soma do ledger explica integralmente o saldo exibido;
- criação e divisão manuais funcionam com saldo zero;
- alterações administrativas registram autor, motivo e data;
- migração, rollback e testes concorrentes estão documentados e executados.

**Dependências:** EPIC-01 e decisões de produto sobre cota e validade.

### EPIC-03 — Compra avulsa de créditos pela Google Play

**Objetivo:** permitir que o usuário compre leituras adicionais com validação segura no servidor.

**Escopo:**

- cadastrar produtos consumíveis e ambientes de teste na Google Play Console;
- exibir pacotes, preço retornado pela loja e saldo no aplicativo;
- iniciar, concluir, cancelar e restaurar o fluxo de compra;
- enviar o token da compra ao backend e validá-lo com a Google Play Developer API;
- creditar uma compra apenas uma vez e concluir o consumo/acknowledgement conforme o produto;
- reconciliar compras pendentes ou interrompidas;
- registrar eventos suficientes para suporte e antifraude;
- produzir casos de teste para contas licenciadas e trilhas interna/fechada.

**Critérios de aceite:**

- o backend nunca confia apenas na confirmação recebida do dispositivo;
- `purchaseToken` é único e uma repetição retorna o resultado anterior sem duplicar saldo;
- compra cancelada ou pendente não libera crédito indevidamente;
- uma compra confirmada reaparece após reinstalação/reautenticação quando aplicável;
- o app lida com loja indisponível e mantém o fluxo manual acessível;
- eventos de compra, validação, crédito e consumo podem ser correlacionados.

**Fora do escopo desta fase:** assinatura, venda pela web, marketplace, cupons complexos e múltiplas lojas móveis.

**Dependências:** EPIC-02, conta de desenvolvedor e configuração da Google Play.

### EPIC-04 — Anúncios responsáveis e privacidade

**Objetivo:** testar receita publicitária com regras claras de frequência, localização e consentimento.

**Escopo:**

- decidir até o fim da Sprint 1 os formatos, posições e hipótese de receita;
- integrar SDK e consentimento compatíveis com o binário nativo atual;
- iniciar com formatos de baixo atrito em telas não críticas, como histórico ou pós-resumo;
- aplicar limite de frequência por sessão e configuração remota;
- desativar anúncios para cenários definidos pelo produto, inclusive durante compra e falhas;
- atualizar Política de Privacidade, formulário de segurança de dados e declarações da loja antes da ativação;
- medir impressão, preenchimento, receita, impacto em retenção e erros.

**Critérios de aceite:**

- não há anúncio em login, captura, processamento, revisão, divisão ou recuperação de erro;
- consentimento e opção de privacidade são respeitados antes da solicitação de anúncio;
- testes usam identificadores/unidades de teste, nunca tráfego de produção;
- anúncios podem ser desligados sem nova publicação do app;
- a ativação só ocorre após aprovação de produto, privacidade e checklist da loja.

**Fora do escopo inicial:** anúncios recompensados que concedem crédito de OCR. Essa opção exige uma rodada própria de fraude, economia e ledger.

**Dependências:** decisão de produto, revisão jurídica e EPIC-00.

### EPIC-05 — Otimização de frontend e backend

**Objetivo:** reduzir espera e falhas nos fluxos com maior impacto para o usuário e para o custo operacional.

**Escopo de aplicativo:**

- medir tempo de abertura, renderizações e transições dos fluxos críticos;
- otimizar listas, cache e invalidação do React Query;
- reduzir trabalho de imagem e memória antes do upload;
- eliminar requisições duplicadas e polling desnecessário;
- revisar estados de carregamento, acessibilidade, tema e fontes ampliadas.

**Escopo de backend:**

- medir p50/p95 por rota e identificar consultas lentas;
- revisar índices e paginação a partir de planos de execução reais;
- reduzir consultas repetidas e respostas excessivas;
- revisar concorrência da fila de OCR e uso das funções agendadas;
- validar limites de upload, conexões com Postgres/Supabase e acesso ao S3.

**Critérios de aceite:**

- há orçamento de desempenho aprovado para abertura, listagem, upload, polling e rotas críticas;
- nenhuma otimização é aceita sem comparação antes/depois em ambiente equivalente;
- listas permanecem responsivas com volume representativo;
- p95 e taxa de erro das rotas críticas não pioram após monetização;
- testes de regressão cobrem os gargalos corrigidos.

**Dependências:** baseline do EPIC-00. Pode ocorrer em paralelo aos épicos de monetização.

### EPIC-06 — Estabilização, conformidade e lançamento

**Objetivo:** transformar as entregas integradas em uma versão segura para publicação gradual.

**Escopo:**

- congelar escopo funcional no início da Sprint 6;
- executar regressão completa em dispositivos e versões Android suportadas;
- validar migrações, restauração, reconciliação e plano de rollback;
- revisar segurança, privacidade, acessibilidade e textos da loja;
- testar compras e anúncios nas trilhas interna e fechada;
- ativar funcionalidades por coortes e acompanhar métricas diariamente;
- registrar runbook de incidentes e responsáveis de plantão no lançamento.

**Critérios de aceite:**

- zero P0/P1 aberto e P2 com decisão explícita;
- testes automatizados, build e checklist manual estão verdes;
- feature flags, alertas e rollback foram exercitados;
- documentação legal corresponde exatamente aos dados e SDKs da versão;
- produto e engenharia aprovam a passagem de cada etapa do rollout.

**Dependências:** todos os épicos que entrarem no release.

## 6. Cronograma de 12 semanas

| Sprint | Foco da frente de experiência | Foco da frente de plataforma | Marco de saída |
| --- | --- | --- | --- |
| 1 — Semanas 1–2 | Baseline mobile, triagem de bugs e estados de OCR | Observabilidade, idempotência e decisão de anúncios | Métricas-base, backlog priorizado e arquitetura aprovada |
| 2 — Semanas 3–4 | Recuperação de OCR e primeiro fluxo de saldo | Confiabilidade do OCR e modelo do ledger | OCR auditável e ledger validado por testes |
| 3 — Semanas 5–6 | Carteira, saldo insuficiente e interface de pacotes | Cota, reserva/consumo e início da verificação Play | Cota funcional em ambiente de teste |
| 4 — Semanas 7–8 | Fluxo de compra e integração de anúncios em modo teste | Verificação, reconciliação e suporte a compras | Compra ponta a ponta na trilha interna |
| 5 — Semanas 9–10 | Polimento, acessibilidade e desempenho | Hardening, desempenho da API e controles remotos | Candidato a release completo |
| 6 — Semanas 11–12 | Regressão e correções | Segurança, migração, rollout e operação | Publicação gradual ou decisão documentada de adiar |

## 7. Ordem de implementação e dependências

```text
Qualidade e métricas
        ↓
OCR confiável → ledger/cota → compra Google Play
        └──────────────┐
                       ├→ estabilização e release
Anúncios + otimização ─┘
```

Nenhuma compra deve chegar à produção antes de OCR e ledger provarem idempotência. Anúncios e otimizações podem avançar em paralelo, desde que não desviem pessoas das dependências críticas.

## 8. Gestão do backlog

Hierarquia recomendada:

```text
Objetivo da fase → Épico → História vertical → Tarefa técnica/bug
```

Estados do quadro:

```text
Descoberta → Pronto → Em desenvolvimento → Em revisão → Em validação → Concluído
```

Limites sugeridos:

- no máximo uma história principal em andamento por pessoa;
- no máximo duas histórias em validação por frente;
- bugs P0 interrompem o trabalho; P1 entram na sprint atual; P2 competem por capacidade semanal; P3 ficam priorizados no backlog.

### Definition of Ready

Uma história só entra na sprint quando tiver:

- problema e resultado esperados;
- critérios de aceite observáveis;
- estados de sucesso, vazio, carregamento e erro;
- dependências e contrato entre app e API identificados;
- impacto em dados, privacidade, loja, métricas e suporte avaliado;
- escopo pequeno o suficiente para terminar dentro da mesma sprint ou divisão planejada.

### Definition of Done

Uma história só é concluída quando:

- código revisado e integrado;
- testes adequados ao risco executados;
- telemetria e mensagens de erro incluídas;
- migração e rollback verificados, quando houver;
- acessibilidade e comportamento em tema claro/escuro conferidos no app;
- documentação geral, legal ou operacional atualizada;
- comportamento protegido por flag quando a ativação gradual for necessária;
- demonstração realizada com evidência dos critérios de aceite.

## 9. Indicadores de sucesso

As metas numéricas devem ser fechadas na Sprint 1 após o baseline. O acompanhamento mínimo inclui:

| Dimensão | Indicadores |
| --- | --- |
| Produto | início e conclusão de conta, uso manual versus OCR, conversão de saldo insuficiente para compra |
| OCR | sucesso, falha por categoria, p50/p95, tentativas e custo estimado por leitura |
| Créditos | reservas expiradas, divergência de saldo, duplicidades evitadas e ajustes de suporte |
| Compras | início, aprovação, pendência, cancelamento, validação e reconciliação |
| Anúncios | impressão, preenchimento, receita, frequência e impacto em retenção/abandono |
| Qualidade | crash-free sessions, P0/P1, taxa de erro da API e tempo médio de recuperação |
| Desempenho | abertura do app, renderização de listas, upload e p50/p95 das rotas críticas |

## 10. Riscos e respostas

| Risco | Resposta planejada |
| --- | --- |
| Atraso na configuração ou revisão da Google Play | Iniciar acessos e produtos na Sprint 1; manter flags e trilha interna desde cedo |
| Cobrança duplicada ou saldo inconsistente | Ledger imutável, transações, chaves únicas, idempotência e testes concorrentes |
| Custo de IA acima da receita | Instrumentar custo antes da cobrança; ajustar cota, pacotes, modelo e limites por configuração |
| Anúncios degradarem retenção | Começar em telas não críticas, limitar frequência e manter desligamento remoto |
| Divisão rígida entre frontend e backend | Histórias verticais, pares entre frentes e sincronização de dependências |
| Escopo exceder 12 semanas | Aplicar a ordem de corte abaixo e preservar 25% da capacidade |
| Regressão no fluxo principal | Testes de fumaça, release gradual, alertas e rollback exercitado |

## 11. Ordem de corte de escopo

Se a capacidade ficar abaixo do previsto, cortar nesta ordem:

1. formatos adicionais de anúncio e experimentos avançados;
2. otimizações sem gargalo comprovado;
3. histórico detalhado de créditos no aplicativo, preservando o ledger no backend;
4. múltiplos pacotes ou promoções, mantendo um pacote simples;
5. melhorias cosméticas que não afetem acessibilidade ou conclusão do fluxo.

Não cortar idempotência, validação da compra no servidor, auditoria do ledger, recuperação de falhas, testes críticos, privacidade ou capacidade de desligamento remoto.

## 12. Decisões necessárias na Sprint 1

- tamanho e renovação da cota gratuita;
- preço, quantidade e validade de cada pacote de créditos;
- definição exata de “leitura utilizável” para consumo do crédito;
- regiões e público do lançamento;
- formatos e posições de anúncio autorizados;
- metas numéricas de desempenho e confiabilidade;
- responsável por produto, privacidade, publicação e resposta a incidentes.

## 13. Referências para a implementação

Estas fontes devem ser revalidadas no momento da implementação, pois políticas e SDKs mudam:

- [Política de pagamentos da Google Play](https://support.google.com/googleplay/android-developer/answer/9858738)
- [Integração da Google Play Billing Library](https://developer.android.com/google/play/billing/integrate)
- [Google Play Developer API para produtos](https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.products)
- [Consentimento para anúncios com UMP](https://developers.google.com/admob/android/privacy)
- [Development builds no Expo](https://docs.expo.dev/develop/development-builds/introduction/)
