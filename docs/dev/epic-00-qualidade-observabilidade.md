# EPIC-00 — Backlog de qualidade, bugs e observabilidade

**Épico pai:** EPIC-00 — Qualidade, bugs e observabilidade

**Janela principal:** Sprint 1, semanas 1 e 2

**Capacidade planejada:** até metade da capacidade da equipe na Sprint 1

**Equipe:** frentes de Experiência e aplicativo e Plataforma e monetização

**Atualizado em:** 25 de agosto de 2026

**Status:** pronto para refinamento e início

## 1. Resultado esperado

Ao fim da Sprint 1, a equipe deve conseguir responder, com evidências:

- onde e com que frequência os fluxos críticos falham;
- qual requisição, conta e trabalho de OCR participaram de uma falha;
- qual é a latência das rotas e do OCR;
- qual é o volume, a idade e a taxa de sucesso da fila;
- quais são os bugs mais graves e quem é responsável por eles;
- se um pull request preserva os testes, tipos e builds do repositório.

Este épico cria a base para cobrar por OCR. Ele não implementa créditos ou compras.

## 2. Diagnóstico do estado atual

| Área | O que já existe | Lacuna que precisa ser tratada |
| --- | --- | --- |
| Métricas da API | `MetricsInterceptor` mede contagem, erros e duração HTTP | Dados vivem somente na memória da instância e são perdidos em reinícios/serverless |
| Métricas de OCR | Fila registra enfileiramento, início, conclusão, falha e retentativa | Não há percentis, idade de fila, categoria de erro, tokens, modelo ou custo estimado persistente |
| Superfícies operacionais | `/metrics` e `/health` expõem snapshots | Métricas detalhadas e último erro não devem ficar públicos; falta autenticação/exportação segura |
| Logs do backend | NestJS `Logger` em serviços | Falta correlação por requisição e formato estruturado consistente |
| Logs do aplicativo | Wrapper `frontend/lib/logger.ts` | Em produção os logs são descartados; não há coletor de falhas nem sanitização central |
| Interface de falha | Erros são tratados localmente em várias telas | Não existe `ErrorBoundary` global com recuperação segura |
| Volume de logs | Aproximadamente 188 chamadas no app e backend | Algumas chamadas registram respostas ou objetos completos e precisam de auditoria de dados sensíveis |
| Testes | 10 suítes/19 testes unitários no backend | E2E cobre somente `GET /`; não há fumaça do fluxo autenticado e manual |
| Integração contínua | Restrição de origem de PR e deploy do site | Não existe workflow de qualidade executando testes, tipos e builds em PRs |

## 3. Distribuição da Sprint 1

A Sprint 1 terá seis pessoas trabalhando durante duas semanas. A distribuição inicial recomendada é:

| Uso | Parcela da capacidade da sprint |
| --- | ---: |
| Tasks fixas do EPIC-00 | até 50% |
| Correção de bugs priorizados após a triagem | 20% |
| Início do EPIC-01 e integração | 30% |

A reserva de bugs não é uma meta de quantidade. Um P0 interrompe o trabalho; P1 entra na sprint; P2 compete pela reserva; P3 permanece no backlog.

## 4. Resumo das tasks

| ID | Task | Frente principal | Prioridade | Dependências |
| --- | --- | --- | --- | --- |
| E00-T01 | Baseline e triagem de bugs | Compartilhada | P0 | — |
| E00-T02 | Contrato de observabilidade e decisão de ferramenta | Compartilhada | P0 | — |
| E00-T03 | Correlação e logs estruturados no backend | Plataforma | P0 | T02 |
| E00-T04 | Tornar métricas seguras e adequadas ao ambiente serverless | Plataforma | P0 | T02 |
| E00-T05 | Diagnóstico de falhas no aplicativo | Experiência | P0 | T02 |
| E00-T06 | Instrumentar o funil crítico do produto | Compartilhada | P0 | T02, T03, T05 |
| E00-T07 | Instrumentar fila, uso e custo do OCR | Plataforma | P0 | T03, T04 |
| E00-T08 | Painel, alertas e runbook inicial | Plataforma | P1 | T04, T06, T07 |
| E00-T09 | Testes de fumaça dos fluxos críticos | Compartilhada | P0 | T03 |
| E00-T10 | Gate de qualidade em pull requests | Compartilhada | P0 | T09 |

O refinamento deve confirmar se as dez tasks cabem na metade reservada ao EPIC-00. Se a ferramenta de observabilidade exigir infraestrutura adicional, T08 pode ser movida para o início da Sprint 2 sem bloquear os controles P0.

## 5. Tasks detalhadas

