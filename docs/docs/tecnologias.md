# ⚙️ Tecnologias

## 🗓 Informações Gerais

- **Nome do Projeto:** Divisor de Conta Inteligente

- **Tech Lead:** [Nome do Tech Lead]

- **Data de Entrada na Área:** [DD/MM/AAAA]

- **Data Estimada de Conclusão da Área:** [DD/MM/AAAA]

## Checklist de Entrada e Saída da Área de Tecnologia

### ✅ Checklist de Entrada

- [✅] Documento de Visão de Produto validado

### 📤 Checklist de Saída

- [ ] Stack definida e aprovada
- [ ] Diagrama de arquitetura completo
- [ ] Plano de implantação claro
- [ ] Documento validado com o time de Desenvolvimento

## Stack Tecnológica

### Mobile (Frontend)
- **Framework:** React Native 0.74+
- **Linguagem principal:** TypeScript
- **Gerenciamento de Estado:** Zustand
- **Navegação:** React Navigation 6
- **Formulários:** React Hook Form + Zod
- **HTTP Client:** Axios
- **UI Components:** React Native Paper / NativeBase (a definir)
- **Câmera:** react-native-vision-camera
- **Gestão de imagens:** react-native-image-picker / react-native-compressor
- **Persistência local:** AsyncStorage / MMKV
- **Build/Deploy:** Expo Application Services (EAS) ou React Native CLI
- **Justificativa da escolha:** 
  - React Native permite desenvolvimento multiplataforma (Android/iOS futuro) com base de código compartilhada
  - TypeScript garante type-safety e melhor manutenibilidade
  - Zustand oferece state management leve e performático para mobile
  - Vision Camera oferece melhor performance e controle sobre captura de imagens
  - Expo EAS simplifica builds e distribuição na Play Store

### Backend
- **Linguagem:** TypeScript (Node.js)
- **Framework:** NestJS
- **ORM:** Prisma
- **Estratégia de autenticação/autorização:** JWT (JSON Web Tokens) com Passport.js
- **IA para OCR:** Google Cloud Vision API / Tesseract.js / AWS Textract (a definir)
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
- **Containerização:** Docker e Docker Compose (desenvolvimento local)
- **Testes automatizados:** Jest (backend e mobile), Detox (E2E mobile)
- **Validação de dados:** class-validator e class-transformer (backend), Zod (mobile)
- **Documentação de API:** Swagger/OpenAPI
- **Monitoramento e logs:** Sentry (erros), Firebase Analytics (analytics mobile)
- **Storage de imagens:** AWS S3 / Cloudinary (produção)
- **Justificativa da escolha:**
  - Docker garante consistência entre ambientes de desenvolvimento
  - Sentry captura erros em produção tanto do app quanto da API
  - S3/Cloudinary oferecem storage escalável para imagens das contas
  - Firebase Analytics fornece insights sobre uso do app

## Arquitetura da Solução

### Visão Geral da Arquitetura

A solução segue uma arquitetura **mobile-backend** com separação clara entre aplicativo mobile e backend:

- **Mobile (React Native):** Aplicativo nativo que consome a API REST do backend
- **Backend (NestJS + Prisma):** API REST que implementa lógica de negócio, processamento de imagens via IA e gerencia persistência
- **Banco de Dados (PostgreSQL):** Armazenamento persistente em ambiente gerenciado (DBaaS)
- **Storage (S3/Cloudinary):** Armazenamento de imagens das contas

A arquitetura foi projetada para **desenvolvimento local com Docker** e **deploy em produção com serviços gerenciados**, garantindo:
- Facilidade de desenvolvimento (ambiente consistente via Docker)
- Confiabilidade em produção (DBaaS e storage gerenciados)
- Escalabilidade (API stateless, storage externo, banco gerenciado)
- Performance mobile (cache local, otimização de imagens)

### Componentes Principais

#### Mobile App (React Native)
- **Telas/Screens:** Navegação entre funcionalidades (Login, Câmera, Divisão, Histórico)
- **State Management:** Zustand stores para estado global (auth, conta atual, participantes)
- **HTTP Client:** Axios configurado com interceptors para autenticação
- **Câmera:** Vision Camera para captura de fotos de alta qualidade
- **Persistência Local:** AsyncStorage para cache de dados (histórico, participantes recorrentes)
- **Navegação:** React Navigation para fluxo de telas

