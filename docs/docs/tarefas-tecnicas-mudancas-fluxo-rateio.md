---
sidebar_position: 7
---

# Tarefas Técnicas das Mudanças de Fluxo e Rateio

## Objetivo

Traduzir o planejamento funcional em tarefas técnicas objetivas para implementação no projeto, separadas por:

- frontend;
- backend;
- regra de negócio;
- testes e validação.

## Premissas Fechadas

- A tela inicial do app passa a ser `Histórico`.
- A ordem das tabs será `Histórico`, `Câmera`, `Perfil`.
- A subrota da câmera começa pela tela de scan.
- Após o scan, o usuário vai para a nova tela consolidada de informações da conta.
- Depois disso, o usuário segue para a nova tela de rateio por item.
- Taxa de serviço e couvert só entram no cálculo se houver participantes selecionados para pagá-los.
- Em itens com múltiplas unidades, todos os participantes começam selecionados, com quantidade inicial `0`.
- Em itens unitários, não há seletor de quantidade; o valor é dividido igualmente entre os participantes selecionados.
- O usuário não pode avançar enquanto houver item sem distribuição completa.

## 1. Tarefas de Frontend

### 1.1. Navegação principal

- Alterar a rota inicial do aplicativo para a tela de `Histórico`.
- Reordenar as tabs principais para `Histórico`, `Câmera`, `Perfil`.
- Ajustar ícones, labels e comportamento da navegação inferior conforme a nova ordem.
- Garantir que a aba `Câmera` abra a subrota correta iniciando pela tela de scan.

### 1.2. Fluxo da subrota da câmera

- Refatorar a stack da aba `Câmera` para seguir a sequência:
  - tela de câmera;
  - tela consolidada de informações da conta;
  - tela de rateio por item.
- Garantir navegação correta entre essas telas, inclusive retorno para edição sem perda de estado.
- Garantir tratamento visual de loading, erro de processamento e retry no fluxo de scan.

### 1.3. Tela de câmera e scan

- Revisar a tela atual de câmera para garantir que ela seja a primeira etapa da subrota.
- Integrar a resposta do OCR/scan ao estado da conta.
- Garantir que os dados retornados alimentem automaticamente a tela de informações da conta.
- Exibir feedback de progresso durante o processamento da imagem.

### 1.4. Nova tela de informações da conta

- Criar ou refatorar a tela consolidada de informações da conta.
- Exibir campos para:
  - título da conta;
  - taxa de serviço;
  - couvert artístico;
  - imagem ou referência da nota;
  - participantes.
- Implementar adição e remoção de participantes nessa tela.
- Garantir edição simples dos dados básicos retornados pelo scan.
- Adicionar ação para avançar à tela de rateio.

### 1.5. Tela de rateio por item

- Criar ou refatorar a tela de rateio para exibir lista de itens reconhecidos.
- Mostrar para cada item:
  - nome;
  - quantidade comprada;
  - valor total e, se necessário, valor unitário;
  - lista de participantes.
- Alterar o estado inicial dos participantes para `selecionado = true`.
- Em itens com quantidade maior que 1:
  - iniciar quantidade atribuída como `0` para todos;
  - exibir controles de quantidade por participante;
  - atualizar o total atribuído em tempo real.
- Em itens com quantidade igual a 1:
  - ocultar controles de quantidade;
  - permitir apenas seleção/deseleção de participantes.
- Exibir claramente:
  - quantas unidades já foram atribuídas;
  - quantas unidades ainda faltam;
  - quais participantes estão selecionados ou desmarcados.

### 1.6. Validações de interface

- Bloquear seleção de quantidades que faça a soma ultrapassar o total comprado.
- Bloquear avanço se a soma das quantidades for menor que o total comprado.
- Exibir mensagem informando que ainda há itens ausentes para adicionar.
- Em itens unitários, bloquear avanço se ninguém estiver selecionado para pagar.
- Validar taxa de serviço e couvert com comportamento coerente com os participantes selecionados.