### E00-T01 — Registrar baseline e triar bugs

**Objetivo:** começar a sprint com uma visão comum da qualidade atual e um backlog de bugs reproduzível.

**Entregas:**

- matriz de severidade P0–P3 com exemplos do Por Partes;
- inventário dos bugs conhecidos em login, criação manual, upload, OCR, revisão, participantes, divisão, resumo, histórico e perfil;
- execução documentada dos testes e builds atuais;
- medição inicial de latência para `/health`, login, listagem de contas e fluxo manual;
- registro do tempo de fila e duração de uma leitura em ambiente controlado;
- relatório `docs/dev/baseline-qualidade-AAAA-MM-DD.md`.

**Critérios de aceite:**

- todo bug inventariado possui ambiente, passos, resultado esperado, resultado atual, evidência e severidade;
- P0 e P1 possuem responsável e decisão de contenção/correção;
- o baseline informa data, commit, ambiente, dispositivo e conjunto de dados;
- medições não usam dados pessoais ou notas fiscais reais;
- os 20% reservados para bugs são distribuídos somente depois da triagem.

**Não inclui:** corrigir todos os bugs encontrados. Cada correção vira um item `BUG-###` com estimativa e teste de regressão próprios.

### E00-T02 — Definir contrato de observabilidade e escolher a ferramenta

**Objetivo:** evitar eventos incompatíveis, dependência acidental de fornecedor e coleta excessiva de dados.

**Entregas:**

- ADR curto registrando a ferramenta/exportador escolhido para API e aplicativo;
- catálogo de eventos, métricas e propriedades permitidas;
- padrão de nomes e versões dos eventos;
- classificação dos dados em permitido, restrito e proibido;
- política de retenção, acesso e ambientes;
- convenção de `requestId`, `userId`, `billId` e `ocrJobId`.

**Decisões obrigatórias:**

- destino persistente das métricas no ambiente serverless;
- coletor de erros do aplicativo em produção;
- responsável pelos painéis e alertas;
- forma de separar desenvolvimento, preview e produção;
- período de retenção e processo de remoção.

**Critérios de aceite:**

- tokens, senhas, cabeçalhos de autorização, imagens, texto de OCR, nomes, e-mails e payloads completos estão explicitamente proibidos;
- identificadores internos são usados somente quando necessários e com acesso restrito;
- todo evento possui nome, origem, momento de emissão e propriedades;
- custo, acesso, retenção e impacto na Política de Privacidade foram avaliados;
- arquitetura e produto aprovam o ADR antes das integrações T03–T08.

### E00-T03 — Adicionar correlação e logs estruturados no backend

**Objetivo:** rastrear uma operação entre controller, serviços, banco, armazenamento e OCR sem registrar conteúdo sensível.

**Entregas técnicas:**

- middleware/interceptor que aceita um `x-request-id` válido ou gera um novo;
- retorno do identificador na resposta;
- contexto estruturado com serviço, ambiente, rota normalizada, método, status, duração e identificadores permitidos;
- tratamento global de exceções com categoria e identificador de correlação;
- helpers para anexar `billId` e `ocrJobId` sem duplicar formatação;
- auditoria dos logs do backend que hoje incluem mensagens ou objetos livres.

**Critérios de aceite:**

- toda resposta da API contém `x-request-id`;
- erros 4xx e 5xx são correlacionáveis sem expor stack trace ao cliente;
- URLs são registradas pela rota normalizada, sem query string sensível;
- logs não contêm token, senha, e-mail, nome, imagem, texto de OCR ou body completo;
- testes cobrem identificador recebido, gerado, inválido e propagado em erro;
- o formato funciona localmente e na Vercel.

### E00-T04 — Tornar métricas seguras e adequadas ao ambiente serverless

**Objetivo:** substituir a dependência em memória e fechar a exposição pública de detalhes operacionais.

**Entregas técnicas:**

- exportação persistente conforme o ADR da T02;
- revisão do papel de `MetricsService`, `GET /metrics` e `GET /health`;
- health check público reduzido a estado necessário para disponibilidade;
- métricas detalhadas removidas da superfície pública ou protegidas por autenticação operacional;
- contadores e durações agregados por rota normalizada e ambiente;
- testes de acesso e do conteúdo das respostas operacionais.

**Critérios de aceite:**

- reiniciar uma instância não apaga a série histórica usada pelo painel;
- `/health` não retorna último erro, payload, stack ou métricas detalhadas;
- um usuário anônimo não acessa métricas operacionais restritas;
- não há cardinalidade baseada em URL completa, usuário, conta ou mensagem de erro;
- p50, p95, volume e taxa de erro podem ser consultados por rota e ambiente.

