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
  <img src="https://reactnative.dev/img/header_logo.svg" alt="React Native Logo" width="120" />
</p>

- **Expo SDK 52+** (Managed Workflow)
- **React Native 0.76+**
- TypeScript
- React Navigation 6
- Zustand (State Management)
- React Hook Form + Zod
- Axios
- Expo Camera
- Expo Image Picker
- Expo SecureStore (Persistência Segura)
- React Native Paper (UI Components)
- **Expo Application Services (EAS)** - Build & Deploy

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
- OpenAI API (GPT-4o) para OCR
- Sharp (Image Processing)
- AWS S3 (Image Storage)
- Docker & Docker Compose

### Infraestrutura
- Docker (desenvolvimento backend)
- DBaaS - PostgreSQL (produção)
- AWS S3 + CloudFront (storage de imagens)
- **Expo Application Services (EAS)** - Build & Deploy
- Google Play Store (distribuição)

---

## 🛠️ Como Rodar o Projeto

### Pré-requisitos

- Node.js 20+
- Docker e Docker Compose (para backend)
- npm ou yarn
- **Expo CLI** (`npm install -g expo-cli`)
- Conta Expo (criar em [expo.dev](https://expo.dev))
- Android Studio (para emulador Android, opcional)
- Conta OpenAI (para API com GPT-4o)
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
# - OPENAI_API_KEY
# - OPENAI_MODEL
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
# Email: admin@rateio.com
# Senha: Admin@123456

# Acesse:
# - Backend API: http://localhost:3000
# - API Docs: http://localhost:3000/docs
# - Health Check: http://localhost:3000/health
```

### 3. Configure o Mobile App (Expo)

```bash
# Acesse o diretório do mobile
cd mobile

# Instale as dependências
npm install

# Configure as variáveis de ambiente
cp .env.example .env

# ⚠️ IMPORTANTE: Edite o .env e configure a URL da API
# Para desenvolvimento local:
# - Use o IP da sua máquina (não localhost!)
# - Para descobrir seu IP:
#   • Windows: ipconfig
#   • macOS/Linux: ifconfig ou ip addr
# 
# Exemplo no .env:
# EXPO_PUBLIC_API_URL=http://192.168.1.100:3000
```

### 4. Rodar o App com Expo

```bash
# Iniciar o Expo Dev Server
npx expo start

# Você verá um QR Code no terminal

# Opções para rodar:
# 1. Pressione 'a' para abrir no emulador Android
# 2. Pressione 'i' para abrir no simulador iOS (apenas macOS)
# 3. Escaneie o QR Code com o app Expo Go no seu celular

# Para rodar diretamente no emulador Android:
npx expo run:android

# Para rodar diretamente no simulador iOS (apenas macOS):
npx expo run:ios
```

#### 📱 Usando Expo Go (Recomendado para Desenvolvimento)

1. **Instale o Expo Go** no seu celular:
   - Android: [Google Play Store](https://play.google.com/store/apps/details?id=host.exp.exponent)
   - iOS: [App Store](https://apps.apple.com/app/expo-go/id982107779)

2. **Escaneie o QR Code:**
   - Android: Use o app Expo Go para escanear
   - iOS: Use a câmera nativa do iPhone

3. **App abrirá automaticamente** no seu dispositivo

**Vantagens do Expo Go:**
- ✅ Não precisa de emulador
- ✅ Teste em dispositivo real
- ✅ Hot reload instantâneo
- ✅ Múltiplos dispositivos simultaneamente

---

## 🐳 Opção Alternativa: Rodar Backend Sem Docker

```bash
# Você precisará ter PostgreSQL instalado localmente

# Acesse o diretório do backend
cd backend

# Instale as dependências
npm install

# Configure o .env com a DATABASE_URL local
# Exemplo: DATABASE_URL="postgresql://postgres:senha@localhost:5432/rateio_dev"

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

O seed cria automaticamente um usuário admin para desenvolvimento:

```bash
# Com Docker
docker-compose exec api npx prisma db seed

# Sem Docker
cd backend && npm run seed
```

**Credenciais padrão:**
- Email: `admin@rateio.com`
- Senha: `Admin@123456`

### Fazer Login no App

1. Inicie o app mobile com `npx expo start`
2. Abra no Expo Go ou emulador
3. Tela de Login → Use as credenciais acima
4. Após login, você pode alterar seus dados no perfil

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
│       └── eas_build.yml         # ✨ Build via EAS
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
│   │   ├── ocr/                   # Serviço de OCR (OpenAI GPT-4o)
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
├── mobile/                        # Código mobile (Expo)
│   ├── app/                       # ✨ Expo Router (file-based routing)
│   │   ├── (auth)/
│   │   │   ├── login.tsx
│   │   │   └── register.tsx
│   │   ├── (tabs)/
│   │   │   ├── index.tsx          # Home
│   │   │   ├── history.tsx
│   │   │   └── profile.tsx
│   │   ├── camera.tsx
│   │   ├── bill/[id].tsx
│   │   ├── division/[id].tsx
│   │   └── _layout.tsx
│   ├── components/
│   │   ├── common/                # Componentes reutilizáveis
│   │   ├── camera/                # Componentes de câmera
│   │   └── division/              # Componentes de divisão
│   ├── hooks/                     # Custom hooks
│   ├── services/                  # API calls
│   ├── store/                     # Zustand stores
│   │   ├── authStore.ts
│   │   ├── billStore.ts
│   │   └── participantsStore.ts
│   ├── types/                     # TypeScript types
│   ├── utils/                     # Funções utilitárias
│   ├── app.json                   # ✨ Configuração Expo
│   ├── eas.json                   # ✨ Configuração EAS Build
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

### Docker (Backend)

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

### Expo (Mobile)

```bash
# Iniciar dev server
npx expo start

# Limpar cache
npx expo start --clear

# Rodar no Android
npx expo run:android

# Rodar no iOS (apenas macOS)
npx expo run:ios

# Build de desenvolvimento
eas build --profile development --platform android

# Build de preview (para testar localmente)
eas build --profile preview --platform android

# Build de produção
eas build --profile production --platform android

# Submit para Play Store
eas submit --platform android

# Ver builds
eas build:list

# Atualizar app via OTA (sem rebuild)
eas update --branch production
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
Tela Principal → Botão "Nova Conta" → Abre Câmera (Expo Camera)
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
API recebe imagem → Valida → Upload S3 → OpenAI API (GPT-4o)
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
         ├─→ Couvert artístico (fixo)
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
DATABASE_URL="postgresql://user:senha@seu-db.provider.com:5432/rateio_prod?sslmode=require"
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
   OPENAI_API_KEY=sua-key
   OPENAI_MODEL=gpt-4o-mini
   AWS_S3_BUCKET=seu-bucket
   AWS_S3_REGION=us-east-1
   AWS_S3_ACCESS_KEY=key
   AWS_S3_SECRET_KEY=secret
   ```

2. Build da imagem Docker:
   ```bash
   docker build -t rateio-api:latest --target production ./backend
   ```

3. Execute migrations antes do deploy:
   ```bash
   npx prisma migrate deploy
   ```

4. Configure health check: `GET /health`

### 📱 Mobile App (Android via EAS)

**Configuração Inicial do EAS:**

1. **Login no Expo:**
   ```bash
   npx expo login
   ```

2. **Configure o projeto:**
   ```bash
   cd mobile
   eas build:configure
   ```

3. **Edite `eas.json`:**
   ```json
   {
     "build": {
       "development": {
         "developmentClient": true,
         "distribution": "internal",
         "android": {
           "buildType": "apk"
         }
       },
       "preview": {
         "distribution": "internal",
         "android": {
           "buildType": "apk"
         }
       },
       "production": {
         "android": {
           "buildType": "aab"
         }
       }
     },
     "submit": {
       "production": {
         "android": {
           "serviceAccountKeyPath": "./google-service-account.json"
         }
       }
     }
   }
   ```

**Build e Distribuição:**

1. **Build de produção (AAB para Play Store):**
   ```bash
   eas build --platform android --profile production
   ```

2. **Download do build:**
   ```bash
   # O EAS gerará um link para download
   # Ou use:
   eas build:download --platform android
   ```

3. **Submit para Google Play:**
   ```bash
   # Primeiro, configure Service Account no Google Play Console
   # Depois:
   eas submit --platform android --latest
   ```

**⚠️ Importante:**
- Configure secrets no EAS: `eas secret:create`
- Variáveis de produção devem estar no `eas.json` ou como secrets
- Incremente `version` e `versionCode` no `app.json` a cada release
- Teste builds localmente primeiro: `eas build --profile preview --platform android --local`

**Atualizações OTA (Over-The-Air):**

```bash
# Publicar atualização sem rebuild (apenas JS/assets)
eas update --branch production --message "Correção de bugs"

# Usuários recebem atualização automaticamente
```

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
- ✅ Tokens armazenados em **Expo SecureStore** (criptografado)
- ✅ Logout limpa tokens do dispositivo

### 🖼️ Imagens
- ✅ Validação de tipo e tamanho no backend
- ✅ Compressão com Expo ImageManipulator antes de upload
- ✅ URLs pré-assinadas do S3 (expiram em 1h)
- ✅ Imagens temporárias deletadas após OCR

### 🌐 API
- ✅ Rate limiting (100 requests/min por IP)
- ✅ HTTPS obrigatório em produção
- ✅ CORS configurado
- ✅ Helmet.js para headers de segurança
- ✅ Validação de todos os inputs

### 📱 Mobile (Expo)
- ✅ **Expo SecureStore** para dados sensíveis
- ✅ Usar HTTPS para todas as chamadas
- ✅ Validar inputs localmente (Zod)
- ✅ Solicitar permissões apenas quando necessário
- ✅ **EAS Build** gera APKs otimizados e seguros

### 🔍 Monitoramento
- ✅ Sentry para crash reports (mobile + API)
- ✅ Expo Analytics integrado
- ✅ CloudWatch para logs da API
- ✅ Alertas de erro crítico

---

## 🆘 Solução de Problemas

### ❌ Erro "Unable to connect to server"

**Causa:** URL da API incorreta ou backend não está rodando

**Solução:**
```bash
# Verifique se o backend está rodando
docker-compose ps
# OU
curl http://localhost:3000/health

# Verifique o .env do mobile
# Use EXPO_PUBLIC_API_URL (não REACT_APP_API_URL)
# Use o IP da sua máquina, NÃO localhost
# Windows: ipconfig
# macOS/Linux: ifconfig

# Exemplo correto:
# EXPO_PUBLIC_API_URL=http://192.168.1.100:3000
```

### ❌ Erro ao tirar foto (Permission Denied)

**Causa:** Permissões de câmera não concedidas

**Solução:**
```bash
# Com Expo, as permissões são gerenciadas automaticamente
# Certifique-se de solicitar permissão antes de usar:

import { Camera } from 'expo-camera';

const [permission, requestPermission] = Camera.useCameraPermissions();

if (!permission?.granted) {
  await requestPermission();
}

# No app.json, configure:
{
  "expo": {
    "plugins": [
      [
        "expo-camera",
        {
          "cameraPermission": "Permitir acesso à câmera para fotografar contas"
        }
      ]
    ]
  }
}
```

### ❌ OCR não reconhece itens

**Causa:** Foto de baixa qualidade ou API key inválida

**Solução:**
- Tire foto em boa iluminação
- Evite reflexos e sombras
- Use Expo ImageManipulator para melhorar qualidade
- Verifique se `OPENAI_API_KEY` e `OPENAI_MODEL` estão corretas
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

### ❌ Build EAS falha

**Causa:** Credenciais não configuradas ou erro no `eas.json`

**Solução:**
```bash
# Verifique login
eas whoami

# Re-configure EAS
eas build:configure

# Limpe cache
eas build --clear-cache

# Build local para debug
eas build --profile development --platform android --local
```

---

## 👥 Time do Projeto

Conheça quem participou do desenvolvimento deste projeto:

- **Usuário 1** _Scrum Master_  
  [![GitHub](https://img.shields.io/badge/GitHub-100000?style=for-the-badge&logo=github&logoColor=white)](https://github.com/usuario)
  [![LinkedIn](https://img.shields.io/badge/LinkedIn-blue?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/usuario/)

- **Usuário 2**  
  [![GitHub](https://img.shields.io/badge/GitHub-100000?style=for-the-badge&logo=github&logoColor=white)](https://github.com/usuario)
  [![LinkedIn](https://img.shields.io/badge/LinkedIn-blue?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/usuario/)

- **Usuário 3**  
  [![GitHub](https://img.shields.io/badge/GitHub-100000?style=for-the-badge&logo=github&logoColor=white)](https://github.com/usuario)
  [![LinkedIn](https://img.shields.io/badge/LinkedIn-blue?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/usuario/)

---

## 📝 Licença

Este projeto é proprietário e confidencial. Todos os direitos reservados.

---

**Desenvolvido com ❤️ pela Inteli Junior**