### 1.7. Taxa de serviço e couvert no frontend

- Criar interface para o usuário indicar quem pagará taxa de serviço.
- Criar interface para o usuário indicar quem pagará couvert artístico.
- Exibir preview do valor por pessoa com base nas seleções:
  - ninguém selecionado: valor desconsiderado;
  - uma pessoa: valor integral;
  - múltiplas pessoas: divisão igual.
- Garantir atualização em tempo real no resumo da conta.

### 1.8. Histórico

- Implementar ação de exclusão de contas antigas na tela de histórico.
- Adicionar confirmação antes de apagar uma conta.
- Atualizar a lista local após exclusão bem-sucedida.

### 1.9. Autenticação

- Integrar login com Google no app.
- Adaptar a tela e o fluxo de autenticação para suportar login federado.
- Garantir persistência de sessão após login com Google.

## 2. Tarefas de Backend

### 2.1. Fluxo pós-scan

- Revisar o endpoint de processamento da nota fiscal para garantir retorno dos dados necessários ao novo fluxo.
- Validar se o payload retornado inclui:
  - título da conta;
  - itens;
  - quantidade dos itens;
  - valor total ou unitário;
  - outras informações básicas relevantes.
- Ajustar contrato de resposta, se necessário, para suportar a tela consolidada.

### 2.2. Modelagem de conta

- Revisar a modelagem persistida da conta para suportar:
  - dados básicos da conta;
  - participantes;
  - taxa de serviço;
  - couvert artístico;
  - distribuição de taxa e couvert por participantes;
  - distribuição de itens por participante;
  - quantidade atribuída por participante em cada item.
- Verificar se será necessário migration no banco.

### 2.3. Persistência do rateio

- Garantir que o backend consiga salvar a distribuição completa dos itens.
- Garantir que o backend consiga salvar quantidades atribuídas por participante.
- Garantir que a conta salva no histórico preserve corretamente os cálculos realizados.

### 2.4. Exclusão de contas

- Criar ou revisar endpoint para exclusão de contas antigas.
- Definir se a exclusão será lógica ou física.
- Garantir que a exclusão respeite autenticação e autorização do usuário.

### 2.5. Login com Google

- Implementar autenticação com Google no backend.
- Validar criação ou vínculo de usuário existente com a conta Google.
- Emitir sessão/token compatível com o fluxo atual da aplicação.

## 3. Tarefas de Regra de Negócio

### 3.1. Cálculo dos itens com múltiplas unidades

- Implementar regra para calcular valor por participante com base na quantidade atribuída.
- Definir cálculo a partir de valor unitário do item.
- Se o OCR retornar apenas valor total do item, derivar valor unitário com segurança.
- Garantir que:
  - soma das quantidades atribuídas não passe da quantidade comprada;
  - soma das quantidades atribuídas seja exatamente igual à quantidade comprada para liberar avanço.

### 3.2. Cálculo dos itens unitários

- Implementar divisão igual do valor entre participantes selecionados.
- Garantir que item unitário sem participante selecionado bloqueie a continuidade.

### 3.3. Cálculo da taxa de serviço

- Corrigir a inconsistência atual em que a taxa reaparece no total final mesmo quando não deveria.
- Implementar regra:
  - ninguém selecionado: taxa ignorada;
  - uma pessoa selecionada: valor integral;
  - `n` pessoas selecionadas: divisão igual entre `n`.
- Garantir persistência correta dessa escolha entre as telas e no histórico.

### 3.4. Cálculo do couvert artístico

- Aplicar a mesma lógica da taxa de serviço ao couvert artístico.
- Garantir que o valor entre apenas no cálculo final quando houver participantes selecionados.

### 3.5. Estado inicial do rateio

- Alterar regra inicial da tela de itens para participantes já selecionados.
- Separar semanticamente:
  - `selecionado` como participação no item;
  - `quantidade` como número de unidades atribuídas.