### E00-T05 — Implementar diagnóstico de falhas no aplicativo

**Objetivo:** capturar falhas de produção e oferecer recuperação quando uma renderização quebra.

**Entregas técnicas:**

- adaptador de telemetria desacoplado da ferramenta escolhida;
- `ErrorBoundary` na raiz com mensagem, tentativa segura e caminho para reiniciar/sair;
- captura de exceções não tratadas e rejeições relevantes;
- sanitização central para erros Axios e objetos registrados;
- propagação de `x-request-id` nas chamadas à API e associação do valor retornado aos erros;
- auditoria das chamadas que registram respostas, dados de usuário ou objetos completos;
- separação explícita de desenvolvimento, preview e produção.

**Critérios de aceite:**

- uma exceção simulada aparece no ambiente de teste da ferramenta com versão do app e tela, sem dados pessoais;
- o usuário vê uma interface recuperável, não uma tela vazia;
- logs de desenvolvimento continuam úteis;
- produção não registra tokens, credenciais, payloads, nomes, e-mails, imagens ou texto de OCR;
- falhas de rede incluem categoria, rota normalizada, status e `requestId`, quando disponível;
- testes cobrem sanitização e fallback do `ErrorBoundary`.

### E00-T06 — Instrumentar o funil crítico do produto

**Objetivo:** medir conclusão e abandono sem transformar eventos em cópias dos dados da conta.

**Eventos mínimos:**

```text
auth_login_completed
bill_creation_started
bill_created
bill_image_upload_completed
ocr_processing_completed
ocr_processing_failed
bill_review_completed
participants_step_completed
split_step_completed
bill_finalized
```

Propriedades permitidas devem ser categóricas, como ambiente, versão do app, tipo de entrada `manual|image`, resultado, categoria de erro e duração. Estabelecimento, item, participante, preço, total e conteúdo da imagem não pertencem aos eventos.

**Critérios de aceite:**

- cada transição emite no máximo um evento por operação lógica;
- retentativas técnicas não inflam contagem de contas ou leituras;
- eventos do app e do backend podem ser correlacionados pelo contrato da T02;
- é possível consultar conversão entre criação iniciada, conta criada, revisão e finalização;
- sucesso e falha de OCR podem ser segmentados por versão, ambiente e categoria;
- testes verificam nome, propriedades permitidas e prevenção de duplicidade.

### E00-T07 — Instrumentar fila, uso e custo do OCR

**Objetivo:** criar o baseline econômico e operacional necessário para EPIC-01 e monetização.

**Métricas mínimas:**

- trabalhos enfileirados, iniciados, concluídos, falhos e repetidos;
- profundidade e idade do trabalho mais antigo da fila;
- duração total e por tentativa;
- categoria de falha e motivo de retentativa;
- modelo e provedor utilizados;
- tokens de entrada, saída e total retornados pelo provedor;
- custo estimado calculado com tabela de preço versionada e datada;
- quantidade de itens válidos produzidos.

**Critérios de aceite:**

- uma leitura pode ser acompanhada entre enfileiramento e conclusão por `ocrJobId`;
- métricas distinguem falha transitória, resposta inválida, imagem ausente, timeout e esgotamento de tentativas;
- preço não fica espalhado no código e registra moeda, vigência e fonte;
- alteração de modelo não mistura custos sem identificação;
- painel calcula sucesso, p50/p95, tentativas médias e custo estimado por leitura;
- nenhuma métrica contém imagem, URL assinada, texto bruto ou itens reconhecidos.

### E00-T08 — Criar painel, alertas e runbook inicial

**Objetivo:** converter telemetria em ação operacional.

**Painel mínimo:**

- volume e erro 4xx/5xx da API;
- p50/p95 das rotas críticas;
- conclusão, falha, p50/p95 e custo do OCR;
- profundidade e idade da fila;
- falhas do aplicativo por versão e tela;
- conversão do funil de criação até finalização.

**Alertas mínimos:**

- aumento sustentado de 5xx;
- fila sem progresso ou trabalho acima da idade limite;
- queda relevante no sucesso do OCR;
- crescimento de falhas do aplicativo após uma versão.

**Critérios de aceite:**

- cada alerta informa condição, janela, severidade, canal e responsável;
- thresholds iniciais usam o baseline da T01 e são revistos após sete dias de dados;
- pelo menos um alerta é disparado de forma controlada e recebido pelo canal definido;
- `docs/dev/runbook-incidentes.md` descreve diagnóstico, contenção, comunicação e encerramento;
- links do painel não exigem compartilhar credenciais pessoais entre a equipe.

