---
sidebar_position: 6
---

# Planejamento das Mudanças de Fluxo e Rateio

## Objetivo

Documentar as mudanças solicitadas pela cliente para o aplicativo de rateio, com foco em:

- reorganização do fluxo principal das telas;
- adaptação da jornada de captura e edição da conta;
- ajustes na lógica de rateio por item;
- correções de inconsistências já identificadas;
- definição de uma ordem de implementação.

## Resumo Executivo

O fluxo principal do aplicativo será alterado para priorizar o histórico como ponto de entrada. A aba de câmera deixará de abrir diretamente a tela de informações da conta e passará a iniciar pela captura da nota fiscal. Após o scan, o sistema preencherá automaticamente os dados extraídos e abrirá uma nova tela consolidada de informações da conta, onde o usuário poderá revisar os dados básicos e cadastrar os participantes. Em seguida, o usuário avançará para uma nova tela de distribuição dos itens, onde será definido quanto cada pessoa pagará em cada item.

Além da mudança de navegação, o projeto também precisa corrigir problemas de regra de negócio, principalmente na taxa de serviço, e implementar melhorias de usabilidade e gestão de conta, como exclusão de contas antigas e login com Google.

## Fluxo Atual Entendido

Fluxo atual inferido a partir do contexto do projeto e das anotações da cliente:

1. O usuário entra no app.
2. A navegação principal inclui abas como histórico, câmera e perfil.
3. A jornada da câmera e do scan leva a uma sequência em que a tela inicial da subrota não é mais a ideal para o uso esperado.
4. As informações da conta e a divisão dos itens estão distribuídas de forma que a cliente considera pouco natural para o fluxo do usuário.

## Fluxo Proposto

### Navegação principal

Nova ordem das tabs:

1. Histórico
2. Câmera
3. Perfil

Nova tela inicial do app:

- A primeira tela exibida ao abrir o aplicativo deve ser `Histórico`.

### Subrota da câmera

Ao tocar na aba `Câmera`, o fluxo deve ser:

1. Tela de câmera para escanear a nota fiscal.
2. Processamento do scan e retorno dos dados extraídos.
3. Abertura da nova tela de informações da conta.
4. Avanço para a tela de distribuição dos itens.

## Descrição das Novas Telas

### 1. Tela de câmera e scan

Responsabilidade:

- capturar a imagem da nota fiscal;
- enviar a imagem para processamento;
- aguardar o retorno dos dados extraídos.

Saídas esperadas do processamento:

- título da conta;
- itens da conta;
- valores dos itens;
- dados complementares identificados na nota, quando houver.

Observações:

- esta tela passa a ser a primeira tela da subrota da câmera;
- o usuário não deve precisar preencher manualmente os dados antes do scan.

### 2. Nova tela de informações da conta

Esta tela é uma adaptação e junção:

- da primeira tela atual;
- com a primeira tela que hoje aparece após o scan.

Responsabilidade:

- exibir e permitir revisar os dados básicos da conta retornados pelo scan;
- permitir completar ou corrigir informações quando necessário;
- permitir adicionar participantes antes da etapa de rateio por item.

Conteúdo esperado:

- imagem ou referência da conta;
- título da conta;
- taxa de serviço;
- couvert artístico;
- lista de participantes;
- ação principal para avançar para a divisão dos itens.

Regras:

- o foco desta tela é preparar a conta para o rateio;
- o cadastro de participantes deve acontecer aqui;
- a edição deve ser simples e objetiva, sem misturar a lógica detalhada de distribuição por item.

### 3. Nova tela de divisão dos itens

Responsabilidade:

- mostrar os itens identificados na nota;
- exibir o valor de cada item;
- permitir definir quanto cada pessoa pagará em cada item;
- permitir definir quantas unidades de cada item cada pessoa pagará, quando o item possuir quantidade maior que 1.

Conteúdo esperado:

- lista de itens;
- valor unitário ou valor total por item;
- participantes vinculáveis a cada item;
- controles para distribuir responsabilidade de pagamento.

Regras:

- a divisão não deve assumir automaticamente divisão igual entre todos;
- o fluxo precisa permitir ao usuário escolher quantos itens ou qual parcela de itens cada pessoa pagará;
- a interface deve deixar visualmente claro o que está selecionado e o que não está;
- a soma das quantidades atribuídas às pessoas não pode ultrapassar a quantidade total comprada do item;
- a soma das quantidades atribuídas às pessoas também não pode ficar abaixo da quantidade total comprada no momento de avançar no fluxo;
- para itens com quantidade maior que 1, todos os participantes devem iniciar selecionados, mas com quantidade inicial igual a 0;
- quando um item tiver apenas 1 unidade, a interface não deve exibir seletor de quantidade por pessoa.

## Requisitos Funcionais

### RF01. Alterar a landing screen do app

- Ao abrir o aplicativo, o usuário deve visualizar a tela de `Histórico`.

### RF02. Reordenar as tabs principais

- A navegação principal deve seguir a ordem: `Histórico`, `Câmera`, `Perfil`.

### RF03. Alterar a entrada da subrota de câmera

- Ao tocar em `Câmera`, o usuário deve acessar primeiro a tela de captura/scan da nota fiscal.

### RF04. Preencher dados da conta a partir do scan

- Após o processamento da imagem, o sistema deve retornar os dados reconhecidos e preencher a nova tela de informações da conta.

### RF05. Consolidar dados básicos da conta em uma única tela

- A tela de informações da conta deve centralizar os campos básicos e a gestão dos participantes.

### RF06. Permitir cadastro de participantes antes do rateio

- O usuário deve conseguir adicionar participantes antes de avançar para a distribuição dos itens.

### RF07. Criar tela específica para rateio dos itens

- O rateio detalhado deve acontecer em uma tela separada da edição básica da conta.

### RF08. Permitir rateio não uniforme por item

- O usuário deve poder definir quanto cada pessoa pagará por item, sem obrigatoriedade de divisão igual.

### RF08.1. Permitir distribuição por quantidade do item

- Quando um item possuir quantidade maior que 1, o usuário deve poder informar quantas unidades cada participante pagará.

### RF08.2. Restringir excesso de alocação

- O sistema não deve permitir que a soma das unidades atribuídas aos participantes ultrapasse a quantidade comprada do item.

### RF08.3. Simplificar itens unitários

- Quando um item tiver quantidade igual a 1, a interface não deve exibir controle de quantidade por participante.

### RF08.4. Impedir avanço com itens incompletos

- O sistema não deve permitir avançar para a próxima etapa enquanto existir item com unidades ainda não distribuídas entre os participantes.

### RF08.5. Iniciar seleção de participantes marcada

- Na tela de itens, os participantes devem iniciar como selecionados por padrão para cada item.
- O usuário deve desmarcar apenas quem não irá pagar por aquele item.

### RF08.6. Iniciar quantidade zerada em itens múltiplos

- Para itens com quantidade maior que 1, a quantidade atribuída a cada participante deve iniciar em `0`, mesmo com os participantes inicialmente selecionados.

### RF08.7. Dividir item unitário entre selecionados

- Para itens com quantidade igual a 1, o sistema deve usar apenas a seleção de participantes.
- Se mais de uma pessoa estiver selecionada, o valor do item deve ser dividido igualmente entre as pessoas selecionadas.
- Se apenas uma pessoa estiver selecionada, ela paga o valor integral do item.

### RF09. Diferenciar visualmente estados de seleção

- Elementos selecionados devem usar cor escura/preta;
- elementos não selecionados devem usar cor cinza.

### RF10. Permitir exclusão de contas antigas

- O usuário deve conseguir apagar contas já registradas no histórico.

### RF11. Permitir login com Google

- O sistema deve oferecer autenticação com Google.

## Correções e Ajustes de Regra de Negócio

### CR01. Corrigir cálculo da taxa de serviço

Problema relatado:

- mesmo quando o usuário escolhe não pagar a taxa de serviço no início, a taxa volta a aparecer no resultado final.

Objetivo da correção:

- garantir consistência entre a escolha do usuário e o cálculo final;
- impedir que a taxa seja reaplicada indevidamente em etapas posteriores do fluxo.

