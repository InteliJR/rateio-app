# ⚙️ Tecnologias

## 🗓 Informações Gerais

- **Nome do Projeto:** Divisor de Conta Inteligente

- **Tech Lead:** [Nome do Tech Lead]

- **Data de Entrada na Área:** [30/11/2025]

- **Data Estimada de Conclusão da Área:** [30/11/2025]

## Checklist de Entrada e Saída da Área de Tecnologia

### ✅ Checklist de Entrada

- [✅] Documento de Visão de Produto validado

### 📤 Checklist de Saída

- [✅] Stack definida e aprovada
- [✅] Diagrama de arquitetura completo
- [✅] Plano de implantação claro
- [ ] Documento validado com o time de Desenvolvimento

## Stack Tecnológica

### Mobile (Frontend)
- **Framework:** Expo SDK 52+ (Managed Workflow)
- **Runtime:** React Native 0.76+
- **Linguagem principal:** TypeScript
- **Gerenciamento de Estado:** Zustand
- **Navegação:** Expo Router (file-based routing)
- **Formulários:** React Hook Form + Zod
- **HTTP Client:** Axios
- **UI Components:** React Native Paper
- **Câmera:** Expo Camera
- **Gerenciamento de Imagens:** Expo Image Picker + Expo Image Manipulator
- **Persistência local:** Expo SecureStore (dados sensíveis) + AsyncStorage (cache)
- **Build/Deploy:** Expo Application Services (EAS)
- **Atualizações:** EAS Update (OTA - Over-The-Air)
- **Justificativa da escolha:** 
  - **Expo** oferece developer experience superior com managed workflow
  - **EAS Build** simplifica drasticamente builds e distribuição na Play Store
  - **Expo Router** proporciona navegação type-safe baseada em arquivos
  - **Expo SecureStore** garante armazenamento seguro de tokens
  - **EAS Update** permite correções e features sem rebuild (atualizações OTA)
  - **Expo Camera** e **Image Manipulator** oferecem APIs nativas simplificadas
  - TypeScript garante type-safety e melhor manutenibilidade
  - Zustand oferece state management leve e performático para mobile
  - Desenvolvimento multiplataforma (Android/iOS futuro) com base de código compartilhada
  - Facilita integração com serviços nativos sem eject

### Backend
- **Linguagem:** TypeScript (Node.js)
- **Framework:** NestJS 11
- **ORM:** Prisma 6
- **Estratégia de autenticação/autorização:** JWT (JSON Web Tokens) com Passport.js
- **IA para OCR:** Google Cloud Vision API
- **Processamento de imagens:** Sharp
- **Justificativa da escolha:**
  - NestJS oferece arquitetura modular e escalável
  - TypeScript garante consistência entre mobile e backend
  - Prisma proporciona type-safety no banco e migrations automáticas
  - Google Cloud Vision API oferece OCR robusto para reconhecimento de texto em contas
  - Estrutura orientada a injeção de dependências facilita testes e manutenção

### Banco de Dados
- **Tipo:** Relacional
- **Tecnologia:** PostgreSQL 16
- **Justificativa da escolha:**
  - Banco robusto e confiável para dados estruturados
  - Suporte excelente a ACID e transações complexas
  - Compatível com diversos provedores de DBaaS (AWS RDS, Supabase, Render)
  - Prisma oferece excelente integração com PostgreSQL

### Outras Tecnologias
- **Containerização:** Docker e Docker Compose (desenvolvimento backend)
- **Testes automatizados:** Jest (backend e mobile), Detox (E2E mobile)
- **Validação de dados:** class-validator e class-transformer (backend), Zod (mobile)
- **Documentação de API:** Swagger/OpenAPI
- **Monitoramento e logs:** Sentry (erros), Expo Analytics (analytics mobile)
- **Storage de imagens:** AWS S3 / Cloudinary (produção)
- **CI/CD:** GitHub Actions + EAS Build
- **Justificativa da escolha:**
  - Docker garante consistência entre ambientes de desenvolvimento do backend
  - Sentry captura erros em produção tanto do app quanto da API
  - S3/Cloudinary oferecem storage escalável para imagens das contas
  - Expo Analytics fornece insights sobre uso do app nativamente integrado
  - EAS Build automatiza processo de build e distribuição

## Arquitetura da Solução