### E00-T09 — Criar testes de fumaça dos fluxos críticos

**Objetivo:** detectar regressões graves antes de publicar ou integrar.

**Cobertura mínima automatizada da API:**

- cadastro/login e acesso autenticado;
- isolamento: um usuário não acessa a conta de outro;
- criação manual de conta e item;
- participante, divisão, taxa, finalização e resumo;
- enfileiramento de OCR com OpenAI e S3 simulados;
- falha e retentativa da fila sem chamadas externas reais.

**Cobertura mínima em dispositivo:**

- login por e-mail e Google;
- criação manual completa;
- captura/galeria e recuperação de falha de OCR;
- tema claro/escuro e fonte `1.4` nos passos críticos;
- retorno ao fluxo após fechar e reabrir o app.

**Critérios de aceite:**

- suíte automatizada executa por um único comando e não depende de OpenAI, S3 ou dados de produção;
- fixtures são determinísticas e removidas após o teste;
- falha produz evidência suficiente para diagnóstico;
- checklist de dispositivo registra versão, aparelho, responsável e resultado;
- cada bug P0/P1 corrigido recebe teste de regressão quando tecnicamente possível.

### E00-T10 — Criar gate de qualidade em pull requests

**Objetivo:** executar automaticamente as verificações mínimas antes do merge.

**Entregas técnicas:**

- workflow de PR com cache de dependências e jobs separados;
- backend: testes e build;
- frontend: verificação TypeScript;
- documentação: typecheck e build;
- script de lint que verifica sem modificar arquivos;
- regras de execução por mudança de caminho, sem esconder dependências entre pacotes;

**Critérios de aceite:**

- PR válido executa todas as verificações aplicáveis;
- uma falha proposital em teste, tipo e link/build bloqueia o job correspondente;
- workflow não usa segredos de produção e não chama OpenAI, Google Play ou S3;
- comandos do CI são reproduzíveis localmente;
- status obrigatórios para merge são documentados nas configurações do repositório;
- o workflow existente de restrição de branches continua funcionando.

## 6. Sequência sugerida da sprint

| Período | Plataforma | Experiência | Compartilhado |
| --- | --- | --- | --- |
| Início da semana 1 | Apoio ao baseline | Apoio à reprodução mobile | T01 e início da T02 |
| Final da semana 1 | T03 e T04 | T05 | Conclusão da T02 e início dos bugs prioritários |
| Início da semana 2 | T07 | T06 | T09 e correções P0/P1 |
| Final da semana 2 | T08 | Validação do funil e fallback | T10, regressão e demonstração |

T03 e T05 podem começar em paralelo assim que o contrato mínimo da T02 estiver aprovado. T04 não deve aguardar o painel para fechar a exposição pública atual.

## 7. Primeiros itens para iniciar imediatamente

### Faixa 1 — hoje

1. iniciar E00-T01 com a execução dos comandos atuais e sessão de reprodução;
2. iniciar E00-T02 com representantes das duas frentes e produto;
3. abrir itens `BUG-###` somente com evidência e severidade definidas.

### Faixa 2 — após o contrato mínimo

1. plataforma inicia E00-T03 e E00-T04;
2. experiência inicia E00-T05;
3. uma pessoa compartilhada prepara fixtures e ambiente da E00-T09.

### Decisão de checkpoint no fim da primeira semana

A equipe só avança para painel e funil completo se:

- logs já estiverem sanitizados;
- métricas públicas estiverem contidas;
- correlação funcionar entre app e API;
- ferramenta e retenção estiverem aprovadas;
- P0/P1 encontrados tiverem responsável.

## 8. Definition of Done do épico

O EPIC-00 termina quando:

- todas as tasks P0 estão concluídas;
- P0/P1 conhecidos estão corrigidos ou formalmente contidos;
- painel e ao menos um alerta foram validados;
- API e app produzem diagnóstico correlacionável sem dados proibidos;
- baseline de OCR, API, app e funil está registrado;
- testes de fumaça e workflow de qualidade passam na branch da sprint;
- runbook possui responsáveis e foi exercitado;
- produto e engenharia aprovam a demonstração com evidências.

## 9. Evidências para a demonstração

- link do baseline e backlog priorizado;
- exemplo de erro correlacionado entre aplicativo e API;
- prova de sanitização de um erro contendo dados fictícios sensíveis;
- painel com dados de ambiente de teste;
- alerta controlado recebido pela equipe;
- execução verde do CI;
- execução do fluxo manual e de uma falha de OCR recuperável;
- relação dos bugs corrigidos e respectivos testes de regressão.