Pontos de verificação:

- persistência da escolha ao navegar entre telas;
- recálculo do total ao editar participantes ou itens;
- resumo final da conta;
- salvamento e reabertura da conta no histórico.

### CR02. Ajustar a lógica de distribuição de itens

Problema relatado:

- o sistema não deve simplesmente dividir o total por pessoa.

Objetivo da correção:

- permitir uma distribuição aderente ao consumo real;
- garantir que o valor final por pessoa seja derivado da soma dos itens atribuídos a ela.

Regra detalhada:

- se um item tiver quantidade maior que 1, a atribuição deve ser feita por unidades;
- o valor por pessoa deve ser calculado com base no número de unidades atribuídas a ela;
- a soma das unidades atribuídas não pode exceder a quantidade total comprada.
- os participantes podem iniciar selecionados por padrão, mas a quantidade atribuída deve começar em zero para evitar distribuição automática indevida.

Exemplo:

- 3 coca-colas compradas;
- valor unitário de R$ 2,00;
- pessoa 1 paga 2 unidades;
- pessoa 2 paga 1 unidade;
- pessoa 3 paga 0 unidades.

Resultado:

- pessoa 1 paga R$ 4,00;
- pessoa 2 paga R$ 2,00;
- pessoa 3 não paga esse item.

Validação obrigatória:

- se a soma das quantidades selecionadas exceder a quantidade comprada, a interface deve impedir a ação ou bloquear a continuação até correção.
- se a soma das quantidades selecionadas ficar abaixo da quantidade comprada, a interface deve bloquear o avanço e informar que ainda existem itens sem responsável.

Regra para item unitário:

- o item não deve exibir seletor de quantidade;
- o valor do item deve ser dividido igualmente entre os participantes selecionados;
- se nenhum participante estiver selecionado, o sistema deve bloquear o avanço.

### CR04. Definir comportamento de taxa de serviço e couvert artístico

Regra geral:

- taxa de serviço e couvert artístico devem ser tratadas como valores distribuíveis entre participantes selecionados;
- o usuário informa o valor dessas cobranças na tela de informações da conta;
- o valor só entra na conta final se houver ao menos uma pessoa selecionada para pagá-lo.

Comportamento esperado:

- se ninguém for selecionado para pagar a taxa ou o couvert, o valor deve ser desconsiderado no cálculo final;
- se 1 pessoa for selecionada, ela paga o valor integral;
- se `n` pessoas forem selecionadas, o valor deve ser dividido igualmente entre essas `n` pessoas.

Exemplos:

- taxa de serviço de R$ 12,00 e nenhuma pessoa selecionada: valor ignorado;
- taxa de serviço de R$ 12,00 e 1 pessoa selecionada: essa pessoa paga R$ 12,00;
- taxa de serviço de R$ 12,00 e 3 pessoas selecionadas: cada uma paga R$ 4,00.

Essa mesma regra se aplica ao couvert artístico.

### CR03. Simplificar edição do nome após scan

Anotação da cliente:

- não é necessário editar o nome da pessoa depois do scan da foto.

Interpretação para implementação:

- evitar exigir uma etapa extra de renomeação após o scan;
- manter a edição de participantes apenas onde fizer sentido no fluxo principal.

Se houver campo de nome vinculado ao pós-scan atual, ele deve ser reavaliado e possivelmente removido ou deslocado para a tela consolidada de informações da conta.

## Requisitos de UX e Navegação

### UX01. Fluxo mais direto

- o scan deve acontecer antes da revisão dos dados da conta;
- a revisão dos dados deve acontecer antes da distribuição detalhada dos itens.

### UX02. Clareza visual nas seleções

- o usuário deve identificar rapidamente quais itens e vínculos estão ativos;
- estados selecionado e não selecionado precisam ter contraste claro;
- quando houver quantidade maior que 1, a interface deve deixar evidente quantas unidades já foram atribuídas e quantas ainda restam para distribuição.

### UX03. Separação por responsabilidade

