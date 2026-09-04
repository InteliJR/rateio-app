# Por Partes

Aplicativo mobile para registrar uma conta, revisar seus itens e dividir valores e taxas entre participantes. O usuário pode criar a conta manualmente ou enviar uma foto para leitura assistida por IA.

O produto atual tem aplicativo Android em Expo/React Native, API NestJS, PostgreSQL/Supabase, armazenamento de imagens no S3 e processamento assíncrono de OCR com OpenAI. Compra de créditos e anúncios ainda não fazem parte da versão implementada; essas entregas estão organizadas no [planejamento da nova fase](./docs/dev/planejamento-epicos-nova-fase-2026.md).

## Funcionalidades atuais

- cadastro, login por e-mail e login nativo com Google;
- recuperação de senha e exclusão da própria conta;
- criação manual de contas ou captura/seleção de imagem;
- fila assíncrona para leitura de itens por IA;
- revisão e edição de itens, inclusive quantidades fracionárias e unidades de medida;
- cadastro de participantes, divisão de itens e inclusão de taxas;
- resumo e histórico de contas;
- perfil, avatar, tema claro/escuro e ajuste de tamanho de fonte.

## Arquitetura

| Camada | Tecnologias e serviços atuais |
| --- | --- |
| Aplicativo | Expo 54, React Native 0.81, React 19, Expo Router, TypeScript, React Query e Zustand |
| API | NestJS 11, Prisma 6, JWT/Passport, class-validator e Zod |
| Dados | PostgreSQL; Supabase é o serviço usado nos ambientes hospedados |
| Imagens | Amazon S3 por URLs pré-assinadas, com fallback local no desenvolvimento |
| OCR | fila persistida no PostgreSQL e OpenAI, com `gpt-4.1-mini` como modelo configurado por padrão |
| Distribuição | EAS Build/Google Play para Android, Vercel para a API e GitHub Pages para as páginas legais |

O fluxo principal é:

```text
Aplicativo → API → URL pré-assinada → S3
                    ↓
             trabalho de OCR no PostgreSQL
                    ↓
           processador agendado → OpenAI
                    ↓
          itens para revisão no aplicativo
```

Detalhes de arquitetura, dados e ambientes estão em [Tecnologias e arquitetura](./docs/docs/tecnologias.md).

## Estrutura do repositório

```text
rateio-app/
├── backend/               # API NestJS, Prisma, testes e deploy na Vercel
├── frontend/              # Aplicativo Expo/React Native
├── docs/
│   ├── dev/               # Planejamentos ativos de desenvolvimento
│   ├── docs/              # Visão, design e arquitetura internas
│   └── src/pages/         # Site público e documentos legais
├── scripts/               # Utilitários de build EAS
└── docker-compose.yml     # PostgreSQL e API para desenvolvimento local
```

## Pré-requisitos

- Node.js 18 ou superior;
- npm;
- PostgreSQL 16 local ou projeto Supabase;
- credenciais Google OAuth para testar login nativo;
- credenciais OpenAI e S3 para testar leitura de imagem completa;
- Android Studio/dispositivo Android e um development build para o aplicativo.

O login Google usa um módulo nativo. Por isso, o fluxo completo deve ser validado em um development build ou build EAS, não no Expo Go.

## Desenvolvimento local

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env
npx prisma generate
npx prisma migrate deploy
npm run seed
npm run start:dev
```

No Windows PowerShell, use `Copy-Item .env.example .env` no lugar de `cp`. Revise todos os segredos e URLs no `.env`; os valores do exemplo não são adequados para produção.

Para subir somente o PostgreSQL local pelo Docker:

```bash
docker compose up db
```

A API usa `http://localhost:3000` por padrão. O endpoint `GET /health` informa conexão com banco, fila de OCR e métricas operacionais.

### 2. Aplicativo

```bash
cd frontend
npm install
cp .env.example .env
npx expo start --dev-client
```

Defina `EXPO_PUBLIC_API_URL` com um endereço alcançável pelo dispositivo. Em um celular físico, `localhost` aponta para o próprio celular; use o IP local da máquina ou uma URL HTTPS pública.

Se ainda não houver um development build instalado:

```bash
cd frontend
npx eas build --profile development --platform android
```

Os perfis disponíveis em `frontend/eas.json` são:

- `development`: cliente de desenvolvimento para uso interno;
- `preview`: APK interno;
- `production`: Android App Bundle com incremento automático de versão.

## Variáveis principais

Os catálogos completos e comentados ficam em `backend/.env.example` e `frontend/.env.example`.

| Área | Variáveis principais |
| --- | --- |
| Banco | `DATABASE_URL`, `DIRECT_URL` |
| Autenticação | `JWT_SECRET`, `JWT_REFRESH_SECRET`, `PASSWORD_PEPPER` |
| Google | `GOOGLE_OAUTH_CLIENT_IDS`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` |
| OCR | `OPENAI_API_KEY`, `OPENAI_MODEL`, `OCR_QUEUE_*` |
| Processador agendado | `INTERNAL_CRON_SECRET`, `CRON_SECRET` |
| S3 | `AWS_S3_BUCKET`, `AWS_S3_REGION`, `AWS_S3_ACCESS_KEY`, `AWS_S3_SECRET_KEY` |
| Aplicativo | `EXPO_PUBLIC_API_URL` |

Nunca versione arquivos `.env`, chaves privadas, tokens ou senhas reais.

## Qualidade

Backend:

```bash
cd backend
npm test -- --runInBand
npm run build
```

Frontend:

```bash
cd frontend
npx tsc --noEmit
```

Documentação pública:

```bash
cd docs
npm ci
npm run typecheck
npm run build
```

## Documentação

- [Índice da documentação](./docs/docs/intro.md)
- [Visão do produto](./docs/docs/visao-produto.md)
- [Design do aplicativo](./docs/docs/design.md)
- [Tecnologias e arquitetura](./docs/docs/tecnologias.md)
- [Épicos da nova fase](./docs/dev/planejamento-epicos-nova-fase-2026.md)
- [Tasks do EPIC-00](./docs/dev/epic-00-qualidade-observabilidade.md)
- [Manutenção do site público](./docs/README.md)

As páginas públicas de Política de Privacidade, Termos de Uso e Exclusão de Conta são construídas com Docusaurus e publicadas pelo workflow em `.github/workflows/deploy_docusaurus.yml`.

## Situação da monetização

O código atual não limita leituras por créditos, não processa compras e não solicita anúncios. Não trate esses recursos como disponíveis até que os épicos correspondentes estejam implementados, testados e ativados. O plano preserva a criação manual gratuita e exige validação de compras no servidor, ledger idempotente e controles remotos antes do lançamento.
