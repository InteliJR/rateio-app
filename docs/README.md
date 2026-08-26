# Documentação do Por Partes

Este diretório reúne dois conjuntos diferentes:

1. documentação interna do produto e do desenvolvimento, mantida em Markdown;
2. site público com páginas legais, construído com Docusaurus.

## Estrutura atual

```text
docs/
├── dev/
│   └── planejamento-epicos-nova-fase-2026.md
├── docs/
│   ├── intro.md
│   ├── visao-produto.md
│   ├── design.md
│   └── tecnologias.md
├── src/pages/
│   ├── index.tsx
│   ├── politica-de-privacidade.tsx
│   ├── termos-de-uso.tsx
│   └── excluir-conta.tsx
├── static/                  # Imagens e arquivos públicos
├── docusaurus.config.ts
└── package.json
```

Os arquivos em `docs/docs` e `docs/dev` são lidos no repositório e não são publicados no site. O plugin de documentação do Docusaurus está desativado em `docusaurus.config.ts`; o build público contém somente a página inicial e as páginas legais de `src/pages`.

## Navegação interna

- [Índice e governança](./docs/intro.md)
- [Visão do produto](./docs/visao-produto.md)
- [Design do aplicativo](./docs/design.md)
- [Tecnologias e arquitetura](./docs/tecnologias.md)
- [Planejamento de épicos da nova fase](./dev/planejamento-epicos-nova-fase-2026.md)
- [Tasks do EPIC-00](./dev/epic-00-qualidade-observabilidade.md)

## Executar o site público

```bash
cd docs
npm ci
npm start
```

O servidor local abre, por padrão, em `http://localhost:3000`.

## Validar antes de publicar

```bash
cd docs
npm run typecheck
npm run build
npm run serve
```

O build falha para links de página quebrados. Avisos de Markdown também devem ser corrigidos antes do merge.

## Publicação

O workflow `.github/workflows/deploy_docusaurus.yml` executa o build em alterações da branch `main` e publica `docs/build` no GitHub Pages. A configuração atual usa:

- URL: `https://intelijr.github.io`;
- caminho base: `/rateio-app/`;
- idioma: `pt-BR`;
- projeto: `rateio-app` da organização `InteliJR`.

## Regras de manutenção

- Atualize a data de vigência quando o conteúdo legal mudar.
- Antes de ativar um novo SDK, provedor, dado coletado, compra ou anúncio, revise Política de Privacidade, Termos de Uso e declarações da loja.
- Não descreva uma funcionalidade planejada como já disponível.
- Use o código e os arquivos `.env.example` como fonte de verdade para versões, integrações e variáveis.
- Remova ou corrija links no mesmo merge em que um documento for renomeado ou excluído.