- cada tela deve ter um objetivo claro:
  - câmera: capturar;
  - informações da conta: revisar e cadastrar participantes;
  - rateio: distribuir itens e valores.

### UX04. Prevenção de erro no rateio

- o usuário não deve conseguir confirmar uma distribuição em que a soma das unidades atribuídas exceda a quantidade comprada;
- o usuário não deve conseguir avançar enquanto houver unidades não distribuídas;
- para itens unitários, a interface deve evitar complexidade desnecessária escondendo o seletor de quantidade.

### UX05. Otimização do esforço de seleção

- a tela de rateio deve assumir, por padrão, que todos os participantes dividem o item;
- o usuário deve gastar menos tempo removendo exceções do que adicionando participantes um a um;
- em itens com múltiplas unidades, essa otimização não deve gerar distribuição automática de quantidades.

## Impactos Técnicos Esperados

### Frontend

- reordenação das tabs e da rota inicial;
- ajuste da pilha de navegação da aba `Câmera`;
- criação ou refatoração da tela consolidada de informações da conta;
- criação ou refatoração da tela de rateio por item;
- revisão do estado compartilhado entre scan, edição da conta e rateio;
- atualização de feedback visual para itens selecionados e não selecionados;
- inclusão de ação para excluir contas do histórico;
- inclusão do fluxo de login com Google.

### Backend

- validar se a estrutura atual da conta suporta exclusão lógica ou física;
- validar se a modelagem atual suporta persistir corretamente:
  - taxa de serviço habilitada ou desabilitada;
  - participantes;
  - distribuição por item;
  - histórico da conta;
- implementar ou revisar autenticação federada com Google;
- revisar endpoints e payloads do fluxo pós-scan para garantir retorno dos dados necessários à nova tela consolidada.

### Estado e Regras de Negócio

- revisar onde a taxa de serviço é calculada e reaplicada;
- revisar se o total por pessoa deriva exclusivamente:
  - das unidades de itens atribuídas;
  - das taxas e do couvert, quando houver participantes selecionados para essas cobranças;
- garantir persistência entre etapas sem perder escolhas do usuário.

## Dependências e Riscos

### Dependências

- definição clara do payload retornado pelo scan;
- alinhamento sobre como representar a distribuição de cada item por participante e por quantidade;
- definição da estratégia de autenticação com Google no backend e no mobile.

### Riscos

- duplicação de lógica entre tela de informações e tela de rateio;
- inconsistência de estado ao navegar entre etapas;
- regressões no cálculo do total final;
- aumento de complexidade na interface de rateio se os controles de quantidade não forem bem delimitados;
- impacto no histórico caso o modelo salvo hoje não comporte os novos dados.

## Critérios de Aceite

### Navegação

- ao abrir o app, a primeira tela exibida é `Histórico`;
- as tabs aparecem na ordem `Histórico`, `Câmera`, `Perfil`;
- ao entrar em `Câmera`, a primeira tela é a de scan.

### Fluxo pós-scan

- após o scan, o usuário vê a tela de informações da conta já preenchida com os dados reconhecidos;
- nessa tela, o usuário consegue revisar dados básicos e adicionar participantes;
- ao avançar, o usuário acessa a tela de divisão dos itens.

### Rateio

- a tela de rateio mostra os itens reconhecidos e seus valores;
- o usuário consegue definir a responsabilidade de pagamento por item;
- quando um item tiver quantidade maior que 1, o usuário consegue definir quantas unidades cada pessoa pagará;
- quando um item tiver quantidade maior que 1, todos os participantes começam selecionados e com quantidade `0`;
- quando um item tiver quantidade igual a 1, a interface não mostra seletor de quantidade;
- quando um item tiver quantidade igual a 1, o valor é dividido igualmente entre os participantes selecionados;
- os participantes aparecem selecionados por padrão em cada item;
- o usuário pode desmarcar quem não irá pagar;
- o sistema impede que a soma das unidades atribuídas ultrapasse a quantidade comprada;
- o sistema impede avanço se a soma das unidades atribuídas ficar abaixo da quantidade comprada;
- ao bloquear o avanço, o sistema informa que ainda há itens ausentes para adicionar;
- o total por pessoa reflete os itens atribuídos a ela;
- o sistema não obriga divisão igual entre os participantes.