### Visão Geral da Arquitetura

A solução segue uma arquitetura **mobile-backend** com separação clara entre aplicativo mobile e backend:

- **Mobile (Expo + React Native):** Aplicativo nativo gerenciado pelo Expo que consome a API REST do backend
- **Backend (NestJS + Prisma):** API REST que implementa lógica de negócio, processamento de imagens via IA e gerencia persistência
- **Banco de Dados (PostgreSQL):** Armazenamento persistente em ambiente gerenciado (DBaaS)
- **Storage (S3/Cloudinary):** Armazenamento de imagens das contas
- **EAS (Expo Application Services):** Plataforma de build, distribuição e atualizações OTA

A arquitetura foi projetada para **desenvolvimento local simplificado** e **deploy em produção com serviços gerenciados**, garantindo:
- Facilidade de desenvolvimento (Expo Dev Client + Docker para backend)
- Confiabilidade em produção (DBaaS e storage gerenciados)
- Escalabilidade (API stateless, storage externo, banco gerenciado)
- Performance mobile (cache local, otimização de imagens via Expo)
- Deploy simplificado (EAS Build automatiza todo processo)

### Componentes Principais

#### Mobile App (Expo)
- **Expo Router:** Navegação file-based type-safe
- **Screens:** Telas organizadas em diretórios `(auth)`, `(tabs)`, etc
- **State Management:** Zustand stores para estado global (auth, conta atual, participantes)
- **HTTP Client:** Axios configurado com interceptors para autenticação
- **Câmera:** Expo Camera para captura de fotos
- **Image Processing:** Expo Image Manipulator para otimização local
- **Persistência Local:** 
  - Expo SecureStore para tokens (criptografado)
  - AsyncStorage para cache (histórico, participantes)
- **EAS Update:** Sistema de atualizações OTA para correções rápidas

#### Backend (NestJS)
- **Controllers:** Endpoints REST que recebem requisições HTTP
- **Services:** Lógica de negócio e orquestração
- **OCR Service:** Integração com Google Cloud Vision API
- **Image Processing Service:** Otimização e manipulação de imagens (Sharp)
- **Prisma Service:** Camada de acesso a dados (ORM)
- **Guards/Interceptors:** Autenticação JWT, autorização e validação
- **DTOs:** Validação de entrada/saída com class-validator

#### Banco de Dados
- **PostgreSQL:** Instância gerenciada via DBaaS
- **Entidades principais:**
  - Users (usuários do app)
  - Bills (contas fotografadas)
  - BillItems (itens reconhecidos da conta)
  - Participants (pessoas que dividem conta)
  - Divisions (divisão de cada item entre participantes)
  - Fees (taxas de garçom/couvert)
- **Prisma Migrations:** Controle de versão do schema

#### Storage de Imagens
- **AWS S3 / Cloudinary:** Armazenamento das fotos das contas
- **Processamento:** Resize e otimização antes de enviar para OCR
- **URL pré-assinadas:** Segurança no acesso às imagens

### Diagrama da Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│                      USUÁRIO MOBILE                          │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              MOBILE APP (Expo + React Native)                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Expo Router  │  │    Zustand   │  │   Services   │      │
│  │  (Routes)    │  │   (State)    │  │    (API)     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Expo Camera  │  │SecureStore + │  │    Axios     │      │
│  │   (Foto)     │  │ AsyncStorage │  │  (HTTP)      │      │
│  └──────────────┘  └──────────────┘  └──────┬───────┘      │
│                                              │              │
│                                              │ HTTPS/REST   │
└──────────────────────────────────────────────┼──────────────┘
                                               │
                                               ▼
