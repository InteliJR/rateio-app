---
sidebar_position: 4
---

# Tecnologias e arquitetura

**Atualizado em:** 25 de agosto de 2026

Este documento descreve o estado implementado do Por Partes. Versões exatas devem ser confirmadas nos arquivos `package.json` e `package-lock.json` de cada aplicação.

## Visão geral

```text
┌──────────────────────────────┐
│ App Expo / React Native      │
│ Android + configuração web   │
└──────────────┬───────────────┘
               │ HTTPS + JWT
┌──────────────▼───────────────┐
│ API NestJS na Vercel         │
│ Auth, contas, itens e rateio  │
└───────┬───────────┬──────────┘
        │           │
┌───────▼──────┐ ┌──▼─────────────────┐
│ PostgreSQL   │ │ Amazon S3          │
│ Supabase     │ │ imagens da conta   │
└───────┬──────┘ └────────────────────┘
        │ fila persistida
┌───────▼──────────────────────────────┐
│ Processador agendado de OCR          │
│ OpenAI (modelo configurável)         │
└──────────────────────────────────────┘
```

## Aplicativo

| Área | Implementação atual |
| --- | --- |
| Base | Expo `~54.0.31`, React Native `0.81.5`, React `19.1.0` |
| Linguagem | TypeScript `~5.9.2` |
| Rotas | Expo Router `~6.0.23` com typed routes |
| Dados remotos | TanStack React Query `^5.90.19` e Axios `^1.13.1` |
| Estado local | Zustand `^5.0.8`, Context API e AsyncStorage |
| Formulários | React Hook Form, Zod e resolvers |
| Autenticação local | Expo Secure Store |
| Login Google | `@react-native-google-signin/google-signin` |
| Imagem | Expo Camera, Image Picker e Image Manipulator |
| Navegação/visual | React Navigation, Reanimated, SVG e Ionicons |

O aplicativo usa a nova arquitetura do React Native, orientação retrato e tema automático. O pacote Android é `com.intelijunior.porpartes`.

O módulo de login Google é nativo. Desenvolvimento e validação devem ocorrer em development build ou build EAS; o Expo Go não representa o binário real deste projeto.

### Organização do aplicativo

- `frontend/app`: rotas de autenticação, criação, histórico e perfil;
- `frontend/components`: componentes comuns, formulários e modais;
- `frontend/contexts`: autenticação, tema e estado compartilhado;
- `frontend/hooks`: consultas e comportamentos reutilizáveis;
- `frontend/services`: integração HTTP e serviços do dispositivo;
- `frontend/stores`: estado local do fluxo de criação;
- `frontend/types`: contratos TypeScript.

## Backend

| Área | Implementação atual |
| --- | --- |
| Framework | NestJS `^11.0.0` sobre Node.js |
| Linguagem | TypeScript `^5.7.0` |
| Persistência | Prisma `^6.0.0` e PostgreSQL |
| Autenticação | JWT, Passport, Argon2 e Google Auth Library |
| Validação | class-validator, class-transformer e Zod |
| Segurança HTTP | Helmet e throttling por rota/global |
| Arquivos | Multer e AWS SDK v3 para S3 |
| OCR | OpenAI SDK `^6.9.1` |
| Tarefas | Nest Schedule e cron da Vercel |
| E-mail | Nodemailer |
| Testes | Jest e Supertest |

### Módulos principais

- autenticação e recuperação de senha;
- usuários, perfil e avatar;
- contas e itens;
- participantes, divisões e taxas;
- armazenamento de imagem;
- OCR e fila persistida;
- métricas e health check;
- processamento interno protegido por segredo de cron.

A API usa `PORT=3000` por padrão. `GET /health` verifica conexão com o banco e inclui um retrato da fila e das métricas. A documentação de rotas deve ser derivada dos controllers e DTOs quando necessária; não há mais uma cópia manual isolada dentro do backend.

## Dados

O schema Prisma contém:

| Entidade | Responsabilidade |
| --- | --- |
| `User` | conta, perfil, papel, login Google e relações do usuário |
| `RevokedToken` | invalidação explícita de tokens |
| `PasswordResetToken` | recuperação de senha com expiração e uso único |
| `Bill` | conta, estabelecimento, imagem, total e estado do fluxo |
| `BillItem` | item, quantidade decimal, unidade e preços |
| `Participant` | participante vinculado a uma conta |
| `Division` | valor de um item atribuído a um participante |
| `Fee` | taxa percentual ou fixa |
| `OcrJob` | fila, tentativas, bloqueio, disponibilidade e resultado do OCR |

Relações dependentes usam exclusão em cascata. Valores monetários e quantidades são armazenados como `Decimal`; o aplicativo não deve assumir que toda quantidade é inteira.

Estados atuais de uma conta:

```text
PENDING_OCR | OCR_FAILED | REVIEWING | DIVIDING | COMPLETED
```

Estados atuais de um trabalho de OCR:

```text
PENDING | RUNNING | FAILED | COMPLETED
```

O schema ainda não contém créditos, ledger, compras ou dados de anúncios. Esses modelos pertencem à próxima fase e devem entrar por migrações revisadas.