#### Backend (NestJS)
- **Controllers:** Endpoints REST que recebem requisições HTTP
- **Services:** Lógica de negócio e orquestração
- **OCR Service:** Integração com API de reconhecimento de texto (Google Vision / AWS Textract)
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
│            MOBILE APP (React Native + TypeScript)            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Screens    │  │    Zustand   │  │   Services   │      │
│  │  (Telas)     │  │   (State)    │  │    (API)     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │Vision Camera │  │ AsyncStorage │  │    Axios     │      │
│  │  (Foto)      │  │   (Cache)    │  │  (HTTP)      │      │
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
│  │ (Vision API) │  │   (Sharp)    │         │              │
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
```

## Estrutura de Implantação

### Ambiente de Desenvolvimento

#### Como os devs devem subir localmente:

**Backend + Banco (Docker):**
```bash
# Clonar repositório
git clone <repo-url>
cd divisor-conta

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

**Mobile App (React Native):**
```bash
# Instalar dependências
cd mobile
npm install

# Configurar variáveis de ambiente
cp .env.example .env
# Editar REACT_APP_API_URL com IP da máquina (não localhost!)

# iOS (apenas macOS)
cd ios && pod install && cd ..
npx react-native run-ios

# Android
npx react-native run-android

# Ou com Expo (se usar Expo)
npx expo start
```

**⚠️ IMPORTANTE para Android:** 
- Use o IP da sua máquina, não `localhost` (ex: `http://192.168.1.100:3000`)
- Configure permissões de câmera no `AndroidManifest.xml`
- Para emulador Android, pode usar `http://10.0.2.2:3000`

#### Docker/Compose disponível?
✅ Sim. `docker-compose.yml` na raiz orquestra:
- Serviço `api` (NestJS)
- Serviço `db` (PostgreSQL)
- Serviço `redis` (cache, opcional)

#### Variáveis de ambiente principais:

**Backend (`backend/.env`):**
```bash
DATABASE_URL="postgresql://postgres:senha@localhost:5432/divisor_dev"
NODE_ENV=development
PORT=3000
JWT_SECRET=seu-secret-aqui
JWT_REFRESH_SECRET=outro-secret-aqui
PASSWORD_PEPPER=pepper-para-senha

# OCR API (escolher uma)
GOOGLE_VISION_API_KEY=sua-key-aqui
# OU
AWS_TEXTRACT_REGION=us-east-1
AWS_TEXTRACT_ACCESS_KEY=key
AWS_TEXTRACT_SECRET_KEY=secret

# Storage de imagens
AWS_S3_BUCKET=divisor-contas-dev
AWS_S3_REGION=us-east-1
AWS_S3_ACCESS_KEY=key
AWS_S3_SECRET_KEY=secret
```

**Mobile (`mobile/.env`):**
```bash
REACT_APP_API_URL=http://192.168.1.100:3000
REACT_APP_ENV=development
```

**Docker Compose (`.env` na raiz):**
```bash
DB_USER=postgres
DB_PASSWORD=postgres123
DB_NAME=divisor_dev
DB_PORT=5432
```

### Ambiente de Produção

#### URL:
- Mobile App: Play Store (Google Play Console)
- Backend API: `https://api.divisor-conta.com` (a definir)

#### Estratégia de deploy:

**Mobile (Android):**
- Build via React Native CLI ou Expo EAS
- Gerar APK/AAB assinado
- Upload para Google Play Console (internal testing → closed testing → production)
- Versionamento semântico (1.0.0, 1.1.0, etc)

**Backend:**
- Deploy via AWS App Runner, ECS, ou Render
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
- Compressão automática via Lambda

#### Infraestrutura:
- **Mobile:** Google Play Store
- **Backend:** AWS App Runner ou Render
- **Banco de Dados:** AWS RDS PostgreSQL ou Supabase
- **Storage:** AWS S3 + CloudFront
- **OCR:** Google Cloud Vision API ou AWS Textract
- **Monitoramento:** Sentry (erros), Firebase Analytics (analytics)
- **DNS:** Cloudflare ou Route 53
- **SSL/TLS:** Certificados gerenciados pelo provedor

#### Ferramentas de observabilidade ativas:
- **Logs API:** CloudWatch (AWS) ou logs nativos do provedor
- **Logs Mobile:** Sentry para crash reports
- **Analytics:** Firebase Analytics para eventos de usuário
- **Monitoramento de API:** Sentry para erros de backend
- **Uptime monitoring:** UptimeRobot

### Diagrama de Implantação