┌─────────────────────────────────────────────────────────────┐
│              BACKEND (NestJS + Prisma)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Controllers  │→ │   Services   │→ │Prisma Service│      │
│  └──────────────┘  └──────────────┘  └──────┬───────┘      │
│                                              │              │
│  ┌──────────────┐  ┌──────────────┐         │              │
│  │  OCR Service │  │Image Process │         │              │
│  │(Vision API)  │  │   (Sharp)    │         │              │
│  └──────────────┘  └──────────────┘         │              │
└──────────────────────────────────────────────┼──────────────┘
                                               │
                    ┌──────────────────────────┼─────────┐
                    │                          │         │
                    ▼                          ▼         ▼
        ┌────────────────────┐    ┌────────────────────────┐
        │  AWS S3/Cloudinary │    │   PostgreSQL (DBaaS)   │
        │  (Imagens)         │    │                        │
        │                    │    │  • Users               │
        │  • Fotos contas    │    │  • Bills               │
        │  • Thumbnails      │    │  • BillItems           │
        │  • Otimizadas      │    │  • Participants        │
        └────────────────────┘    │  • Divisions           │
                                  │  • Fees                │
                                  └────────────────────────┘

                    ┌──────────────────────────┐
                    │ Expo Application Services│
                    │        (EAS)             │
                    │                          │
                    │  • EAS Build (CI/CD)     │
                    │  • EAS Submit (Deploy)   │
                    │  • EAS Update (OTA)      │
                    └──────────────────────────┘
```

## Estrutura de Implantação

### Ambiente de Desenvolvimento

#### Como os devs devem subir localmente:

**Backend + Banco (Docker):**
```bash
# Clonar repositório
git clone <repo-url>
cd rateio-app

# Configurar variáveis de ambiente
cp .env.example .env
cp backend/.env.example backend/.env

# Subir backend + banco com Docker
docker-compose up -d

# Executar migrations
docker-compose exec api npx prisma migrate dev

# Criar seed inicial (usuário de teste)
docker-compose exec api npx prisma db seed
```

**Mobile App (Expo):**
```bash
# Instalar Expo CLI globalmente (se ainda não tiver)
npm install -g expo-cli

# Instalar dependências
cd mobile
npm install

# Configurar variáveis de ambiente
cp .env.example .env
# Editar EXPO_PUBLIC_API_URL com IP da máquina (não localhost!)

# Iniciar Expo Dev Server
npx expo start

# Opções:
# - Pressione 'a' para abrir no emulador Android
# - Pressione 'i' para abrir no simulador iOS (apenas macOS)
# - Escaneie QR Code com Expo Go no celular
```

**⚠️ IMPORTANTE para Expo:** 
- Use variáveis com prefixo `EXPO_PUBLIC_` (não `REACT_APP_`)
- Use o IP da sua máquina no `.env`, não `localhost` (ex: `EXPO_PUBLIC_API_URL=http://192.168.1.100:3000`)
- Para desenvolvimento com Expo Go, não precisa de emulador
- Para development builds: `npx expo run:android` ou `npx expo run:ios`

#### Docker/Compose disponível?
✅ Sim. `docker-compose.yml` na raiz orquestra apenas o backend:
- Serviço `api` (NestJS)
- Serviço `db` (PostgreSQL)

**Mobile não precisa de Docker** - Expo gerencia tudo nativamente.

#### Variáveis de ambiente principais:

**Backend (`backend/.env`):**
```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/rateio_dev"
NODE_ENV=development
PORT=3000
JWT_SECRET=seu-secret-aqui
JWT_REFRESH_SECRET=outro-secret-aqui
PASSWORD_PEPPER=pepper-para-senha

# OCR API
GOOGLE_VISION_API_KEY=sua-key-aqui

# Storage de imagens
AWS_S3_BUCKET=rateio-contas-dev
AWS_S3_REGION=us-east-1
AWS_S3_ACCESS_KEY=key
AWS_S3_SECRET_KEY=secret
```

**Mobile (`mobile/.env`):**
```bash
EXPO_PUBLIC_API_URL=http://192.168.1.100:3000
EXPO_PUBLIC_ENV=development
```

**Docker Compose (`.env` na raiz):**
```bash
DB_USER=postgres
DB_PASSWORD=postgres123
DB_NAME=rateio_dev
DB_PORT=5432
```

### Ambiente de Produção

#### URL:
- Mobile App: Play Store (distribuído via EAS Submit)
- Backend API: `https://api.rateio.com` (a definir)

#### Estratégia de deploy:

**Mobile (Android via EAS):**
1. **Build via EAS:**
   ```bash
   # Build de produção (gera AAB para Play Store)
   eas build --platform android --profile production
   ```

2. **Submit automático para Play Store:**
   ```bash
   eas submit --platform android --latest
   ```

3. **Atualizações OTA (sem rebuild):**
   ```bash
   # Para correções e features que não precisam de código nativo
   eas update --branch production --message "Correção de bugs"
   ```

