# 📱 Divisor de Conta Inteligente

<!--
Aplicativo mobile para divisão inteligente de contas de bares, restaurantes e eventos usando IA.
-->

Aplicação mobile Android para organizar e dividir contas de forma justa e transparente. Tire uma foto da conta, deixe a IA reconhecer os itens, e divida cada produto entre as pessoas de forma personalizada. Adicione taxas, visualize o valor de cada um e mantenha histórico dos participantes.

**Status:** Em Desenvolvimento 🚧

---

## 📄 Documentação

A documentação completa do projeto pode ser acessada através deste **[link](https://intelijr.github.io/rateio-app/)**

> A documentação é mantida utilizando o [Docusaurus](https://docusaurus.io/). Para informações sobre como configurar e manter a documentação, consulte o [guia de configuração](./docs/README.md).

---

## 🚀 Tecnologias Utilizadas

### Mobile (Android)

<p align="center">
  <img src="https://reactnative.dev/img/header_logo.svg" width="120" alt="React Native Logo" />
</p>

- React Native 0.74+
- TypeScript
- React Navigation 6
- Zustand (State Management)
- React Hook Form + Zod
- Axios
- React Native Vision Camera
- React Native Paper (UI Components)
- AsyncStorage / MMKV (Persistência)

### Backend

<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>

- NestJS 11
- Prisma ORM 6
- PostgreSQL 16
- JWT Authentication
- Argon2 (Password Hashing)
- Google Cloud Vision API (OCR)
- Sharp (Image Processing)
- AWS S3 (Image Storage)
- Docker & Docker Compose

### Infraestrutura
- Docker (desenvolvimento)
- DBaaS - PostgreSQL (produção)
- AWS S3 + CloudFront (storage de imagens)
- Google Play Store (distribuição)

---

## 🛠️ Como Rodar o Projeto

### Pré-requisitos

- Node.js 20+
- Docker e Docker Compose
- npm ou yarn
- Android Studio (para emulador Android)
- JDK 17+ (para build Android)
- Conta Google Cloud (para Vision API)
- Conta AWS (para S3, opcional em dev)

---

## 🚀 Setup Inicial

### 1. Clone o Repositório

```bash
git clone https://github.com/seu-usuario/divisor-conta.git
cd divisor-conta
```

### 2. Configure o Backend

```bash
# Configure as variáveis de ambiente
cp .env.example .env
cp backend/.env.example backend/.env

# Edite backend/.env e adicione suas credenciais:
# - DATABASE_URL
# - JWT_SECRET
# - GOOGLE_VISION_API_KEY (ou AWS Textract)
# - AWS_S3_* (se usar S3)

# Inicie o backend + banco de dados com Docker
docker-compose up -d

# Aguarde os containers iniciarem (cerca de 10-15 segundos)
docker-compose logs -f api

# Execute as migrations do Prisma
docker-compose exec api npx prisma migrate deploy

# 🔐 Crie o primeiro usuário para testes
docker-compose exec api npx prisma db seed

# ✅ Credenciais padrão do usuário teste:
# Email: teste@example.com
# Senha: Teste@123456

# Acesse:
# - Backend API: http://localhost:3000
# - API Docs: http://localhost:3000/docs
# - Health Check: http://localhost:3000/health
```

### 3. Configure o Mobile App

```bash
# Acesse o diretório do mobile
cd mobile

# Instale as dependências
npm install

# Configure as variáveis de ambiente
cp .env.example .env

# ⚠️ IMPORTANTE: Edite o .env e coloque o IP DA SUA MÁQUINA
# NÃO use localhost! Use seu IP local (ex: 192.168.1.100)
# Para descobrir seu IP:
# - Windows: ipconfig
# - macOS/Linux: ifconfig ou ip addr
# 
# Exemplo no .env:
# REACT_APP_API_URL=http://192.168.1.100:3000
```

#### Para Android

```bash
# Certifique-se de que o Android Studio está instalado
# e que você configurou as variáveis de ambiente:
# - ANDROID_HOME
# - PATH incluindo platform-tools

# Inicie o emulador ou conecte um dispositivo físico
# Via Android Studio → AVD Manager → Start Emulator

# OU conecte um dispositivo físico via USB com USB Debugging habilitado

# Compile e rode o app
npx react-native run-android

# Se usar emulador Android, você pode usar 10.0.2.2 no lugar do IP:
# REACT_APP_API_URL=http://10.0.2.2:3000
```

#### Para iOS (Apenas macOS)

```bash
# Instale as dependências nativas
cd ios
pod install
cd ..

# Rode o app
npx react-native run-ios
```

---

## 🐳 Opção Alternativa: Rodar Backend Sem Docker

```bash
# Você precisará ter PostgreSQL instalado localmente

# Acesse o diretório do backend
cd backend

# Instale as dependências
npm install

# Configure o .env com a DATABASE_URL local
# Exemplo: DATABASE_URL="postgresql://postgres:senha@localhost:5432/divisor_dev"

# Gere o Prisma Client
npx prisma generate

# Execute as migrations
npx prisma migrate dev

# Crie o usuário de teste
npm run seed

# Inicie o servidor
npm run start:dev

# Backend rodando em: http://localhost:3000
```

---

## 🔐 Autenticação e Primeiro Acesso

### Criar Usuário de Teste

O seed cria automaticamente um usuário para desenvolvimento:

```bash
# Com Docker
docker-compose exec api npx prisma db seed

# Sem Docker
cd backend && npm run seed
```

**Credenciais padrão:**
- Email: `teste@example.com`
- Senha: `Teste@123456`

### Fazer Login no App

1. Inicie o app mobile
2. Tela de Login → Use as credenciais acima
3. Após login, você pode alterar seus dados no perfil

### Customizar Usuário de Teste

Edite o `.env` do backend antes de rodar o seed:

```env
SEED_USER_EMAIL=seu-email@exemplo.com
SEED_USER_PASSWORD=SuaSenhaAqui@123
SEED_USER_NAME=Seu Nome
```

---

## 🗂️ Estrutura de Diretórios

```bash
.
├── .github/                       # CI/CD e templates
│   └── workflows/
│       ├── deploy_api.yml
│       ├── deploy_docs.yml
│       └── android_build.yml
│
├── backend/                       # Código backend (NestJS)
│   ├── src/
│   │   ├── auth/                  # Autenticação (JWT, Guards)
│   │   ├── users/                 # Gestão de usuários
│   │   ├── bills/                 # Contas (fotos + OCR)
│   │   ├── bill-items/            # Itens reconhecidos
│   │   ├── participants/          # Pessoas que dividem
│   │   ├── divisions/             # Divisões dos itens
│   │   ├── fees/                  # Taxas (garçom/couvert)
│   │   ├── ocr/                   # Serviço de OCR (Vision API)
│   │   ├── storage/               # Upload S3
│   │   ├── prisma/                # Prisma Service
│   │   └── main.ts
│   ├── prisma/
│   │   ├── schema.prisma          # Schema do banco
│   │   ├── seed.ts                # Seed de usuário teste
│   │   └── migrations/
│   ├── test/                      # Testes E2E
│   ├── Dockerfile
│   └── package.json
│
├── mobile/                        # Código mobile (React Native)
│   ├── src/
│   │   ├── api/                   # Chamadas à API
│   │   ├── components/
│   │   │   ├── common/            # Componentes reutilizáveis
│   │   │   ├── camera/            # Componentes de câmera
│   │   │   └── division/          # Componentes de divisão
│   │   ├── hooks/                 # Custom hooks
│   │   ├── navigation/            # React Navigation
│   │   ├── screens/               # Telas do app
│   │   │   ├── Auth/              # Login, Registro
│   │   │   ├── Camera/            # Captura de foto
│   │   │   ├── BillReview/        # Revisão de itens OCR
│   │   │   ├── Division/          # Divisão de conta
│   │   │   ├── Summary/           # Resumo final
│   │   │   └── History/           # Histórico
│   │   ├── store/                 # Zustand stores
│   │   │   ├── authStore.ts
│   │   │   ├── billStore.ts
│   │   │   └── participantsStore.ts
│   │   ├── types/                 # TypeScript types
│   │   ├── utils/                 # Funções utilitárias
│   │   └── App.tsx
│   ├── android/                   # Código nativo Android
│   ├── ios/                       # Código nativo iOS
│   ├── .env.example
│   └── package.json
│
├── docs/                          # Documentação Docusaurus
│   ├── docs/
│   │   ├── visao-produto.md
│   │   ├── arquitetura.md
│   │   └── guia-usuario.md
│
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## 🔧 Comandos Úteis

### Prisma (Backend)

```bash
# Criar nova migration
npx prisma migrate dev --name nome_migration

# Aplicar migrations em produção
npx prisma migrate deploy

# Gerar Prisma Client
npx prisma generate

# Criar seed (usuário teste)
npx prisma db seed

# Abrir Prisma Studio (visualizar dados)
npx prisma studio

# Resetar banco (CUIDADO! Apaga tudo)
npx prisma migrate reset
```

### Docker

```bash
# Iniciar containers
docker-compose up -d

# Ver logs do backend
docker-compose logs -f api

# Ver logs do banco
docker-compose logs -f db

# Parar containers
docker-compose down

# Parar e remover volumes (CUIDADO! Apaga o banco)
docker-compose down -v

# Rebuild dos containers
docker-compose build --no-cache

# Executar comandos no container
docker-compose exec api <comando>

# Exemplos úteis:
docker-compose exec api npx prisma studio
docker-compose exec api npm run test
```

### React Native (Mobile)

```bash
# Desenvolvimento Android
npx react-native run-android

# Desenvolvimento iOS (apenas macOS)
npx react-native run-ios

# Limpar cache do Metro Bundler
npx react-native start --reset-cache

# Limpar build do Android
cd android && ./gradlew clean && cd ..

# Limpar build do iOS
cd ios && rm -rf build && pod install && cd ..

# Logs do dispositivo Android
adb logcat

# Logs do dispositivo iOS
npx react-native log-ios

# Gerar APK de release (Android)
cd android
./gradlew assembleRelease
# APK em: android/app/build/outputs/apk/release/app-release.apk
```

### Backend

```bash
# Desenvolvimento
npm run start:dev

# Produção
npm run build
npm run start:prod

# Testes
npm run test
npm run test:e2e
npm run test:cov

# Lint
npm run lint
```

---

## 📊 Fluxo do App

### 1️⃣ Login/Registro
```
Usuário → Tela Login → Insere credenciais → Backend valida → Token JWT → Tela Principal
```

### 2️⃣ Captura de Conta
```
Tela Principal → Botão "Nova Conta" → Abre Câmera
                                           │
                                           ▼
                                    Tira foto da conta
                                           │
                                           ▼
                                    Preview da foto
                                           │
                                ┌──────────┴──────────┐
                                │ Aprovar? │ Reprovar?│
                                └──────────┬──────────┘
                                           │ Aprovar
                                           ▼
                                    Upload para API
```

### 3️⃣ Reconhecimento OCR
```
API recebe imagem → Valida → Upload S3 → Google Vision API
                                              │
                                              ▼
                                       Retorna texto OCR
                                              │
                                              ▼
                                       Backend processa
                                       - Extrai itens
                                       - Extrai valores
                                       - Identifica total
                                              │
                                              ▼
                                       Salva no banco
                                              │
                                              ▼
                                       Retorna para App
```

### 4️⃣ Revisão e Divisão
```
App exibe itens reconhecidos
         │
         ├─→ Usuário pode editar itens/valores
         │
         ▼
Usuário adiciona participantes
         │
         ├─→ Pode buscar no histórico
         ├─→ Ou adicionar novos
         │
         ▼
Usuário atribui itens às pessoas
         │
         ├─→ Cada item pode ter 1+ pessoas
         │
         ▼
Usuário adiciona taxas opcionais
         │
         ├─→ Garçom (% ou fixo)
         ├─→ Couvert (fixo)
         │
         ▼
App calcula divisão (preview local)
         │
         ▼
Usuário confirma → Salva no backend
                         │
                         ▼
                  Tela de Resumo
                  - Valor por pessoa
                  - Itens de cada um
                  - Total geral
```

### 5️⃣ Histórico
```
Usuário pode visualizar contas passadas
         │
         ├─→ Ver detalhes da divisão
         ├─→ Ver participantes
         └─→ Excluir conta
```

---

## 🚀 Deploy em Produção

### 🗄️ Banco de Dados

Recomendamos usar **DBaaS** para facilitar gestão, backups e escalabilidade:

**Opções:**
- AWS RDS PostgreSQL
- Supabase
- Render PostgreSQL
- Railway
- Neon

**Configuração:**
Basta alterar a `DATABASE_URL` no `.env` de produção:

```bash
DATABASE_URL="postgresql://user:senha@seu-db.provider.com:5432/divisor_prod?sslmode=require"
```

### 🖥️ Backend (API)

**Opções de deploy:**
- AWS App Runner (Docker)
- AWS ECS Fargate
- Render
- Railway
- Google Cloud Run

**Passos:**

1. Configure variáveis de ambiente no serviço:
   ```env
   DATABASE_URL=postgresql://...
   NODE_ENV=production
   JWT_SECRET=seu-secret-seguro
   JWT_REFRESH_SECRET=outro-secret
   PASSWORD_PEPPER=pepper-seguro
   GOOGLE_VISION_API_KEY=sua-key
   AWS_S3_BUCKET=seu-bucket
   AWS_S3_REGION=us-east-1
   AWS_S3_ACCESS_KEY=key
   AWS_S3_SECRET_KEY=secret
   ```

2. Build da imagem Docker:
   ```bash
   docker build -t divisor-api:latest --target production ./backend
   ```

3. Execute migrations antes do deploy:
   ```bash
   npx prisma migrate deploy
   ```

4. Configure health check: `GET /health`

### 📱 Mobile App (Android)

**Build e Distribuição:**

1. **Incremente a versão:**
   ```bash
   # android/app/build.gradle
   versionCode 2  # incrementar
   versionName "1.1.0"  # formato semântico
   ```

2. **Gere APK/AAB assinado:**
   ```bash
   cd android
   ./gradlew bundleRelease  # para AAB (Play Store)
   # OU
   ./gradlew assembleRelease  # para APK
   ```

3. **Configure signing:**
   - Gere keystore: `keytool -genkey -v -keystore divisor.keystore -alias divisor -keyalg RSA -keysize 2048 -validity 10000`
   - Configure em `android/gradle.properties` e `android/app/build.gradle`

4. **Upload para Play Store:**
   - Acesse Google Play Console
   - Crie novo app ou nova versão
   - Upload do AAB
   - Preencha release notes
   - Teste internamente → Teste fechado → Produção

**⚠️ Importante:**
- Configure as variáveis de build com a URL da API de produção
- Teste em dispositivos reais antes do release
- Implemente versionamento de API (ex: `/v1/`)

### 🖼️ Storage de Imagens (AWS S3)

1. Crie bucket S3
2. Configure CORS policy:
   ```json
   [
     {
       "AllowedHeaders": ["*"],
       "AllowedMethods": ["GET", "PUT", "POST"],
       "AllowedOrigins": ["https://sua-api.com"],
       "ExposeHeaders": []
     }
   ]
   ```
3. Configure lifecycle policy (deletar imagens antigas):
   - Transition to Glacier após 90 dias
   - Delete após 180 dias
4. Configure CloudFront para CDN (opcional, melhora performance)

---

## 🔒 Segurança e Boas Práticas

### 🔐 Senhas e Tokens
- ✅ Senhas com hash Argon2
- ✅ JWT com expiração curta (15min access, 7 dias refresh)
- ✅ Tokens armazenados em AsyncStorage/EncryptedStorage
- ✅ Logout limpa tokens do dispositivo

### 🖼️ Imagens
- ✅ Validação de tipo e tamanho no backend
- ✅ Compressão antes de upload
- ✅ URLs pré-assinadas do S3 (expiram em 1h)
- ✅ Imagens temporárias deletadas após OCR

### 🌐 API
- ✅ Rate limiting (100 requests/min por IP)
- ✅ HTTPS obrigatório em produção
- ✅ CORS configurado
- ✅ Helmet.js para headers de segurança
- ✅ Validação de todos os inputs

### 📱 Mobile
- ✅ Não armazenar dados sensíveis em plain text
- ✅ Usar HTTPS para todas as chamadas
- ✅ Validar inputs localmente (Zod)
- ✅ Solicitar permissões apenas quando necessário
- ✅ Ofuscar código (ProGuard em produção)

### 🔍 Monitoramento
- ✅ Sentry para crash reports (mobile + API)
- ✅ Firebase Analytics para eventos
- ✅ CloudWatch para logs da API
- ✅ Alertas de erro crítico

---

## 🆘 Solução de Problemas

### ❌ Erro "Unable to connect to server"

**Causa:** IP errado ou backend não está rodando

**Solução:**
```bash
# Verifique se o backend está rodando
docker-compose ps
# OU
curl http://localhost:3000/health

# Verifique o IP no .env do mobile
# Use o IP da sua máquina, NÃO localhost
# Windows: ipconfig
# macOS/Linux: ifconfig

# Para emulador Android: use 10.0.2.2:3000
```

### ❌ Erro ao tirar foto (Permission Denied)

**Causa:** Permissões de câmera não configuradas

**Solução:**
```bash
# Verifique android/app/src/main/AndroidManifest.xml
<uses-permission android:name="android.permission.CAMERA" />

# Reinstale o app
npx react-native run-android
```

### ❌ OCR não reconhece itens

**Causa:** Foto de baixa qualidade ou API key inválida

**Solução:**
- Tire foto em boa iluminação
- Evite reflexos e sombras
- Verifique se `GOOGLE_VISION_API_KEY` está correta
- Verifique logs do backend: `docker-compose logs -f api`

### ❌ Erro ao fazer upload de imagem

**Causa:** AWS S3 não configurado ou credenciais inválidas

**Solução:**
```bash
# Verifique variáveis no backend/.env
AWS_S3_BUCKET=seu-bucket
AWS_S3_ACCESS_KEY=key
AWS_S3_SECRET_KEY=secret

# Teste credenciais AWS CLI
aws s3 ls s3://seu-bucket
```

### ❌ Build Android falha

**Causa:** ANDROID_HOME não configurado ou Gradle cache corrompido

**Solução:**
```bash
# Configure ANDROID_HOME
export ANDROID_HOME=$HOME/Library/Android/sdk  # macOS
# OU
export ANDROID_HOME=$HOME/Android/Sdk  # Linux

# Limpe cache do Gradle
cd android
./gradlew clean
./gradlew --stop
rm -rf .gradle
cd ..

# Reinstale
npx react-native run-android
```

---

## 👥 Time do Projeto

Conheça quem participou do desenvolvimento deste projeto:

- **Isabelly Maia** _Scrum Master_  
  [![GitHub](https://img.shields.io/badge/GitHub-100000?style=for-the-badge&logo=github&logoColor=white)](https://github.com/isabellymaiia)
  [![LinkedIn](https://img.shields.io/badge/LinkedIn-blue?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/isabellymaia/)

- **Karine Paixão**  
  [![GitHub](https://img.shields.io/badge/GitHub-100000?style=for-the-badge&logo=github&logoColor=white)](https://github.com/karinevicr)
  [![LinkedIn](https://img.shields.io/badge/LinkedIn-blue?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/karine-victoria/)

- **Raphael Silva**  
  [![GitHub](https://img.shields.io/badge/GitHub-100000?style=for-the-badge&logo=github&logoColor=white)](https://github.com/RaphaelSilva09)
  [![LinkedIn](https://img.shields.io/badge/LinkedIn-blue?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/raphaelfelipesilva/)

---

## 📝 Licença

Este projeto é proprietário e confidencial. Todos os direitos reservados.

---

**Desenvolvido com ❤️ pela Inteli Junior**