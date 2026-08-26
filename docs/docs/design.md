---
sidebar_position: 3
---

# Design do aplicativo

Este documento registra as decisões de interface presentes no código do Por Partes. A fonte de verdade dos tokens de tema é `frontend/contexts/ThemeContext.tsx`.

## Princípios de experiência

- manter uma ação principal evidente por tela;
- mostrar o progresso da conta: criação, revisão, participantes, divisão e resumo;
- permitir correção antes de avançar;
- explicar carregamento e erro sem deixar o usuário em um beco sem saída;
- apresentar valores monetários com consistência e destaque suficiente;
- preservar preferências de tema e tamanho de fonte;
- não inserir monetização em momentos críticos do fluxo.

## Identidade visual atual

O roxo identifica ações e seleção; o amarelo é usado como acento de alto contraste. Verde, vermelho e âmbar comunicam sucesso, erro e atenção.

### Tema claro

| Token | Valor | Uso principal |
| --- | --- | --- |
| `primary` | `#8B2E8F` | ação principal e seleção |
| `primaryLight` | `#9B3E9F` | variação e destaque |
| `accent` | `#FFFF00` | acento sobre superfícies compatíveis |
| `background` | `#FFFFFF` | fundo principal |
| `backgroundSecondary` | `#F8F8F8` | agrupamentos e superfícies secundárias |
| `text` | `#000000` | texto principal |
| `textSecondary` | `#666666` | texto de apoio |
| `success` | `#10B981` | confirmação |
| `warning` | `#F59E0B` | atenção |
| `error` | `#EF4444` | falha ou ação destrutiva |

### Tema escuro

| Token | Valor | Uso principal |
| --- | --- | --- |
| `primary` | `#9B3E9F` | ação principal |
| `primaryLight` | `#AB4EAF` | variação e destaque |
| `accent` | `#FFFF00` | acento |
| `background` | `#121212` | fundo principal |
| `backgroundSecondary` | `#1E1E1E` | cartões e agrupamentos |
| `backgroundTertiary` | `#2A2A2A` | campos e superfícies elevadas |
| `text` | `#FFFFFF` | texto principal |
| `textSecondary` | `#B0B0B0` | texto de apoio |
| `cardBorder` | `#3A3A3A` | divisores e contornos |

O tema também define tokens específicos para campos, abas, cartões, overlays, couvert e chips de seleção. Componentes novos devem consumir esses tokens; cores fixas dentro de componentes devem ser tratadas como dívida técnica e migradas quando o componente for alterado.

## Tipografia e escala

O aplicativo usa a tipografia padrão da plataforma e aplica a escala configurada pelo usuário. A preferência aceita valores entre `0.8` e `1.4` e é persistida localmente.

Regras para novos componentes:

- calcular tamanhos por `getFontSize` ou pelo padrão de escala usado no módulo;
- permitir quebra de linha em rótulos e valores longos;
- não depender somente de cor para comunicar estado;
- testar no mínimo as escalas `1.0` e `1.4`;
- evitar alturas fixas que cortem conteúdo ampliado.

## Ícones e componentes

O conjunto predominante é Ionicons por `@expo/vector-icons`. Um ícone deve ter rótulo acessível quando sua finalidade não estiver expressa por texto adjacente.

Padrões esperados:

- botões primários usam o token `primary` e texto com contraste adequado;
- ações destrutivas usam `error` e confirmação quando não forem facilmente reversíveis;
- campos exibem rótulo, valor, estado de foco, erro textual e área de toque adequada;
- carregamentos longos informam contexto e, quando possível, permitem sair sem perder trabalho;
- valores de itens, taxas e totais usam a mesma formatação monetária.

## Fluxo principal

```text
Entrada
  ↓
Criar manualmente ───────────────┐
ou capturar/selecionar imagem    │
  ↓                              │
Processamento e recuperação      │
  ↓                              │
Revisão de itens ◄───────────────┘
  ↓
Participantes
  ↓
Divisão dos itens
  ↓
Taxas e resumo
  ↓
Finalização e histórico
```

Cada etapa deve preservar a conta em andamento e oferecer uma saída clara em caso de erro. O resultado do OCR nunca deve avançar sem possibilidade de revisão.

## Estados obrigatórios

Toda tela que depende de dados deve considerar:

- carregando;
- conteúdo disponível;
- vazio;
- erro recuperável;
- erro sem recuperação imediata;
- conectividade ausente ou instável;
- ação em andamento, evitando envios duplicados.

Na próxima fase, telas afetadas também deverão considerar saldo disponível, saldo reservado, saldo insuficiente, compra pendente, compra cancelada e serviço de loja indisponível.

## Acessibilidade

- respeitar tema e escala de fonte em todas as telas;
- fornecer rótulos acessíveis para ações somente com ícone;
- manter ordem de foco coerente;
- não bloquear orientação de leitura por mensagens temporárias;
- validar contraste antes de adicionar combinações de cor;
- testar tarefas críticas com leitor de tela e fonte ampliada antes do release.

## Regras para anúncios e compra

Esses elementos ainda são planejados. Quando implementados:

- anúncios não aparecem em login, captura, processamento, revisão, divisão ou erro;
- preço exibido deve vir da loja, e não de texto fixo no aplicativo;
- compra pendente não pode ser mostrada como saldo disponível;
- cancelamento mantém o usuário no contexto e oferece o fluxo manual;
- consentimento e privacidade vêm antes da solicitação de anúncio;
- estados de monetização devem ser testados em temas claro/escuro e com fonte ampliada.

## Checklist de revisão visual

- ação principal e retorno estão claros;
- tema claro e escuro usam tokens, sem contraste acidental;
- fonte em `1.4` não corta conteúdo;
- teclado não cobre o campo ou botão necessário;
- toque repetido não duplica operação;
- moeda, quantidade e unidade estão formatadas corretamente;
- carregamento, vazio e erros possuem texto e ação coerentes;
- nenhuma funcionalidade planejada é apresentada como disponível.