4. **Versionamento:**
   - Gerenciado via `app.json` (`version` e `android.versionCode`)
   - Incrementar a cada release

**Vantagens do EAS:**
- ✅ Builds na nuvem (não precisa de máquina potente local)
- ✅ Submit automático para Play Store
- ✅ Atualizações OTA instantâneas (sem aprovação da loja)
- ✅ Preview builds para testar antes do release
- ✅ Gerenciamento de credenciais simplificado

**Backend:**
- Deploy via AWS App Runner, ECS, Render ou Railway
- Container Docker em produção
- Auto-scaling baseado em carga
- Health checks configurados

**Banco de Dados:**
- DBaaS gerenciado (AWS RDS, Supabase)
- Backups automáticos diários
- Retenção de 30 dias

**Storage de Imagens:**
- AWS S3 com CloudFront (CDN)
- Lifecycle policies (deletar imagens antigas após 90 dias)
- Compressão automática

#### Infraestrutura:
- **Mobile:** 
  - **EAS Build** - Builds automatizados na nuvem
  - **EAS Submit** - Deploy automático para Play Store
  - **EAS Update** - Atualizações OTA instantâneas
  - Google Play Store (distribuição final)
- **Backend:** AWS App Runner ou Render
- **Banco de Dados:** AWS RDS PostgreSQL ou Supabase
- **Storage:** AWS S3 + CloudFront
- **OCR:** Google Cloud Vision API
- **Monitoramento:** 
  - Sentry (erros backend + mobile)
  - Expo Analytics (eventos e métricas do app)
- **DNS:** Cloudflare ou Route 53
- **SSL/TLS:** Certificados gerenciados pelo provedor
- **CI/CD:** GitHub Actions integrado com EAS

#### Ferramentas de observabilidade ativas:
- **Logs API:** CloudWatch (AWS) ou logs nativos do provedor
- **Logs Mobile:** Sentry para crash reports
- **Analytics:** Expo Analytics nativo + eventos customizados
- **Monitoramento de API:** Sentry para erros de backend
- **Uptime monitoring:** UptimeRobot
- **EAS Insights:** Dashboard de builds, updates e crashes

### Diagrama de Implantação

#### Desenvolvimento (Local)
```
┌─────────────────────────────────────────┐
│         Máquina do Desenvolvedor        │
│  ┌──────────────────────────────────┐   │
│  │   Docker Compose (Backend)       │   │
│  │  ┌────────────┐  ┌────────────┐  │   │
│  │  │ Container  │  │ Container  │  │   │
│  │  │   API      │  │    DB      │  │   │
│  │  │  (NestJS)  │→ │(PostgreSQL)│  │   │
│  │  └────────────┘  └────────────┘  │   │
│  └──────────────────────────────────┘   │
│                                          │
│  ┌──────────────────────────────────┐   │
│  │  Expo Dev Client                 │   │
│  │  ┌────────────────────────────┐  │   │
│  │  │  Expo Go (celular) OU      │  │   │
│  │  │  Emulador/Simulador        │  │   │
│  │  │  → Conecta via IP local    │  │   │
│  │  └────────────────────────────┘  │   │
│  └──────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

#### Produção
```
┌──────────────────────────────────────────────────────────┐
│                   USUÁRIOS MOBILE                         │
└────────────────────┬─────────────────────────────────────┘
                     │
                     │ Download via Play Store
                     ▼
┌────────────────────────────────────────────────────────────┐
│              Google Play Store                              │
│              (APK/AAB distribuído via EAS Submit)          │
└────────────────────┬───────────────────────────────────────┘
                     │
                     │ HTTPS API Calls
                     ▼
┌────────────────────────────────────────────────────────────┐
│                 Cloudflare / CDN                            │
└────────┬───────────────────────────────────┬───────────────┘
         │ HTTPS                             │ HTTPS
         ▼                                   ▼
