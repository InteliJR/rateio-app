---
sidebar_position: 1
---

# Documentação do Por Partes

Este é o ponto de entrada para a documentação interna do produto. O conteúdo descreve o estado atual do aplicativo e separa explicitamente o que já existe do que está planejado.

## Documentos principais

| Documento | Conteúdo |
| --- | --- |
| [Visão do produto](./visao-produto.md) | Problema, público, proposta de valor, escopo atual e direção do produto |
| [Design](./design.md) | Princípios de interface, temas, cores, acessibilidade e fluxos |
| [Tecnologias e arquitetura](./tecnologias.md) | Componentes, dados, integrações, ambientes e operação atual |
| [Épicos da nova fase](../dev/planejamento-epicos-nova-fase-2026.md) | Plano de até 12 semanas para OCR pago, anúncios, otimização e bugs |
| [Tasks do EPIC-00](../dev/epic-00-qualidade-observabilidade.md) | Backlog executável da primeira sprint de qualidade e observabilidade |

## Estado atual e planejamento

O aplicativo atual permite criar contas manualmente ou a partir de imagem, revisar itens, incluir participantes e taxas, dividir valores e consultar o histórico. O login Google, a fila assíncrona de OCR e quantidades fracionárias já estão implementados.

Limitação por créditos, compra avulsa e anúncios são itens planejados. Seus critérios e dependências estão no documento de épicos e não devem aparecer em materiais públicos como funcionalidades disponíveis antes do lançamento.

## Documentação pública

O diretório `docs/src/pages` contém a página inicial pública, a Política de Privacidade, os Termos de Uso e as instruções de Exclusão de Conta. O Docusaurus está configurado para publicar somente essas páginas; esta documentação interna permanece acessível apenas no repositório.

As instruções de build e publicação ficam em [docs/README.md](../README.md).

## Fonte de verdade

Quando houver divergência:

1. o código e o schema do banco definem o comportamento implementado;
2. os arquivos `.env.example` definem integrações e configuração esperadas;
3. este conjunto de documentos deve ser atualizado no mesmo merge da mudança;
4. políticas de loja e fornecedores devem ser confirmadas nas fontes oficiais no momento da implementação.

## Responsabilidade de atualização

Toda entrega deve revisar, conforme o impacto:

- visão e escopo do produto;
- arquitetura, modelo de dados e integrações;
- design, acessibilidade e estados de interface;
- documentos legais e declarações da loja;
- planejamento ativo e critérios de aceite.