#### Desenvolvimento (Local)
```
┌─────────────────────────────────────────┐
│         Máquina do Desenvolvedor        │
│  ┌──────────────────────────────────┐   │
│  │   Docker Compose                 │   │
│  │  ┌────────────┐  ┌────────────┐  │   │
│  │  │ Container  │  │ Container  │  │   │
│  │  │   API      │  │    DB      │  │   │
│  │  │  (NestJS)  │→ │(PostgreSQL)│  │   │
│  │  └────────────┘  └────────────┘  │   │
│  └──────────────────────────────────┘   │
│                                          │
│  ┌──────────────────────────────────┐   │
│  │  Emulador/Dispositivo Físico     │   │
│  │   (React Native App)             │   │
│  │   → Conecta via IP da máquina    │   │
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
│           Google Play Store / App Distribution             │
│            (React Native App - .apk/.aab)                  │
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

                              ┌────────────────────────────┐
                              │   Monitoramento            │
                              │                            │
                              │  • Sentry (erros)          │
                              │  • Firebase Analytics      │
                              │  • CloudWatch (logs)       │
                              └────────────────────────────┘
```

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
- **Dados no dispositivo:** AsyncStorage não é encriptado - usar react-native-encrypted-storage para dados sensíveis
- **Variáveis sensíveis:** Nunca commitadas, gerenciadas via .env

### Gestão de segredos:
- **Desenvolvimento:** Arquivo `.env` local (não versionado)
- **Produção Backend:** AWS Secrets Manager ou variáveis de ambiente do provedor
- **Produção Mobile:** Variáveis de build (EAS Secrets, Android build config)
- **API Keys (OCR):** Armazenadas no backend, nunca no app mobile

### Autenticação e autorização:
- **Método:** JWT (JSON Web Tokens) via Passport.js
- **Fluxo:**
  1. Login → Backend valida credenciais → Retorna access token + refresh token
  2. App armazena tokens em AsyncStorage/EncryptedStorage
  3. Requisições incluem token no header `Authorization: Bearer <token>`
  4. Backend valida token via `JwtGuard`
- **Refresh tokens:** Armazenados de forma segura no dispositivo
- **Logout:** Invalidação de tokens (blacklist ou rotação)
- **Biometria:** Opcional - login rápido via Face ID/Fingerprint (react-native-biometrics)

### Proteção de Imagens:
- **Upload:** Usuário envia imagem para backend, backend valida (tipo, tamanho) e envia para S3
- **URLs:** S3 gera URLs pré-assinadas com expiração de 1 hora
- **Processamento:** Imagens temporárias deletadas após OCR
- **Privacidade:** Cada conta pertence a um usuário, não é pública

### Outras Medidas:
- **Rate Limiting:** Implementado via `@nestjs/throttler` para prevenir abuso da API
- **Validação de Input:** class-validator em todos os DTOs (backend), Zod (mobile)
- **Sanitização:** Prisma previne SQL injection automaticamente
- **Headers de Segurança:** Helmet.js configurado no backend
- **Permissões Mobile:** 
  - Android: Camera permission declarada em `AndroidManifest.xml`
  - Permissões solicitadas em runtime
- **Ofuscação de Código:** ProGuard (Android) para dificultar engenharia reversa
- **SSL Pinning:** Considerar implementar para prevenir MITM attacks
- **Logs:** Não logar informações sensíveis (senhas, tokens, dados pessoais)

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

## Otimizações para Mobile

### Performance:
- **Imagens:** Compressão antes de upload (react-native-compressor)
- **Cache:** AsyncStorage para dados offline (participantes, histórico recente)
- **Lazy Loading:** Carregar histórico sob demanda (paginação)
- **Debounce:** Busca de participantes com debounce para evitar requests excessivos

### UX:
- **Loading States:** Feedback visual durante upload e OCR
- **Offline Mode:** App funciona offline para visualizar histórico
- **Error Handling:** Mensagens claras de erro (falha no OCR, sem conexão, etc)
- **Haptic Feedback:** Vibrações sutis em ações importantes

### Bateria:
- **Câmera:** Desligar quando não estiver em uso
- **Polling:** Evitar polling desnecessário na API
- **Background Tasks:** Minimizar processamento em background

## Considerações Adicionais

### Privacidade e LGPD:
- Usuários podem deletar histórico de contas
- Imagens podem ser deletadas do S3 após processamento (opcional)
- Política de privacidade clara no app
- Consentimento para uso de dados

### Escalabilidade:
- API stateless permite horizontal scaling
- S3 escala automaticamente
- Banco de dados pode ser escalado verticalmente ou com read replicas
- OCR API (Google Vision) tem limites de quota - monitorar uso

### Custos:
- **Google Vision API:** ~$1.50 por 1000 imagens
- **AWS S3:** Storage + requests (baixo custo)
- **RDS:** Instância t3.micro elegível para free tier (12 meses)
- **Monitorar:** Usage do Vision API para evitar custos excessivos

### Roadmap Técnico:
- **Fase 1:** MVP - Android com funcionalidades core
- **Fase 2:** Melhorias de UX e performance
- **Fase 3:** Versão iOS (mesmo código React Native)
- **Fase 4:** Features avançadas (split de pagamento, integração PIX)