┌──────────────────────┐      ┌─────────────────────────────┐
│  AWS S3/Cloudinary   │      │  AWS App Runner / Render    │
│  (Storage Imagens)   │      │  (Backend NestJS)           │
│                      │      │                             │
│  • Fotos contas      │      │  • Container Docker         │
│  • CDN CloudFront    │◄─────│  • OCR Service (Vision API) │
│  • Lifecycle policy  │      │  • Auto-scaling             │
└──────────────────────┘      └──────────┬──────────────────┘
                                         │
                                         │ TCP/SSL
                                         ▼
                              ┌────────────────────────────┐
                              │   AWS RDS / Supabase       │
                              │   (PostgreSQL DBaaS)       │
                              │                            │
                              │  • Backups automáticos     │
                              │  • Multi-AZ (HA)           │
                              │  • Encryption at rest      │
                              │  • Connection pooling      │
                              └────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│            Expo Application Services (EAS)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  EAS Build   │  │  EAS Submit  │  │  EAS Update  │       │
│  │              │  │              │  │              │       │
│  │ • Builds iOS │  │ • Deploy     │  │ • Atualizações│      │
│  │ • Builds     │  │   automático │  │   OTA        │       │
│  │   Android    │  │   Play Store │  │ • Rollback   │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
└──────────────────────────────────────────────────────────────┘

                              ┌────────────────────────────┐
                              │   Monitoramento            │
                              │                            │
                              │  • Sentry (erros)          │
                              │  • Expo Analytics          │
                              │  • CloudWatch (logs)       │
                              │  • EAS Insights            │
                              └────────────────────────────┘
