# Plano de implementação: login com Google no Rateio

## Objetivo

Implementar login com Google no `rateio-app` sem substituir o fluxo atual de email/senha. O backend continua sendo a fonte de verdade da sessão: o app autentica com o Google, envia o token ao backend, e o backend valida esse token e emite os mesmos `accessToken` e `refreshToken` JWT já usados hoje.

## Estado atual do projeto

- Backend em NestJS com autenticação própria por JWT em `backend/src/auth`.
- Usuários persistidos com Prisma em `backend/prisma/schema.prisma`.
- `User.password` é obrigatório hoje, o que impede usuários "Google-only".
- Frontend em Expo + Expo Router.
- Sessão do app centralizada em `frontend/store/authStore.ts`.
- Tela de login em `frontend/app/(auth)/login.tsx`.
- Serviço de autenticação em `frontend/services/auth.service.ts`.

## Abordagem recomendada

Usar o fluxo abaixo:

1. O app Expo abre a autenticação Google com `expo-auth-session`.
2. O Google devolve um `idToken` ao app.
3. O app envia esse `idToken` para um novo endpoint `POST /auth/google`.
4. O backend valida o token com o Google.
5. O backend localiza ou cria o usuário.
6. O backend emite os JWTs próprios do Rateio.
7. O frontend salva os tokens exatamente como já faz no login por email/senha.

Essa abordagem reaproveita quase todo o fluxo atual de sessão e evita expor lógica de autorização do app diretamente ao Google após o login inicial.

## Regras de negócio recomendadas

Definir antes de codar:

- O login Google não deve remover o login por email/senha.
- Um usuário criado via Google pode existir sem senha local.
- Não fazer vínculo automático com conta local existente só porque o email coincide.
  Isso evita takeover de conta caso haja inconsistência de verificação fora do app.
- Para a primeira versão:
  - se `googleId` já existir, autentica;
  - se não existir e o email não estiver cadastrado, cria a conta;
  - se não existir e o email já estiver em uma conta local, retornar conflito com mensagem orientando vínculo manual em uma segunda etapa.
- `forgot-password` e `reset-password` devem continuar valendo apenas para contas com senha local.

## Passo a passo de implementação

### 1. Preparar credenciais Google

- Criar o projeto OAuth no Google Cloud Console.
- Criar pelo menos um client OAuth Web e um client OAuth Android.
- Se o app também for rodar em iOS, definir `ios.bundleIdentifier` em `frontend/app.json` e criar o client OAuth iOS.
- Registrar os redirect URIs necessários para Expo/AuthSession.
- Guardar os client IDs por plataforma.
- No Android, usar o package já existente em `frontend/app.json`: `com.ijteste.rateio`.
- Levantar o SHA-1/SHA-256 usado pelo build do app para o client Android.

### 2. Ajustar dependências

Backend:

- Adicionar `google-auth-library` em `backend/package.json`.

Frontend:

- Adicionar `expo-auth-session` em `frontend/package.json`.
- Manter `expo-web-browser`, que já existe e será usado no fluxo.

### 3. Preparar variáveis de ambiente

Backend:

- Atualizar `backend/.env.example` com algo como:
  - `GOOGLE_OAUTH_CLIENT_IDS="web-client-id,android-client-id,ios-client-id"`
- O backend deve aceitar uma lista de audiences válidas porque cada plataforma pode emitir token com client ID diferente.

Frontend:

- Atualizar `frontend/.env.example` com:
  - `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=`
  - `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=`
  - `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=`

### 4. Evoluir o modelo de usuário no Prisma

Arquivo principal:

- `backend/prisma/schema.prisma`

Mudanças recomendadas no `model User`:

- Tornar `password` opcional: `String?`
- Adicionar `googleId String? @unique`
- Opcional, mas útil:
  - `googleAvatarUrl String?`
  - `emailVerifiedAt DateTime?`

Motivo:

- Permitir três estados sem refatoração grande:
  - conta local: `password` preenchida, `googleId` nulo;
  - conta Google-only: `password` nulo, `googleId` preenchido;
  - conta vinculada no futuro: ambos preenchidos.

Depois disso:

- Gerar migration Prisma.
- Revisar seed para garantir que admins locais continuam funcionando.

### 5. Ajustar serviços de usuário para contas sem senha

Arquivo principal:

- `backend/src/users/users.service.ts`

Alterações necessárias:

- Fazer `validatePassword` retornar `false` quando `user.password` for nulo, sem quebrar.
- Permitir criação de usuário sem senha em um novo método específico, por exemplo:
  - `createGoogleUser(...)`
- Não reaproveitar `create(...)` do jeito atual sem adaptação, porque hoje ele sempre exige senha.
- Se optar por permitir vínculo futuro, criar também método para anexar `googleId` a um usuário já existente.

### 6. Implementar validação do token Google no backend

Arquivos sugeridos:

- `backend/src/auth/dto/google-login.dto.ts`
- `backend/src/auth/google-token.service.ts`

Responsabilidades:

- DTO com `idToken: string`.
- Serviço que usa `google-auth-library` para:
  - validar assinatura do token;
  - validar `aud`;
  - validar expiração;
  - garantir `email_verified === true`.

Dados mínimos esperados do payload:

- `sub` como identificador único do Google.
- `email`
- `name`
- `picture`
- `email_verified`

### 7. Criar endpoint de autenticação Google

Arquivos principais:

- `backend/src/auth/auth.controller.ts`
- `backend/src/auth/auth.service.ts`
- `backend/src/auth/auth.module.ts`

Adicionar:

- `POST /auth/google`

Fluxo recomendado em `AuthService`:

1. Receber `idToken`.
2. Validar token via `GoogleTokenService`.
3. Procurar usuário por `googleId`.
4. Se encontrar:
   - validar `isActive`;
   - emitir JWTs do Rateio.
5. Se não encontrar, procurar por email.
6. Se não houver usuário com esse email:
   - criar novo usuário ativo com `googleId`, `email`, `name`, `avatarUrl`;
   - emitir JWTs.
7. Se houver usuário local com esse email e sem `googleId`:
   - retornar `409 Conflict` com mensagem clara:
     `Já existe uma conta com este email. Faça login com senha para vincular sua conta Google.`

Importante:

- O método `generateTokens(...)` já existente pode ser reaproveitado.
- `JwtStrategy` e `JwtAuthGuard` podem permanecer como estão.

### 8. Revisar fluxos existentes de autenticação

Arquivos principais:

- `backend/src/auth/auth.service.ts`
- `backend/src/auth/auth.controller.ts`

Ajustes necessários:

- `login(email, password)` deve lidar corretamente com usuários sem senha local.
  Retorno recomendado: mesma resposta genérica de credenciais inválidas.
- `forgotPassword(email)` pode continuar retornando mensagem genérica, mas internamente deve ignorar contas sem senha.
- `resetPassword(...)` deve continuar funcionando apenas para usuários que possuem senha local ou para contas que já passaram por um fluxo explícito de definição de senha.

### 9. Cobrir testes no backend

Arquivos a atualizar ou adicionar:

- `backend/src/auth/auth.service.spec.ts`
- `backend/src/auth/auth.controller.spec.ts`
- eventualmente novos testes unitários para `GoogleTokenService`

Cenários mínimos:

- login Google com token válido e usuário já existente;
- login Google com token válido e criação de novo usuário;
- bloqueio quando email já pertence a conta local;
- rejeição de token inválido;
- rejeição de token com `email_verified = false`;
- rejeição para usuário inativo;
- `validatePassword` não quebrando para `password = null`.

### 10. Atualizar tipos e serviços no frontend

Arquivos principais:

- `frontend/types/auth.types.ts`
- `frontend/services/auth.service.ts`
- `frontend/store/authStore.ts`

Mudanças sugeridas:

- Criar tipo para requisição do login Google:
  - `GoogleLoginRequest { idToken: string }`
- Reaproveitar `LoginResponse`, porque a resposta do backend deve ser igual ao login comum.
- Em `auth.service.ts`, adicionar `loginWithGoogle(data)`.
- Em `authStore.ts`, adicionar uma action `loginWithGoogle()`.

Fluxo da store:

1. Limpar cache e dados locais como já é feito no login normal.
2. Chamar o serviço de autenticação Google.
3. Persistir `accessToken` e `refreshToken` em `storageService`.
4. Atualizar `user`, `isAuthenticated` e `isLoading`.

### 11. Implementar o fluxo Google no app Expo

Arquivos principais:

- `frontend/app/(auth)/login.tsx`
- opcionalmente `frontend/app/(auth)/register.tsx`
- opcionalmente um novo helper, por exemplo:
  - `frontend/services/google-auth.service.ts`

Implementação recomendada:

- Usar `expo-auth-session/providers/google`.
- Chamar `WebBrowser.maybeCompleteAuthSession()` no bootstrap apropriado.
- Configurar os client IDs por plataforma a partir das variáveis `EXPO_PUBLIC_*`.
- Ao sucesso do Google:
  - extrair `idToken`;
  - enviar para `authStore.loginWithGoogle()`;
  - redirecionar para `/(tabs)/bills`.

Estados de UI necessários:

- loading específico do botão Google;
- tratamento de cancelamento pelo usuário;
- exibição de erro vindo do backend, principalmente conflito com conta local existente.

### 12. Adicionar botão de login com Google nas telas

Arquivos principais:

- `frontend/app/(auth)/login.tsx`
- opcionalmente `frontend/app/(auth)/register.tsx`

Alterações de interface:

- Inserir botão secundário "Entrar com Google".
- Manter botão de email/senha atual.
- Separar visualmente os dois métodos com um divisor "ou".
- Desabilitar ações enquanto o fluxo Google estiver em andamento.

Comportamento esperado:

- Login com email/senha continua intacto.
- Login Google autentica e cai no mesmo pós-login do fluxo atual.
- Cadastro com Google pode reutilizar a mesma tela de login; não precisa de tela separada na primeira versão.

### 13. Revisar configuração de navegação e deep link

Arquivos principais:

- `frontend/app.json`
- `frontend/app/_layout.tsx`

Pontos de atenção:

- O `scheme: "rateio"` já existe, o que ajuda no retorno do AuthSession.
- Validar se o redirect gerado pelo Expo está batendo com o cadastrado no Google Cloud.
- Se houver suporte web, revisar também o comportamento no navegador e as URLs públicas.

### 14. Validar a integração ponta a ponta

Checklist funcional:

- Login por email/senha continua funcionando.
- Registro por email/senha continua funcionando.
- Login Google cria usuário novo quando necessário.
- Login Google funciona em conta Google já criada.
- Conta local com mesmo email não é vinculada automaticamente.
- Logout continua limpando tokens corretamente.
- Refresh token continua funcionando após login Google.
- `GET /auth/me` continua retornando o usuário autenticado.

Checklist técnico:

- Migration aplicada com sucesso.
- Prisma Client regenerado.
- Backend sobe sem erro com e sem as variáveis Google preenchidas.
- App Expo compila em dev e build.
- Fluxo testado em Android real, porque OAuth móvel costuma falhar por configuração de SHA/redirect.

## Arquivos que certamente devem mudar

Backend:

- `backend/package.json`
- `backend/.env.example`
- `backend/prisma/schema.prisma`
- `backend/src/auth/auth.controller.ts`
- `backend/src/auth/auth.service.ts`
- `backend/src/auth/auth.module.ts`
- `backend/src/users/users.service.ts`

Novos arquivos prováveis no backend:

- `backend/src/auth/dto/google-login.dto.ts`
- `backend/src/auth/google-token.service.ts`

Frontend:

- `frontend/package.json`
- `frontend/.env.example`
- `frontend/app/(auth)/login.tsx`
- `frontend/services/auth.service.ts`
- `frontend/store/authStore.ts`
- `frontend/types/auth.types.ts`

Novos arquivos prováveis no frontend:

- `frontend/services/google-auth.service.ts`

## Ordem recomendada de execução

1. Configurar credenciais Google e variáveis de ambiente.
2. Ajustar Prisma e aplicar migration.
3. Implementar validação do token Google no backend.
4. Expor `POST /auth/google` e cobrir testes backend.
5. Implementar `loginWithGoogle` no frontend.
6. Adicionar botão e fluxo de UI na tela de login.
7. Testar Android real, web e fluxo de refresh/logout.

## Riscos e pontos de atenção

- O maior risco não é código, é configuração OAuth incorreta no Google Cloud.
- Não fazer vínculo automático por email na primeira versão reduz risco de segurança.
- Tornar `password` opcional exige revisar cuidadosamente tudo que assume senha obrigatória.
- Em Expo, diferenças entre dev build, Expo Go e build distribuído podem afetar redirect URI.
- Se o time quiser suporte completo a "vincular conta Google a conta local", isso deve entrar como fase 2, com usuário autenticado e fluxo explícito.

## Entrega esperada da primeira versão

Ao fim desta implementação, o app deve permitir:

- login existente com email/senha;
- login com Google;
- criação automática de conta nova a partir do Google;
- emissão dos mesmos JWTs já usados pelo backend;
- reaproveitamento total das rotas protegidas já existentes.