- Garantir que itens com múltiplas unidades iniciem com quantidade `0`.

### 3.6. Regras de bloqueio de avanço

- Bloquear avanço se houver item com distribuição incompleta.
- Bloquear avanço se houver distribuição acima do permitido.
- Bloquear avanço em item unitário sem pagadores selecionados.
- Emitir mensagens de erro claras para cada caso.

## 4. Tarefas de Testes e Validação

### 4.1. Testes de navegação

- Validar que `Histórico` é a primeira tela do app.
- Validar a ordem correta das tabs.
- Validar o fluxo completo da aba `Câmera`.

### 4.2. Testes de rateio

- Testar item unitário com:
  - 1 pagador;
  - 2 ou mais pagadores;
  - nenhum pagador.
- Testar item com múltiplas unidades com:
  - distribuição completa correta;
  - distribuição acima do total;
  - distribuição abaixo do total.
- Testar itens com quantidades e números de participantes diferentes.

### 4.3. Testes de taxa e couvert

- Testar taxa com:
  - nenhum pagador;
  - 1 pagador;
  - múltiplos pagadores.
- Repetir os mesmos cenários para couvert.
- Validar se o resumo final permanece consistente após navegar entre telas.

### 4.4. Testes de persistência

- Validar se contas salvas no histórico mantêm:
  - participantes;
  - distribuição dos itens;
  - taxa e couvert;
  - totais por pessoa.
- Validar comportamento ao reabrir conta salva.

### 4.5. Testes de autenticação e histórico

- Testar login com Google em primeiro acesso.
- Testar vínculo com usuário existente, se aplicável.
- Testar exclusão de conta antiga pelo histórico.

## 5. Ordem Recomendada de Execução

1. Ajustar navegação principal e subrota da câmera.
2. Refatorar fluxo pós-scan e tela consolidada de informações da conta.
3. Implementar a nova tela de rateio por item.
4. Implementar e validar regras de negócio de itens, taxa e couvert.
5. Implementar exclusão de contas antigas.
6. Implementar login com Google.
7. Executar testes de regressão e validação funcional.

## 6. Backlog Resumido

### Frontend

- [ ] Alterar tela inicial para `Histórico`
- [ ] Reordenar tabs principais
- [ ] Ajustar stack da aba `Câmera`
- [ ] Refatorar tela de scan
- [ ] Criar tela consolidada de informações da conta
- [ ] Criar tela de rateio por item
- [ ] Iniciar participantes selecionados por padrão
- [ ] Iniciar quantidade `0` para itens múltiplos
- [ ] Ocultar seletor de quantidade em itens unitários
- [ ] Bloquear avanço com distribuição incompleta
- [ ] Exibir mensagens de erro de distribuição
- [ ] Implementar seleção de pagadores de taxa
- [ ] Implementar seleção de pagadores de couvert
- [ ] Implementar exclusão de contas no histórico
- [ ] Integrar login com Google

### Backend

- [ ] Revisar payload do scan
- [ ] Revisar modelagem de conta e rateio
- [ ] Persistir distribuição por item e quantidade
- [ ] Criar/revisar endpoint de exclusão de contas
- [ ] Implementar autenticação com Google

### Regra de negócio

- [ ] Corrigir cálculo da taxa de serviço
- [ ] Implementar cálculo do couvert artístico
- [ ] Implementar cálculo por quantidade em itens múltiplos
- [ ] Implementar divisão igual para itens unitários
- [ ] Validar bloqueios de avanço
- [ ] Garantir persistência correta dos cálculos

### Testes

- [ ] Testar novo fluxo de navegação
- [ ] Testar cenários de rateio unitário e múltiplo
- [ ] Testar cenários de taxa e couvert
- [ ] Testar histórico e reabertura de contas
- [ ] Testar login com Google e exclusão de contas