```

## Banco de Dados

Este schema define a estrutura de um sistema que:

* Gerencia **usuários e autenticação**
* Permite **upload e processamento de contas (bills)** com OCR
* Organiza **itens**, **participantes**, **divisões** e **taxas adicionais**

## 👤 Usuários e Autenticação

### Enum: `UserRole`

Define o tipo de usuário.

| Valor   | Descrição             |
| ------- | --------------------- |
| `ADMIN` | Usuário administrador |
| `USER`  | Usuário comum         |

---

### Tabela: `users`

| Campo       | Tipo       | Descrição                              |
| ----------- | ---------- | -------------------------------------- |
| `id`        | `String`   | Identificador único (UUID)             |
| `email`     | `String`   | E-mail do usuário (único)              |
| `name`      | `String`   | Nome completo                          |
| `password`  | `String`   | Senha (hash)                           |
| `role`      | `UserRole` | Nível de permissão (`USER` por padrão) |
| `isActive`  | `Boolean`  | Indica se a conta está ativa           |
| `createdAt` | `DateTime` | Data de criação                        |
| `updatedAt` | `DateTime` | Data da última atualização             |

**Relações**

* `bills`: [Bill[]] — Contas pertencentes ao usuário
* `revokedTokens`: [RevokedToken[]] — Tokens revogados deste usuário

---

### Tabela: `revoked_tokens`

| Campo       | Tipo       | Descrição                  |
| ----------- | ---------- | -------------------------- |
| `id`        | `String`   | Identificador único        |
| `token`     | `String`   | Token JWT revogado (único) |
| `userId`    | `String`   | ID do usuário proprietário |
| `expiresAt` | `DateTime` | Data de expiração do token |
| `createdAt` | `DateTime` | Data da revogação          |

**Relações**

* `user`: referência a `User` (`onDelete: Cascade`)

**Índices**

* `token`
* `expiresAt`
* `userId`

---

## 💳 Contas (Bills)

### Enum: `BillStatus`

Representa o status atual de uma conta.

| Valor         | Descrição                    |
| ------------- | ---------------------------- |
| `PENDING_OCR` | Aguardando processamento OCR |
| `OCR_FAILED`  | Falha no OCR                 |
| `REVIEWING`   | Usuário revisando itens      |
| `DIVIDING`    | Usuário dividindo a conta    |
| `COMPLETED`   | Divisão finalizada           |

---

### Tabela: `bills`

| Campo               | Tipo         | Descrição                    |
| ------------------- | ------------ | ---------------------------- |
| `id`                | `String`     | Identificador único          |
| `userId`            | `String`     | ID do usuário dono da conta  |
| `imageUrl`          | `String`     | URL da imagem da conta (S3)  |
| `imageKey`          | `String`     | Chave no S3 (para deleção)   |
| `status`            | `BillStatus` | Estado atual da conta        |
| `ocrRawText`        | `String?`    | Texto bruto extraído via OCR |
| `totalAmount`       | `Decimal?`   | Valor total da conta         |
| `establishmentName` | `String?`    | Nome do estabelecimento      |
| `createdAt`         | `DateTime`   | Data de criação              |
| `updatedAt`         | `DateTime`   | Última atualização           |

**Relações**

* `user`: referência a `User`
* `items`: lista de itens (`BillItem[]`)
* `participants`: lista de participantes (`Participant[]`)
* `fees`: taxas adicionais (`Fee[]`)

**Índices**

* `userId`
* `status`
* `createdAt`

---

## 🍽️ Itens da Conta

### Tabela: `bill_items`

| Campo        | Tipo       | Descrição                          |
| ------------ | ---------- | ---------------------------------- |
| `id`         | `String`   | Identificador único                |
| `billId`     | `String`   | ID da conta associada              |
| `name`       | `String`   | Nome do item                       |
| `quantity`   | `Int`      | Quantidade (default: 1)            |
| `unitPrice`  | `Decimal`  | Preço unitário                     |
| `totalPrice` | `Decimal`  | Preço total (unitPrice × quantity) |
| `createdAt`  | `DateTime` | Data de criação                    |
| `updatedAt`  | `DateTime` | Última atualização                 |

**Relações**

* `bill`: referência a `Bill` (`onDelete: Cascade`)
* `divisions`: divisões entre participantes (`Division[]`)

**Índices**

* `billId`

---

## 🧑‍🤝‍🧑 Participantes

### Tabela: `participants`

| Campo       | Tipo       | Descrição             |
| ----------- | ---------- | --------------------- |
| `id`        | `String`   | Identificador único   |
| `billId`    | `String`   | ID da conta associada |
| `name`      | `String`   | Nome do participante  |
| `createdAt` | `DateTime` | Data de criação       |
| `updatedAt` | `DateTime` | Última atualização    |

**Relações**

* `bill`: referência a `Bill`
* `divisions`: lista de divisões que envolvem este participante (`Division[]`)

**Índices**

* `billId`

---

## 💰 Divisões (Quem paga o quê)

### Tabela: `divisions`

| Campo           | Tipo       | Descrição                               |
| --------------- | ---------- | --------------------------------------- |
| `id`            | `String`   | Identificador único                     |
| `billItemId`    | `String`   | ID do item dividido                     |
| `participantId` | `String`   | ID do participante                      |
| `shareAmount`   | `Decimal`  | Valor pago pelo participante neste item |
| `createdAt`     | `DateTime` | Data de criação                         |
| `updatedAt`     | `DateTime` | Última atualização                      |

**Relações**

* `billItem`: referência a `BillItem`
* `participant`: referência a `Participant`

**Restrições**

* `@@unique([billItemId, participantId])` → garante que cada participante aparece apenas uma vez por item

**Índices**

* `billItemId`
* `participantId`

---

## 🧾 Taxas (Garçom, Couvert)

### Enum: `FeeType`

| Valor                | Descrição                     |
| -------------------- | ----------------------------- |
| `SERVICE_PERCENTAGE` | Taxa percentual sobre o total |
| `SERVICE_FIXED`      | Taxa de serviço fixa          |
| `COVER_CHARGE`       | Couvert fixo                  |

---

### Tabela: `fees`

| Campo         | Tipo       | Descrição                   |
| ------------- | ---------- | --------------------------- |
| `id`          | `String`   | Identificador único         |
| `billId`      | `String`   | ID da conta                 |
| `type`        | `FeeType`  | Tipo de taxa                |
| `description` | `String?`  | Descrição da taxa           |
| `value`       | `Decimal`  | Valor ou percentual da taxa |
| `createdAt`   | `DateTime` | Data de criação             |
| `updatedAt`   | `DateTime` | Última atualização          |

**Relações**

* `bill`: referência a `Bill` (`onDelete: Cascade`)

**Índices**

* `billId`

---

## 🧠 Diagrama de Relacionamentos (Resumo)

```
User ───< Bill ───< BillItem ───< Division >─── Participant >─── Bill
        │       │                     │
        │       │                     └── Fee
        │       └── Participant
        └── RevokedToken