### Taxa de serviço

- ao desabilitar a taxa de serviço, ela não deve aparecer no cálculo final;
- ao habilitar a taxa de serviço, ela deve ser aplicada de forma consistente no resumo final.

### Taxa de serviço e couvert artístico

- se ninguém for selecionado para pagar a taxa ou o couvert, esses valores não entram no cálculo final;
- se apenas uma pessoa for selecionada, ela paga o valor integral;
- se múltiplas pessoas forem selecionadas, o valor é dividido igualmente entre elas.

### Histórico e conta

- o usuário consegue apagar contas antigas;
- contas salvas continuam acessíveis pelo histórico com os dados corretos.

### Autenticação

- o usuário consegue entrar com Google.

## Ordem Sugerida de Implementação

### Fase 1. Refatoração de navegação

- alterar a tela inicial para `Histórico`;
- reordenar as tabs;
- ajustar a entrada da subrota `Câmera`.

### Fase 2. Reestruturação do fluxo pós-scan

- garantir que a câmera retorne os dados extraídos;
- criar a nova tela consolidada de informações da conta;
- ligar o avanço dessa tela para a nova tela de rateio.

### Fase 3. Regras de negócio do rateio

- corrigir a lógica da taxa de serviço;
- implementar a lógica de distribuição de taxa e couvert por participantes selecionados;
- revisar o cálculo por item e por participante;
- alterar o estado inicial da seleção de participantes para `true`;
- iniciar quantidades em `0` para itens com múltiplas unidades;
- implementar validação de quantidade máxima por item;
- implementar validação de quantidade mínima por item antes do avanço;
- garantir persistência correta do estado entre telas.

### Fase 4. Ajustes de UX e gestão

- aplicar estados visuais de seleção;
- remover ou simplificar edição desnecessária após scan;
- permitir exclusão de contas antigas.

### Fase 5. Autenticação

- implementar login com Google;
- validar impacto no fluxo de acesso e histórico.

## Checklist de Implementação

- [ ] Alterar a tela inicial do app para `Histórico`
- [ ] Reordenar tabs para `Histórico`, `Câmera`, `Perfil`
- [ ] Ajustar subrota da câmera para iniciar no scan
- [ ] Garantir retorno de título, itens e dados básicos após scan
- [ ] Criar tela consolidada de informações da conta
- [ ] Adicionar gestão de participantes nessa tela
- [ ] Criar tela de rateio por item
- [ ] Permitir distribuição não uniforme dos itens
- [ ] Permitir distribuição por quantidade quando o item tiver múltiplas unidades
- [ ] Iniciar participantes selecionados por padrão em cada item
- [ ] Iniciar quantidade em `0` para todos os participantes em itens com múltiplas unidades
- [ ] Ocultar seletor de quantidade para itens unitários
- [ ] Dividir igualmente o valor de itens unitários entre participantes selecionados
- [ ] Bloquear alocação acima da quantidade comprada
- [ ] Bloquear avanço quando houver itens ainda não distribuídos
- [ ] Exibir mensagem informando que ainda há itens ausentes para adicionar
- [ ] Corrigir aplicação indevida da taxa de serviço
- [ ] Implementar regra de distribuição de taxa e couvert apenas entre participantes selecionados
- [ ] Aplicar diferenciação visual entre selecionado e não selecionado
- [ ] Revisar necessidade de edição de nome após scan
- [ ] Implementar exclusão de contas antigas
- [ ] Implementar login com Google
- [ ] Validar persistência no histórico

## Observações Finais

Este planejamento já incorpora as regras de negócio detalhadas para:

- distribuição de itens por quantidade;
- bloqueio de alocação acima da quantidade comprada;
- ocultação do seletor de quantidade em itens unitários;
- distribuição de taxa de serviço e couvert apenas entre participantes selecionados.

Como próximo refinamento técnico, a equipe deve apenas definir a modelagem interna desses dados no frontend e no backend para garantir consistência de cálculo e persistência no histórico.