## Fluxo de imagem e OCR

Fluxo preferencial:

1. o aplicativo solicita uma URL de upload;
2. a API cria a conta e gera uma URL pré-assinada;
3. o aplicativo envia a imagem diretamente ao S3;
4. a imagem é associada à conta e um `OcrJob` é criado;
5. o processador interno busca trabalhos pendentes;
6. o serviço consulta a OpenAI, valida o resultado e grava os itens;
7. o aplicativo consulta o estado até apresentar revisão ou erro.

Há fallback de upload multipart/local para desenvolvimento e compatibilidade. Em produção, o envio direto ao S3 reduz carga e duração da função da API.

O modelo padrão do exemplo de ambiente é `gpt-4.1-mini`, controlado por `OPENAI_MODEL`. O provedor, o modelo e os prompts devem permanecer configuráveis; uma troca não pode exigir alteração dos contratos do aplicativo.

### Fila atual

- persistida no PostgreSQL por `OcrJob`;
- tentativas, concorrência, atraso e tempo de bloqueio configurados por `OCR_QUEUE_*`;
- processador interno protegido por `INTERNAL_CRON_SECRET` ou `CRON_SECRET`;
- cron da Vercel chama `/internal/ocr/process-pending` uma vez por minuto;
- o exemplo de produção limita cada execução a um trabalho por padrão.

Antes de cobrar por leitura, a fila precisa cumprir os critérios de idempotência, auditoria e consumo definidos no planejamento de épicos.

## Autenticação e segurança

- senhas são armazenadas com Argon2 e pepper configurável;
- access e refresh tokens usam segredos distintos;
- logout e eventos de segurança podem revogar tokens;
- login Google valida o ID token contra os client IDs permitidos no backend;
- rotas de domínio usam JWT e verificações de propriedade nos serviços;
- rotas administrativas usam papel `ADMIN`;
- validação global rejeita campos inesperados conforme a configuração da API;
- Helmet e limites de requisição reduzem exposição a abuso comum;
- segredos pertencem ao ambiente e nunca ao repositório.

Autorização na API continua obrigatória mesmo quando o banco está hospedado no Supabase. Mudanças de RLS devem ser tratadas como defesa adicional e validadas com a função usada pelo Prisma antes da implantação.

## Ambientes e deploy

| Componente | Desenvolvimento | Hospedado/distribuição |
| --- | --- | --- |
| Aplicativo | development build + Metro | EAS Build; AAB de produção para Google Play |
| API | NestJS local ou Docker | Vercel Functions |
| Banco | PostgreSQL 16 local | PostgreSQL no Supabase |
| Imagens | armazenamento local ou S3 | Amazon S3 |
| OCR | OpenAI, quando configurada | OpenAI + processador agendado |
| Site legal | Docusaurus local | GitHub Pages |

Perfis EAS:

- `development`: development client interno;
- `preview`: APK de distribuição interna;
- `production`: AAB com incremento automático.

O alvo de distribuição atual é Android. A configuração iOS ainda não deve ser tratada como release suportado sem completar identificadores, credenciais, testes e publicação específicos.

## Configuração

As referências são `backend/.env.example` e `frontend/.env.example`.

Grupos principais:

- banco: `DATABASE_URL`, `DIRECT_URL`;
- sessão: `JWT_SECRET`, `JWT_REFRESH_SECRET`, `PASSWORD_PEPPER`;
- Google: `GOOGLE_OAUTH_CLIENT_IDS`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`;
- OCR: `OPENAI_API_KEY`, `OPENAI_MODEL`, `OCR_QUEUE_*`;
- cron: `INTERNAL_CRON_SECRET`, `CRON_SECRET`;
- S3: `AWS_S3_*` e `AWS_S3_PUBLIC_BASE_URL`;
- rede: `PUBLIC_BASE_URL`, `EXPO_PUBLIC_API_URL`, `PORT`;
- proteção de tráfego: `THROTTLE_TTL_MS`, `THROTTLE_LIMIT`.

## Qualidade e validação

Comandos mínimos antes de integrar mudanças:

```bash
# backend
cd backend
npm test -- --runInBand
npm run build

# frontend
cd ../frontend
npx tsc --noEmit

# site público
cd ../docs
npm run typecheck
npm run build
```

Mudanças de alto risco devem acrescentar testes de integração para autorização, concorrência, fila, ledger e compra. Desempenho deve ser comparado em ambiente e carga equivalentes, usando métricas anteriores e posteriores.

## Limitações conhecidas e trabalho planejado

- não existe limite de uso ou saldo para OCR;
- não existe ledger de créditos;
- não existe integração com Google Play Billing;
- não existe SDK ou exibição de anúncios;
- o custo por leitura ainda precisa de telemetria adequada;
- a fila de OCR depende de execução agendada e requer hardening antes da cobrança;
- cobertura de testes e observabilidade devem crescer junto das funcionalidades.

O plano de resolução está em [Planejamento de épicos — nova fase](../dev/planejamento-epicos-nova-fase-2026.md).