```

---

## 🧾 Resumo dos Prefixos e Mapas

| Modelo         | Nome no banco (`@@map`) |
| -------------- | ----------------------- |
| `User`         | `users`                 |
| `RevokedToken` | `revoked_tokens`        |
| `Bill`         | `bills`                 |
| `BillItem`     | `bill_items`            |
| `Participant`  | `participants`          |
| `Division`     | `divisions`             |
| `Fee`          | `fees`                  |

## Considerações de Segurança

### Políticas de CORS:
- **Desenvolvimento:** CORS habilitado para qualquer origem (mobile local)
- **Produção:** CORS configurado apenas para domínios específicos da API
- Mobile apps não sofrem restrições CORS (comunicação nativa)

### Proteção de dados sensíveis:
- **Senhas:** Hash com Argon2 (mais seguro que bcrypt para mobile)
- **Tokens JWT:** Assinados com secret forte, expiração de 7 dias (refresh) e 15min (access)
- **Imagens:** Armazenadas em S3 com URLs pré-assinadas de curta duração
- **Dados em trânsito:** HTTPS/TLS obrigatório
- **Dados em repouso:** Encryption at rest no DBaaS e S3
- **Dados no dispositivo:** 
  - **Expo SecureStore** para tokens (criptografado nativamente)
  - AsyncStorage apenas para cache não-sensível
- **Variáveis sensíveis:** Nunca commitadas, gerenciadas via `.env` e EAS Secrets

### Gestão de segredos:
- **Desenvolvimento:** Arquivo `.env` local (não versionado)
- **Produção Backend:** AWS Secrets Manager ou variáveis de ambiente do provedor
- **Produção Mobile:** **EAS Secrets** (gerenciamento seguro de credenciais)
  ```bash
  # Criar secret no EAS
  eas secret:create --scope project --name API_URL --value https://api.rateio.com
  ```
- **API Keys (OCR):** Armazenadas no backend, nunca no app mobile
- **Build credentials:** Gerenciados automaticamente pelo EAS

### Autenticação e autorização:
- **Método:** JWT (JSON Web Tokens) via Passport.js
- **Fluxo:**
  1. Login → Backend valida credenciais → Retorna access token + refresh token
  2. App armazena tokens no **Expo SecureStore** (criptografado)
  3. Requisições incluem token no header `Authorization: Bearer <token>`
  4. Backend valida token via `JwtGuard`
- **Refresh tokens:** Armazenados de forma segura no Expo SecureStore
- **Logout:** Invalidação de tokens (blacklist) + limpeza do SecureStore
- **Biometria:** Implementável via `expo-local-authentication`

### Proteção de Imagens:
- **Upload:** Usuário captura com Expo Camera → Otimiza com Image Manipulator → Envia para backend
- **URLs:** S3 gera URLs pré-assinadas com expiração de 1 hora
- **Processamento:** Imagens temporárias deletadas após OCR
- **Privacidade:** Cada conta pertence a um usuário, não é pública

### Outras Medidas:
- **Rate Limiting:** Implementado via `@nestjs/throttler` para prevenir abuso da API
- **Validação de Input:** class-validator em todos os DTOs (backend), Zod (mobile)
- **Sanitização:** Prisma previne SQL injection automaticamente
- **Headers de Segurança:** Helmet.js configurado no backend
- **Permissões Mobile:** 
  - Gerenciadas via Expo Config Plugins
  - Solicitadas em runtime de forma nativa
  - Mensagens customizadas no `app.json`
- **Builds Seguros:** EAS gera APKs otimizados e assinados automaticamente
- **SSL Pinning:** Implementável via Expo Config Plugins se necessário
- **Logs:** Não logar informações sensíveis (senhas, tokens, dados pessoais)
- **Code Obfuscation:** Configurável no `eas.json` para builds de produção

## Fluxo de Dados - OCR e Divisão de Conta

### 1. Captura e Upload de Imagem

```
Mobile App → Tira foto → Comprime imagem → Envia para API
                                                │
                                                ▼
                                        Backend recebe imagem
                                                │
                                                ├─→ Valida formato/tamanho
                                                ├─→ Otimiza com Sharp
                                                └─→ Upload para S3
```

### 2. Processamento OCR

```
Backend → Gera URL pré-assinada do S3 → Envia para Google Vision API
                                                │
                                                ▼
                                        Vision API retorna texto
                                                │
                                                ▼
                                        Backend processa texto:
                                        - Extrai itens
                                        - Extrai valores
                                        - Identifica total
                                                │
                                                ▼
                                        Salva no banco (Bill + BillItems)
                                                │
                                                ▼
                                        Retorna para o App
