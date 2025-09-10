# 📚 Configuração da Documentação

Este diretório contém a documentação do projeto utilizando [Docusaurus](https://docusaurus.io/).

## Configuração Inicial

Para configurar a documentação em um novo repositório, siga os passos abaixo:

1. **Configuração do GitHub Pages**:
   - Vá para as configurações do repositório (Settings)
   - No menu lateral, clique em "Actions" dentro da seção "Code and automation"
   - Role até a seção "Workflow permissions"
   - Selecione "Read and write permissions"
   - Salve as alterações
   - Volte ao menu lateral e clique em "Pages"
   - Em "Source", selecione "Deploy from a branch"
   - Em "Branch", selecione "gh-pages" e "/ (root)"
   - Clique em "Save"

2. **Configuração do Docusaurus**:
   - Abra o arquivo `docs/docusaurus.config.ts`
   - ⚠️ **IMPORTANTE**: Atualize os seguintes campos com os dados do seu repositório:
     ```typescript
     const config: Config = {
       title: "NOME_DO_PROJETO Docs",        // Exemplo: "MeuProjeto Docs"
       tagline: "Descrição do projeto",      // Exemplo: "Sistema de Gestão"
       baseUrl: "/NOME_DO_REPOSITORIO/",     // Exemplo: "/sistema-gestao/"
       projectName: "NOME_DO_REPOSITORIO",   // Exemplo: "sistema-gestao"
     }
     ```
   - Substitua `NOME_DO_PROJETO`, `NOME_DO_REPOSITORIO` e `ORGANIZACAO` pelos valores correspondentes ao seu projeto
   - ⚠️ **ATENÇÃO**: O `baseUrl` e `projectName` DEVEM corresponder EXATAMENTE ao nome do repositório

## Desenvolvimento Local

```bash
# Acesse o diretório docs
cd docs

# Instale as dependências
npm install

# Inicie o servidor de desenvolvimento
npm start
```

## Deploy

### Deploy Automático
O deploy automático acontece sempre que há um push na branch `main`. O GitHub Action configurado irá buildar e publicar a documentação automaticamente. Se isso não acontecer, é necessário verificar se houve algum erro na pipeline.

### Deploy Manual (se necessário)
```bash
# No diretório docs
npm run deploy
```

## Estrutura do Diretório

```
docs/
├── docs/                      # Arquivos de documentação em Markdown
│   ├── visao-produto.md       # Documento elaborado pela área de Visão de Produto
│   ├── design.md              # Documento elaborado pela área de Design
│   ├── desenvolvimento.md     # Documento elaborado pela área de Desenvolvimento
├── src/                       # Arquivos fonte do site
├── static/                    # Arquivos estáticos (imagens, etc)
├── docusaurus.config.ts       # Configuração principal
├── package.json               # Dependências e scripts
└── README.md                  # Este arquivo
```

## Troubleshooting

Se você encontrar algum dos seguintes problemas:

1. **CSS não carrega/página sem estilo**:
   - Verifique se `baseUrl` e `projectName` correspondem EXATAMENTE ao nome do seu repositório
   - Exemplo: se seu repositório é "sistema-gestao", então:
     ```typescript
     baseUrl: "/sistema-gestao/"
     projectName: "sistema-gestao"
     ```

2. **Erro 404 ao acessar a página**:
   - Verifique se a branch `gh-pages` foi criada
   - Verifique se o GitHub Pages está configurado para usar a branch `gh-pages`
   - Aguarde alguns minutos após o deploy (pode levar até 5 minutos para atualizar) 