```

### 3. Divisão de Conta

```
Mobile App exibe itens reconhecidos
     │
     ├─→ Usuário adiciona participantes
     ├─→ Usuário atribui itens a pessoas
     ├─→ Usuário adiciona taxas (garçom/couvert)
     │
     ▼
App calcula localmente (preview)
     │
     ▼
Usuário confirma → Envia divisão para API
                         │
                         ▼
                  Backend salva divisões
                         │
                         ▼
                  Backend calcula total de cada pessoa
                         │
                         ▼
                  Retorna resultado finalizado
                         │
                         ▼
                  App exibe resumo e salva no histórico
```
## Otimizações para Mobile com Expo

### Performance:
- **Imagens:** 
  - Compressão com **Expo Image Manipulator** antes de upload
  - Resize automático para dimensões ideais
- **Cache:** 
  - AsyncStorage para dados offline (participantes, histórico recente)
  - Expo Image caching automático
- **Lazy Loading:** Carregar histórico sob demanda (paginação)
- **Debounce:** Busca de participantes com debounce para evitar requests excessivos
- **Hermes Engine:** Habilitado por padrão no Expo para melhor performance JS

### UX:
- **Loading States:** Feedback visual durante upload e OCR
- **Offline Mode:** App funciona offline para visualizar histórico
- **Error Handling:** Mensagens claras de erro (falha no OCR, sem conexão, etc)
- **Haptic Feedback:** `expo-haptics` para vibrações sutis
- **Splash Screen:** Configurável via `app.json`
- **App Icons:** Gerados automaticamente pelo Expo

### Bateria:
- **Câmera:** Desligar quando não estiver em uso (Expo gerencia automaticamente)
- **Polling:** Evitar polling desnecessário na API
- **Background Tasks:** Minimizar processamento em background
- **Network:** Expo Network otimiza requisições automaticamente

### Developer Experience:
- **Hot Reload:** Instantâneo com Expo Dev Client
- **Error Overlay:** Erros claros e navegáveis
- **Debugging:** Integrado com Flipper e Chrome DevTools
- **OTA Updates:** Correções sem rebuild via EAS Update

## Considerações Adicionais

### Privacidade e LGPD:
- Usuários podem deletar histórico de contas
- Imagens podem ser deletadas do S3 após processamento (opcional)
- Política de privacidade clara no app
- Consentimento para uso de dados
- **Expo respei ta permissões LGPD** nativamente

### Escalabilidade:
- API stateless permite horizontal scaling
- S3 escala automaticamente
- Banco de dados pode ser escalado verticalmente ou com read replicas
- OCR API (Google Vision) tem limites de quota - monitorar uso
- **EAS Build** escala automaticamente para múltiplos builds simultâneos

### Custos:
- **EAS:**
  - Free tier: 30 builds/mês
  - Production: $29/mês para builds ilimitados
- **Google Vision API:** ~$1.50 por 1000 imagens
- **AWS S3:** Storage + requests (baixo custo)
- **RDS:** Instância t3.micro elegível para free tier (12 meses)
- **Monitorar:** Usage do Vision API para evitar custos excessivos

### Roadmap Técnico:
- **Fase 1:** MVP - Android com funcionalidades core via Expo
- **Fase 2:** Melhorias de UX e performance
- **Fase 3:** **Versão iOS (mesmo código, zero esforço adicional com Expo)**
- **Fase 4:** Features avançadas (split de pagamento, integração PIX)
- **Fase 5:** Atualizações OTA regulares via EAS Update

### Vantagens do Expo para o Projeto:
- ✅ **Time-to-market reduzido:** Setup em minutos vs dias
- ✅ **Multiplataforma real:** iOS e Android com mesmo código
- ✅ **Deploy simplificado:** EAS automatiza 90% do processo
- ✅ **Atualizações instantâneas:** OTA updates sem aprovação de loja
- ✅ **DX superior:** Hot reload, error overlay, debugging integrado
- ✅ **Menor curva de aprendizado:** Abstrai complexidades nativas
- ✅ **Comunidade ativa:** Plugins e suporte excelentes
- ✅ **Custo-benefício:** Free tier generoso, planos acessíveis