# 📚 Documentação Completa da API - Divisor de Conta Inteligente

## 🌐 Base URL

```
Development: http://localhost:3000
Production: https://api.rateio.com
```

## 🔐 Autenticação

A maioria dos endpoints requer autenticação via **JWT Bearer Token**.

**Header obrigatório:**
```
Authorization: Bearer <access_token>
```

---

## 📑 Índice de Endpoints

### 🔒 Autenticação
- [POST /auth/register](#post-authregister) - Registrar novo usuário
- [POST /auth/login](#post-authlogin) - Login
- [POST /auth/refresh](#post-authrefresh) - Renovar tokens
- [POST /auth/logout](#post-authlogout) - Logout
- [GET /auth/me](#get-authme) - Perfil autenticado

### 👤 Usuários
- [GET /users](#get-users) - Listar usuários (Admin)
- [GET /users/:id](#get-usersid) - Buscar usuário (Admin)
- [POST /users](#post-users) - Criar usuário (Admin)
- [PATCH /users/:id](#patch-usersid) - Atualizar usuário (Admin)
- [GET /users/me/profile](#get-usersmeprofile) - Perfil próprio
- [PATCH /users/me/profile](#patch-usersmeprofile) - Atualizar perfil próprio

### 📄 Contas (Bills)
- [POST /bills](#post-bills) - Criar conta (upload + OCR)
- [GET /bills](#get-bills) - Listar contas do usuário
- [GET /bills/:id](#get-billsid) - Buscar conta específica
- [PATCH /bills/:id](#patch-billsid) - Atualizar conta
- [DELETE /bills/:id](#delete-billsid) - Deletar conta
- [GET /bills/:id/summary](#get-billsidsummary) - Resumo da divisão

### 🛒 Itens da Conta (Bill Items)
- [POST /bill-items](#post-bill-items) - Adicionar item
- [GET /bill-items/bill/:billId](#get-bill-itemsbillbillid) - Listar itens da conta
- [PATCH /bill-items/:id](#patch-bill-itemsid) - Atualizar item
- [DELETE /bill-items/:id](#delete-bill-itemsid) - Deletar item

### 👥 Participantes (Participants)
- [POST /participants](#post-participants) - Adicionar participante
- [GET /participants/bill/:billId](#get-participantsbillbillid) - Listar participantes da conta
- [GET /participants/history](#get-participantshistory) - Histórico de participantes
- [PATCH /participants/:id](#patch-participantsid) - Atualizar participante
- [DELETE /participants/:id](#delete-participantsid) - Remover participante

### ✂️ Divisões (Divisions)
- [POST /divisions](#post-divisions) - Criar divisão
- [GET /divisions/bill/:billId](#get-divisionsbillbillid) - Listar divisões da conta
- [PATCH /divisions/:id](#patch-divisionsid) - Atualizar divisão
- [DELETE /divisions/:id](#delete-divisionsid) - Deletar divisão
- [POST /divisions/batch](#post-divisionsbatch) - Criar múltiplas divisões

### 💰 Taxas (Fees)
- [POST /fees](#post-fees) - Adicionar taxa
- [GET /fees/bill/:billId](#get-feesbillbillid) - Listar taxas da conta
- [PATCH /fees/:id](#patch-feesid) - Atualizar taxa
- [DELETE /fees/:id](#delete-feesid) - Deletar taxa

### 🏥 Sistema
- [GET /health](#get-health) - Health check

---

# 🔒 Autenticação

## POST /auth/register

Registrar novo usuário no sistema.

**⚠️ Nota:** Usuários criados via registro ficam **inativos** até serem aprovados por um admin.

### Request

```http
POST /auth/register
Content-Type: application/json

{
  "email": "usuario@exemplo.com",
  "name": "João Silva",
  "password": "SenhaSegura@123"
}
```

**Body Parameters:**

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| email | string | Sim | Email válido |
| name | string | Sim | Nome completo (mín. 3 caracteres) |
| password | string | Sim | Senha (mín. 8 caracteres) |

### Response

**Status:** `201 Created`

```json
{
  "user": {
    "id": "uuid-do-usuario",
    "email": "usuario@exemplo.com",
    "name": "João Silva",
    "role": "USER",
    "isActive": false,
    "createdAt": "2025-11-03T10:30:00.000Z"
  },
  "message": "Usuário criado com sucesso. Aguarde ativação por um administrador."
}
```

### Errors

**Status:** `409 Conflict`
```json
{
  "statusCode": 409,
  "message": "Email já cadastrado",
  "error": "Conflict"
}
```

**Status:** `400 Bad Request`
```json
{
  "statusCode": 400,
  "message": [
    "email must be an email",
    "password must be longer than or equal to 8 characters"
  ],
  "error": "Bad Request"
}
```

---

## POST /auth/login

Fazer login e receber tokens de acesso.

### Request

```http
POST /auth/login
Content-Type: application/json

{
  "email": "usuario@exemplo.com",
  "password": "SenhaSegura@123"
}
```

**Body Parameters:**

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| email | string | Sim | Email do usuário |
| password | string | Sim | Senha |

### Response

**Status:** `200 OK`

```json
{
  "user": {
    "id": "uuid-do-usuario",
    "email": "usuario@exemplo.com",
    "name": "João Silva",
    "role": "USER",
    "createdAt": "2025-11-03T10:30:00.000Z"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Token Info:**
- `accessToken`: Válido por 15 minutos
- `refreshToken`: Válido por 7 dias

### Errors

**Status:** `401 Unauthorized`
```json
{
  "statusCode": 401,
  "message": "Credenciais inválidas",
  "error": "Unauthorized"
}
```

```json
{
  "statusCode": 401,
  "message": "Usuário inativo. Entre em contato com o administrador.",
  "error": "Unauthorized"
}
```

---

## POST /auth/refresh

Renovar access token usando refresh token.

### Request

```http
POST /auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Response

**Status:** `200 OK`

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Errors

**Status:** `401 Unauthorized`
```json
{
  "statusCode": 401,
  "message": "Refresh token inválido",
  "error": "Unauthorized"
}
```

---

## POST /auth/logout

Fazer logout e invalidar refresh token.

**Autenticação:** Requerida

### Request

```http
POST /auth/logout
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Response

**Status:** `200 OK`

```json
{
  "message": "Logout realizado com sucesso"
}
```

---

## GET /auth/me

Obter informações do usuário autenticado.

**Autenticação:** Requerida

### Request

```http
GET /auth/me
Authorization: Bearer <access_token>
```

### Response

**Status:** `200 OK`

```json
{
  "id": "uuid-do-usuario",
  "email": "usuario@exemplo.com",
  "name": "João Silva",
  "role": "USER",
  "isActive": true,
  "createdAt": "2025-11-03T10:30:00.000Z",
  "updatedAt": "2025-11-03T10:30:00.000Z"
}
```

---

# 👤 Usuários

## GET /users

Listar todos os usuários do sistema.

**Autenticação:** Requerida  
**Permissão:** ADMIN

### Request

```http
GET /users
Authorization: Bearer <access_token>
```

### Response

**Status:** `200 OK`

```json
[
  {
    "id": "uuid-1",
    "email": "admin@rateio.com",
    "name": "Admin",
    "role": "ADMIN",
    "isActive": true,
    "createdAt": "2025-11-01T10:00:00.000Z",
    "updatedAt": "2025-11-01T10:00:00.000Z"
  },
  {
    "id": "uuid-2",
    "email": "usuario@exemplo.com",
    "name": "João Silva",
    "role": "USER",
    "isActive": false,
    "createdAt": "2025-11-03T10:30:00.000Z",
    "updatedAt": "2025-11-03T10:30:00.000Z"
  }
]
```

---

## GET /users/:id

Buscar usuário específico por ID.

**Autenticação:** Requerida  
**Permissão:** ADMIN

### Request

```http
GET /users/uuid-do-usuario
Authorization: Bearer <access_token>
```

### Response

**Status:** `200 OK`

```json
{
  "id": "uuid-do-usuario",
  "email": "usuario@exemplo.com",
  "name": "João Silva",
  "role": "USER",
  "isActive": true,
  "createdAt": "2025-11-03T10:30:00.000Z",
  "updatedAt": "2025-11-03T10:30:00.000Z"
}
```

### Errors

**Status:** `404 Not Found`
```json
{
  "statusCode": 404,
  "message": "Usuário não encontrado",
  "error": "Not Found"
}
```

---

## POST /users

Criar novo usuário (apenas Admin).

**Autenticação:** Requerida  
**Permissão:** ADMIN

### Request

```http
POST /users
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "email": "novo@exemplo.com",
  "name": "Maria Santos",
  "password": "SenhaSegura@123",
  "role": "USER"
}
```

**Body Parameters:**

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| email | string | Sim | Email válido |
| name | string | Sim | Nome (mín. 3 caracteres) |
| password | string | Sim | Senha (mín. 8 caracteres) |
| role | enum | Sim | "ADMIN" ou "USER" |

### Response

**Status:** `201 Created`

```json
{
  "id": "uuid-do-usuario",
  "email": "novo@exemplo.com",
  "name": "Maria Santos",
  "role": "USER",
  "isActive": false,
  "createdAt": "2025-11-03T11:00:00.000Z"
}
```

---

## PATCH /users/:id

Atualizar usuário (apenas Admin).

**Autenticação:** Requerida  
**Permissão:** ADMIN

### Request

```http
PATCH /users/uuid-do-usuario
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "name": "João Silva Updated",
  "isActive": true,
  "role": "USER"
}
```

**Body Parameters (todos opcionais):**

| Campo | Tipo | Descrição |
|-------|------|-----------|
| name | string | Novo nome |
| role | enum | "ADMIN" ou "USER" |
| isActive | boolean | Ativar/desativar usuário |
| password | string | Nova senha (mín. 8 caracteres) |

### Response

**Status:** `200 OK`

```json
{
  "id": "uuid-do-usuario",
  "email": "usuario@exemplo.com",
  "name": "João Silva Updated",
  "role": "USER",
  "isActive": true,
  "createdAt": "2025-11-03T10:30:00.000Z",
  "updatedAt": "2025-11-03T11:15:00.000Z"
}
```

### Errors

**Status:** `400 Bad Request`
```json
{
  "statusCode": 400,
  "message": "Você não pode desativar sua própria conta",
  "error": "Bad Request"
}
```

---

## GET /users/me/profile

Obter perfil do usuário autenticado.

**Autenticação:** Requerida

### Request

```http
GET /users/me/profile
Authorization: Bearer <access_token>
```

### Response

**Status:** `200 OK`

```json
{
  "id": "uuid-do-usuario",
  "email": "usuario@exemplo.com",
  "name": "João Silva",
  "role": "USER",
  "isActive": true,
  "createdAt": "2025-11-03T10:30:00.000Z",
  "updatedAt": "2025-11-03T10:30:00.000Z"
}
```

---

## PATCH /users/me/profile

Atualizar perfil próprio.

**Autenticação:** Requerida

### Request

```http
PATCH /users/me/profile
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "name": "João Silva Atualizado",
  "password": "NovaSenha@123"
}
```

**Body Parameters (todos opcionais):**

| Campo | Tipo | Descrição |
|-------|------|-----------|
| name | string | Novo nome |
| password | string | Nova senha (mín. 8 caracteres) |

### Response

**Status:** `200 OK`

```json
{
  "id": "uuid-do-usuario",
  "email": "usuario@exemplo.com",
  "name": "João Silva Atualizado",
  "role": "USER",
  "isActive": true,
  "createdAt": "2025-11-03T10:30:00.000Z",
  "updatedAt": "2025-11-03T11:20:00.000Z"
}
```

---

# 📄 Contas (Bills)

## POST /bills

Criar nova conta com upload de imagem e processamento OCR automático.

**Autenticação:** Requerida

### Request

```http
POST /bills
Authorization: Bearer <access_token>
Content-Type: multipart/form-data

--boundary
Content-Disposition: form-data; name="image"; filename="conta.jpg"
Content-Type: image/jpeg

<binary data>
--boundary
Content-Disposition: form-data; name="establishmentName"

Restaurante do João
--boundary--
```

**Form Parameters:**

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| image | file | Sim | Imagem da conta (JPEG, PNG, WebP, máx. 10MB) |
| establishmentName | string | Não | Nome do estabelecimento |

### Response

**Status:** `201 Created`

```json
{
  "id": "uuid-da-conta",
  "userId": "uuid-do-usuario",
  "imageUrl": "https://bucket.s3.amazonaws.com/bills/uuid.jpg?signature=...",
  "imageKey": "bills/uuid.jpg",
  "status": "PENDING_OCR",
  "ocrRawText": null,
  "totalAmount": null,
  "establishmentName": "Restaurante do João",
  "createdAt": "2025-11-03T12:00:00.000Z",
  "updatedAt": "2025-11-03T12:00:00.000Z",
  "message": "Conta criada. Processando imagem..."
}
```

**Status da Conta:**
- `PENDING_OCR`: Aguardando processamento OCR
- `OCR_FAILED`: Falha no OCR (foto ilegível)
- `REVIEWING`: Usuário revisando itens reconhecidos
- `DIVIDING`: Usuário dividindo a conta
- `COMPLETED`: Divisão finalizada

### Errors

**Status:** `400 Bad Request`
```json
{
  "statusCode": 400,
  "message": "Imagem da conta é obrigatória",
  "error": "Bad Request"
}
```

```json
{
  "statusCode": 400,
  "message": "Apenas imagens são permitidas (JPEG, PNG, WebP)",
  "error": "Bad Request"
}
```

```json
{
  "statusCode": 400,
  "message": "Tamanho máximo: 10MB",
  "error": "Bad Request"
}
```

---

## GET /bills

Listar todas as contas do usuário autenticado.

**Autenticação:** Requerida

### Request

```http
GET /bills
Authorization: Bearer <access_token>
```

### Response

**Status:** `200 OK`

```json
[
  {
    "id": "uuid-conta-1",
    "userId": "uuid-do-usuario",
    "imageUrl": "https://bucket.s3.amazonaws.com/bills/uuid-1.jpg?signature=...",
    "imageKey": "bills/uuid-1.jpg",
    "status": "COMPLETED",
    "ocrRawText": "RESTAURANTE DO JOÃO\nCoca Cola 5.00\nBatata Frita 12.00\nTotal: 17.00",
    "totalAmount": "17.00",
    "establishmentName": "Restaurante do João",
    "createdAt": "2025-11-03T12:00:00.000Z",
    "updatedAt": "2025-11-03T12:30:00.000Z",
    "items": [
      {
        "id": "uuid-item-1",
        "name": "Coca Cola",
        "quantity": 1,
        "unitPrice": "5.00",
        "totalPrice": "5.00"
      }
    ],
    "participants": [
      {
        "id": "uuid-participant-1",
        "name": "João"
      },
      {
        "id": "uuid-participant-2",
        "name": "Maria"
      }
    ],
    "fees": [],
    "_count": {
      "items": 2,
      "participants": 2
    }
  }
]
```

---

## GET /bills/:id

Buscar detalhes completos de uma conta específica.

**Autenticação:** Requerida

### Request

```http
GET /bills/uuid-da-conta
Authorization: Bearer <access_token>
```

### Response

**Status:** `200 OK`

```json
{
  "id": "uuid-da-conta",
  "userId": "uuid-do-usuario",
  "imageUrl": "https://bucket.s3.amazonaws.com/bills/uuid.jpg?signature=...",
  "imageKey": "bills/uuid.jpg",
  "status": "DIVIDING",
  "ocrRawText": "RESTAURANTE DO JOÃO\nCoca Cola 5.00\nBatata Frita 12.00\nTotal: 17.00",
  "totalAmount": "17.00",
  "establishmentName": "Restaurante do João",
  "createdAt": "2025-11-03T12:00:00.000Z",
  "updatedAt": "2025-11-03T12:30:00.000Z",
  "items": [
    {
      "id": "uuid-item-1",
      "billId": "uuid-da-conta",
      "name": "Coca Cola",
      "quantity": 1,
      "unitPrice": "5.00",
      "totalPrice": "5.00",
      "divisions": [
        {
          "id": "uuid-division-1",
          "shareAmount": "2.50",
          "participant": {
            "id": "uuid-participant-1",
            "name": "João"
          }
        },
        {
          "id": "uuid-division-2",
          "shareAmount": "2.50",
          "participant": {
            "id": "uuid-participant-2",
            "name": "Maria"
          }
        }
      ]
    },
    {
      "id": "uuid-item-2",
      "billId": "uuid-da-conta",
      "name": "Batata Frita",
      "quantity": 1,
      "unitPrice": "12.00",
      "totalPrice": "12.00",
      "divisions": [
        {
          "id": "uuid-division-3",
          "shareAmount": "12.00",
          "participant": {
            "id": "uuid-participant-1",
            "name": "João"
          }
        }
      ]
    }
  ],
  "participants": [
    {
      "id": "uuid-participant-1",
      "name": "João",
      "divisions": [
        {
          "id": "uuid-division-1",
          "shareAmount": "2.50"
        },
        {
          "id": "uuid-division-3",
          "shareAmount": "12.00"
        }
      ]
    },
    {
      "id": "uuid-participant-2",
      "name": "Maria",
      "divisions": [
        {
          "id": "uuid-division-2",
          "shareAmount": "2.50"
        }
      ]
    }
  ],
  "fees": []
}
```

### Errors

**Status:** `404 Not Found`
```json
{
  "statusCode": 404,
  "message": "Conta não encontrada",
  "error": "Not Found"
}
```

**Status:** `403 Forbidden`
```json
{
  "statusCode": 403,
  "message": "Você não tem acesso a esta conta",
  "error": "Forbidden"
}
```

---

## PATCH /bills/:id

Atualizar informações da conta.

**Autenticação:** Requerida

### Request

```http
PATCH /bills/uuid-da-conta
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "status": "REVIEWING",
  "establishmentName": "Novo Nome do Restaurante",
  "totalAmount": 17.50,
  "items": [
    {
      "name": "Coca Cola",
      "quantity": 1,
      "unitPrice": 5.00,
      "totalPrice": 5.00
    },
    {
      "name": "Batata Frita Grande",
      "quantity": 1,
      "unitPrice": 12.50,
      "totalPrice": 12.50
    }
  ]
}
```

**Body Parameters (todos opcionais):**

| Campo | Tipo | Descrição |
|-------|------|-----------|
| status | enum | "PENDING_OCR", "OCR_FAILED", "REVIEWING", "DIVIDING", "COMPLETED" |
| establishmentName | string | Nome do estabelecimento |
| totalAmount | number | Valor total da conta |
| items | array | Array de itens (substitui todos os itens existentes) |

### Response

**Status:** `200 OK`

```json
{
  "id": "uuid-da-conta",
  "userId": "uuid-do-usuario",
  "imageUrl": "https://bucket.s3.amazonaws.com/bills/uuid.jpg?signature=...",
  "imageKey": "bills/uuid.jpg",
  "status": "REVIEWING",
  "ocrRawText": "...",
  "totalAmount": "17.50",
  "establishmentName": "Novo Nome do Restaurante",
  "createdAt": "2025-11-03T12:00:00.000Z",
  "updatedAt": "2025-11-03T13:00:00.000Z",
  "items": [
    {
      "id": "uuid-item-new-1",
      "name": "Coca Cola",
      "quantity": 1,
      "unitPrice": "5.00",
      "totalPrice": "5.00"
    },
    {
      "id": "uuid-item-new-2",
      "name": "Batata Frita Grande",
      "quantity": 1,
      "unitPrice": "12.50",
      "totalPrice": "12.50"
    }
  ],
  "participants": [],
  "fees": []
}
```

---

## DELETE /bills/:id

Deletar conta e remover imagem do S3.

**Autenticação:** Requerida

### Request

```http
DELETE /bills/uuid-da-conta
Authorization: Bearer <access_token>
```

### Response

**Status:** `200 OK`

```json
{
  "message": "Conta deletada com sucesso"
}
```

---

## GET /bills/:id/summary

Obter resumo da divisão calculado.

**Autenticação:** Requerida

### Request

```http
GET /bills/uuid-da-conta/summary
Authorization: Bearer <access_token>
```

### Response

**Status:** `200 OK`

```json
{
  "billId": "uuid-da-conta",
  "establishmentName": "Restaurante do João",
  "totalAmount": "17.00",
  "itemsTotal": "17.00",
  "feesTotal": "0.00",
  "grandTotal": "17.00",
  "participants": [
    {
      "id": "uuid-participant-1",
      "name": "João",
      "totalAmount": "14.50",
      "items": [
        {
          "name": "Coca Cola",
          "shareAmount": "2.50"
        },
        {
          "name": "Batata Frita",
          "shareAmount": "12.00"
        }
      ],
      "fees": []
    },
    {
      "id": "uuid-participant-2",
      "name": "Maria",
      "totalAmount": "2.50",
      "items": [
        {
          "name": "Coca Cola",
          "shareAmount": "2.50"
        }
      ],
      "fees": []
    }
  ]
}
```

---

# 🛒 Itens da Conta (Bill Items)

## POST /bill-items

Adicionar item manualmente a uma conta.

**Autenticação:** Requerida

### Request

```http
POST /bill-items
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "billId": "uuid-da-conta",
  "name": "Cerveja Artesanal",
  "quantity": 2,
  "unitPrice": 15.00,
  "totalPrice": 30.00
}
```

**Body Parameters:**

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| billId | string | Sim | UUID da conta |
| name | string | Sim | Nome do item |
| quantity | number | Sim | Quantidade (mínimo 1) |
| unitPrice | number | Sim | Preço unitário |
| totalPrice | number | Sim | Preço total (quantity * unitPrice) |

### Response

**Status:** `201 Created`

```json
{
  "id": "uuid-do-item",
  "billId": "uuid-da-conta",
  "name": "Cerveja Artesanal",
  "quantity": 2,
  "unitPrice": "15.00",
  "totalPrice": "30.00",
  "createdAt": "2025-11-03T13:00:00.000Z",
  "updatedAt": "2025-11-03T13:00:00.000Z"
}
```

---

## GET /bill-items/bill/:billId

Listar todos os itens de uma conta.

**Autenticação:** Requerida

### Request

```http
GET /bill-items/bill/uuid-da-conta
Authorization: Bearer <access_token>
```

### Response

**Status:** `200 OK`

```json
[
  {
    "id": "uuid-item-1",
    "billId": "uuid-da-conta",
    "name": "Coca Cola",
    "quantity": 1,
    "unitPrice": "5.00",
    "totalPrice": "5.00",
    "createdAt": "2025-11-03T12:00:00.000Z",
    "updatedAt": "2025-11-03T12:00:00.000Z"
  },
  {
    "id": "uuid-item-2",
    "billId": "uuid-da-conta",
    "name": "Batata Frita",
    "quantity": 1,
    "unitPrice": "12.00",
    "totalPrice": "12.00",
    "createdAt": "2025-11-03T12:00:00.000Z",
    "updatedAt": "2025-11-03T12:00:00.000Z"
  }
]
```

---

## PATCH /bill-items/:id

Atualizar item da conta.

**Autenticação:** Requerida

### Request

```http
PATCH /bill-items/uuid-do-item
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "name": "Coca Cola 2L",
  "quantity": 1,
  "unitPrice": 8.00,
  "totalPrice": 8.00
}
```

**Body Parameters (todos opcionais):**

| Campo | Tipo | Descrição |
|-------|------|-----------|
| name | string | Novo nome do item |
| quantity | number | Nova quantidade |
| unitPrice | number | Novo preço unitário |
| totalPrice | number | Novo preço total |

### Response

**Status:** `200 OK`

```json
{
  "id": "uuid-do-item",
  "billId": "uuid-da-conta",
  "name": "Coca Cola 2L",
  "quantity": 1,
  "unitPrice": "8.00",
  "totalPrice": "8.00",
  "createdAt": "2025-11-03T12:00:00.000Z",
  "updatedAt": "2025-11-03T13:30:00.000Z"
}
```

---

## DELETE /bill-items/:id

Deletar item da conta.

**Autenticação:** Requerida

### Request

```http
DELETE /bill-items/uuid-do-item
Authorization: Bearer <access_token>
```

### Response

**Status:** `200 OK`

```json
{
  "message": "Item deletado com sucesso"
}
```

---

# 👥 Participantes (Participants)

## POST /participants

Adicionar participante a uma conta.

**Autenticação:** Requerida

### Request

```http
POST /participants
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "billId": "uuid-da-conta",
  "name": "Carlos"
}
```

**Body Parameters:**

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| billId | string | Sim | UUID da conta |
| name | string | Sim | Nome do participante |

### Response

**Status:** `201 Created`

```json
{
  "id": "uuid-do-participante",
  "billId": "uuid-da-conta",
  "name": "Carlos",
  "createdAt": "2025-11-03T13:00:00.000Z",
  "updatedAt": "2025-11-03T13:00:00.000Z"
}
```

---

## GET /participants/bill/:billId

Listar todos os participantes de uma conta.

**Autenticação:** Requerida

### Request

```http
GET /participants/bill/uuid-da-conta
Authorization: Bearer <access_token>
```

### Response

**Status:** `200 OK`

```json
[
  {
    "id": "uuid-participant-1",
    "billId": "uuid-da-conta",
    "name": "João",
    "createdAt": "2025-11-03T12:00:00.000Z",
    "updatedAt": "2025-11-03T12:00:00.000Z"
  },
  {
    "id": "uuid-participant-2",
    "billId": "uuid-da-conta",
    "name": "Maria",
    "createdAt": "2025-11-03T12:00:00.000Z",
    "updatedAt": "2025-11-03T12:00:00.000Z"
  },
  {
    "id": "uuid-participant-3",
    "billId": "uuid-da-conta",
    "name": "Carlos",
    "createdAt": "2025-11-03T13:00:00.000Z",
    "updatedAt": "2025-11-03T13:00:00.000Z"
  }
]
```

---

## GET /participants/history

Buscar histórico de participantes recorrentes do usuário.

**Autenticação:** Requerida

### Request

```http
GET /participants/history
Authorization: Bearer <access_token>
```

**Query Parameters (opcionais):**

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| search | string | Buscar por nome |
| limit | number | Limite de resultados (padrão: 20) |

### Response

**Status:** `200 OK`

```json
[
  {
    "name": "João",
    "count": 15,
    "lastUsed": "2025-11-03T12:00:00.000Z"
  },
  {
    "name": "Maria",
    "count": 12,
    "lastUsed": "2025-11-02T18:30:00.000Z"
  },
  {
    "name": "Carlos",
    "count": 8,
    "lastUsed": "2025-11-01T20:15:00.000Z"
  },
  {
    "name": "Ana",
    "count": 5,
    "lastUsed": "2025-10-28T19:00:00.000Z"
  }
]
```

---

## PATCH /participants/:id

Atualizar nome do participante.

**Autenticação:** Requerida

### Request

```http
PATCH /participants/uuid-do-participante
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "name": "Carlos Silva"
}
```

### Response

**Status:** `200 OK`

```json
{
  "id": "uuid-do-participante",
  "billId": "uuid-da-conta",
  "name": "Carlos Silva",
  "createdAt": "2025-11-03T13:00:00.000Z",
  "updatedAt": "2025-11-03T14:00:00.000Z"
}
```

---

## DELETE /participants/:id

Remover participante da conta.

**Autenticação:** Requerida

**⚠️ Nota:** Remove também todas as divisões associadas ao participante.

### Request

```http
DELETE /participants/uuid-do-participante
Authorization: Bearer <access_token>
```

### Response

**Status:** `200 OK`

```json
{
  "message": "Participante removido com sucesso"
}
```

---

# ✂️ Divisões (Divisions)

## POST /divisions

Criar divisão de um item entre um participante.

**Autenticação:** Requerida

### Request

```http
POST /divisions
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "billItemId": "uuid-do-item",
  "participantId": "uuid-do-participante",
  "shareAmount": 5.00
}
```

**Body Parameters:**

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| billItemId | string | Sim | UUID do item |
| participantId | string | Sim | UUID do participante |
| shareAmount | number | Sim | Valor que o participante paga deste item |

### Response

**Status:** `201 Created`

```json
{
  "id": "uuid-da-divisao",
  "billItemId": "uuid-do-item",
  "participantId": "uuid-do-participante",
  "shareAmount": "5.00",
  "createdAt": "2025-11-03T14:00:00.000Z",
  "updatedAt": "2025-11-03T14:00:00.000Z"
}
```

### Errors

**Status:** `409 Conflict`
```json
{
  "statusCode": 409,
  "message": "Divisão já existe para este item e participante",
  "error": "Conflict"
}
```

**Status:** `400 Bad Request`
```json
{
  "statusCode": 400,
  "message": "Valor da divisão excede o total do item",
  "error": "Bad Request"
}
```

---

## POST /divisions/batch

Criar múltiplas divisões de uma vez.

**Autenticação:** Requerida

### Request

```http
POST /divisions/batch
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "billItemId": "uuid-do-item",
  "divisions": [
    {
      "participantId": "uuid-participant-1",
      "shareAmount": 2.50
    },
    {
      "participantId": "uuid-participant-2",
      "shareAmount": 2.50
    }
  ]
}
```

**Body Parameters:**

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| billItemId | string | Sim | UUID do item |
| divisions | array | Sim | Array de divisões |
| divisions[].participantId | string | Sim | UUID do participante |
| divisions[].shareAmount | number | Sim | Valor da divisão |

### Response

**Status:** `201 Created`

```json
{
  "message": "2 divisões criadas com sucesso",
  "divisions": [
    {
      "id": "uuid-division-1",
      "billItemId": "uuid-do-item",
      "participantId": "uuid-participant-1",
      "shareAmount": "2.50",
      "createdAt": "2025-11-03T14:00:00.000Z",
      "updatedAt": "2025-11-03T14:00:00.000Z"
    },
    {
      "id": "uuid-division-2",
      "billItemId": "uuid-do-item",
      "participantId": "uuid-participant-2",
      "shareAmount": "2.50",
      "createdAt": "2025-11-03T14:00:00.000Z",
      "updatedAt": "2025-11-03T14:00:00.000Z"
    }
  ]
}
```

### Errors

**Status:** `400 Bad Request`
```json
{
  "statusCode": 400,
  "message": "Soma das divisões (6.00) excede o total do item (5.00)",
  "error": "Bad Request"
}
```

---

## GET /divisions/bill/:billId

Listar todas as divisões de uma conta.

**Autenticação:** Requerida

### Request

```http
GET /divisions/bill/uuid-da-conta
Authorization: Bearer <access_token>
```

### Response

**Status:** `200 OK`

```json
[
  {
    "id": "uuid-division-1",
    "billItemId": "uuid-item-1",
    "participantId": "uuid-participant-1",
    "shareAmount": "2.50",
    "createdAt": "2025-11-03T14:00:00.000Z",
    "updatedAt": "2025-11-03T14:00:00.000Z",
    "billItem": {
      "id": "uuid-item-1",
      "name": "Coca Cola",
      "totalPrice": "5.00"
    },
    "participant": {
      "id": "uuid-participant-1",
      "name": "João"
    }
  },
  {
    "id": "uuid-division-2",
    "billItemId": "uuid-item-1",
    "participantId": "uuid-participant-2",
    "shareAmount": "2.50",
    "createdAt": "2025-11-03T14:00:00.000Z",
    "updatedAt": "2025-11-03T14:00:00.000Z",
    "billItem": {
      "id": "uuid-item-1",
      "name": "Coca Cola",
      "totalPrice": "5.00"
    },
    "participant": {
      "id": "uuid-participant-2",
      "name": "Maria"
    }
  }
]
```

---

## PATCH /divisions/:id

Atualizar valor de uma divisão.

**Autenticação:** Requerida

### Request

```http
PATCH /divisions/uuid-da-divisao
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "shareAmount": 3.00
}
```

### Response

**Status:** `200 OK`

```json
{
  "id": "uuid-da-divisao",
  "billItemId": "uuid-do-item",
  "participantId": "uuid-do-participante",
  "shareAmount": "3.00",
  "createdAt": "2025-11-03T14:00:00.000Z",
  "updatedAt": "2025-11-03T15:00:00.000Z"
}
```

---

## DELETE /divisions/:id

Deletar divisão.

**Autenticação:** Requerida

### Request

```http
DELETE /divisions/uuid-da-divisao
Authorization: Bearer <access_token>
```

### Response

**Status:** `200 OK`

```json
{
  "message": "Divisão deletada com sucesso"
}
```

---

# 💰 Taxas (Fees)

## POST /fees

Adicionar taxa à conta.

**Autenticação:** Requerida

### Request

```http
POST /fees
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "billId": "uuid-da-conta",
  "type": "SERVICE_PERCENTAGE",
  "description": "Taxa de Serviço",
  "value": 10.00
}
```

**Body Parameters:**

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| billId | string | Sim | UUID da conta |
| type | enum | Sim | "SERVICE_PERCENTAGE", "SERVICE_FIXED", "COVER_CHARGE" |
| description | string | Não | Descrição da taxa |
| value | number | Sim | Valor (% ou fixo dependendo do tipo) |

**Tipos de Taxa:**
- `SERVICE_PERCENTAGE`: Taxa de serviço percentual (ex: 10%)
- `SERVICE_FIXED`: Taxa de serviço fixa (ex: R$ 5,00)
- `COVER_CHARGE`: Couvert artístico fixo (ex: R$ 15,00)

### Response

**Status:** `201 Created`

```json
{
  "id": "uuid-da-taxa",
  "billId": "uuid-da-conta",
  "type": "SERVICE_PERCENTAGE",
  "description": "Taxa de Serviço",
  "value": "10.00",
  "createdAt": "2025-11-03T15:00:00.000Z",
  "updatedAt": "2025-11-03T15:00:00.000Z"
}
```

---

## GET /fees/bill/:billId

Listar todas as taxas de uma conta.

**Autenticação:** Requerida

### Request

```http
GET /fees/bill/uuid-da-conta
Authorization: Bearer <access_token>
```

### Response

**Status:** `200 OK`

```json
[
  {
    "id": "uuid-fee-1",
    "billId": "uuid-da-conta",
    "type": "SERVICE_PERCENTAGE",
    "description": "Taxa de Serviço (10%)",
    "value": "10.00",
    "createdAt": "2025-11-03T15:00:00.000Z",
    "updatedAt": "2025-11-03T15:00:00.000Z"
  },
  {
    "id": "uuid-fee-2",
    "billId": "uuid-da-conta",
    "type": "COVER_CHARGE",
    "description": "Couvert Artístico",
    "value": "15.00",
    "createdAt": "2025-11-03T15:00:00.000Z",
    "updatedAt": "2025-11-03T15:00:00.000Z"
  }
]
```

---

## PATCH /fees/:id

Atualizar taxa.

**Autenticação:** Requerida

### Request

```http
PATCH /fees/uuid-da-taxa
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "type": "SERVICE_PERCENTAGE",
  "description": "Taxa de Garçom (12%)",
  "value": 12.00
}
```

**Body Parameters (todos opcionais):**

| Campo | Tipo | Descrição |
|-------|------|-----------|
| type | enum | Tipo da taxa |
| description | string | Descrição |
| value | number | Novo valor |

### Response

**Status:** `200 OK`

```json
{
  "id": "uuid-da-taxa",
  "billId": "uuid-da-conta",
  "type": "SERVICE_PERCENTAGE",
  "description": "Taxa de Garçom (12%)",
  "value": "12.00",
  "createdAt": "2025-11-03T15:00:00.000Z",
  "updatedAt": "2025-11-03T15:30:00.000Z"
}
```

---

## DELETE /fees/:id

Deletar taxa.

**Autenticação:** Requerida

### Request

```http
DELETE /fees/uuid-da-taxa
Authorization: Bearer <access_token>
```

### Response

**Status:** `200 OK`

```json
{
  "message": "Taxa deletada com sucesso"
}
```

---

# 🏥 Sistema

## GET /health

Verificar status da API e conexão com banco de dados.

**Autenticação:** Não requerida

### Request

```http
GET /health
```

### Response

**Status:** `200 OK`

```json
{
  "status": "ok",
  "timestamp": "2025-11-03T16:00:00.000Z",
  "uptime": 3600,
  "database": {
    "status": "connected",
    "responseTime": 5
  },
  "version": "1.0.0"
}
```

**Status:** `503 Service Unavailable` (se banco desconectado)

```json
{
  "status": "ok",
  "timestamp": "2025-11-03T16:00:00.000Z",
  "uptime": 3600,
  "database": {
    "status": "disconnected",
    "responseTime": -1,
    "error": "Connection timeout"
  },
  "version": "1.0.0"
}
```

---

# 🔄 Fluxo Completo de Uso

## 1️⃣ Registro e Login

```bash
# 1. Registrar usuário
POST /auth/register
{
  "email": "joao@exemplo.com",
  "name": "João Silva",
  "password": "Senha@123"
}

# 2. Admin ativa o usuário
PATCH /users/:userId (Admin only)
{
  "isActive": true
}

# 3. Login
POST /auth/login
{
  "email": "joao@exemplo.com",
  "password": "Senha@123"
}
# → Recebe accessToken e refreshToken
```

## 2️⃣ Criar Conta e Processar OCR

```bash
# 1. Upload da foto da conta
POST /bills
Content-Type: multipart/form-data
- image: <arquivo>
- establishmentName: "Restaurante X"

# → Status: PENDING_OCR (processando OCR em background)

# 2. Aguardar processamento (polling ou webhook)
GET /bills/:billId
# → Status: REVIEWING (OCR concluído)
# → Retorna itens reconhecidos automaticamente
```

## 3️⃣ Revisar e Ajustar Itens

```bash
# 1. Listar itens reconhecidos
GET /bill-items/bill/:billId

# 2. Editar item (se necessário)
PATCH /bill-items/:itemId
{
  "name": "Coca Cola 2L",
  "unitPrice": 8.00,
  "totalPrice": 8.00
}

# 3. Adicionar item manualmente (se OCR perdeu)
POST /bill-items
{
  "billId": ":billId",
  "name": "Sobremesa",
  "quantity": 1,
  "unitPrice": 12.00,
  "totalPrice": 12.00
}

# 4. Atualizar status da conta
PATCH /bills/:billId
{
  "status": "DIVIDING"
}
```

## 4️⃣ Adicionar Participantes

```bash
# 1. Buscar participantes recorrentes (histórico)
GET /participants/history?search=João

# 2. Adicionar participantes à conta
POST /participants
{
  "billId": ":billId",
  "name": "João"
}

POST /participants
{
  "billId": ":billId",
  "name": "Maria"
}
```

## 5️⃣ Dividir Itens

```bash
# 1. Dividir item entre múltiplos participantes
POST /divisions/batch
{
  "billItemId": ":itemId",
  "divisions": [
    {
      "participantId": ":joaoId",
      "shareAmount": 4.00
    },
    {
      "participantId": ":mariaId",
      "shareAmount": 4.00
    }
  ]
}

# 2. Item individual
POST /divisions
{
  "billItemId": ":item2Id",
  "participantId": ":joaoId",
  "shareAmount": 12.00
}
```

## 6️⃣ Adicionar Taxas

```bash
# 1. Taxa de serviço (10%)
POST /fees
{
  "billId": ":billId",
  "type": "SERVICE_PERCENTAGE",
  "description": "Taxa de Serviço",
  "value": 10.00
}

# 2. Couvert fixo
POST /fees
{
  "billId": ":billId",
  "type": "COVER_CHARGE",
  "description": "Couvert Artístico",
  "value": 15.00
}
```

## 7️⃣ Finalizar e Ver Resumo

```bash
# 1. Marcar como completa
PATCH /bills/:billId
{
  "status": "COMPLETED"
}

# 2. Ver resumo da divisão
GET /bills/:billId/summary
# → Retorna quanto cada pessoa deve pagar
```

---

# 🛡️ Códigos de Status HTTP

| Código | Significado | Quando usar |
|--------|-------------|-------------|
| 200 | OK | Requisição bem-sucedida (GET, PATCH, DELETE) |
| 201 | Created | Recurso criado com sucesso (POST) |
| 400 | Bad Request | Validação falhou, dados inválidos |
| 401 | Unauthorized | Token ausente ou inválido |
| 403 | Forbidden | Usuário não tem permissão |
| 404 | Not Found | Recurso não encontrado |
| 409 | Conflict | Conflito (ex: email já existe) |
| 500 | Internal Server Error | Erro interno do servidor |

---

# 🔒 Segurança

## Rate Limiting

**Limites gerais:**
- 10 requisições/minuto para endpoints gerais
- 3 requisições/minuto para `/auth/login` (proteção brute force)
- 5 requisições/minuto para `/auth/register`

**Header de resposta quando limite excedido:**
```http
HTTP/1.1 429 Too Many Requests
Retry-After: 60

{
  "statusCode": 429,
  "message": "ThrottlerException: Too Many Requests"
}
```

## Expiração de Tokens

| Token | Validade | Uso |
|-------|----------|-----|
| Access Token | 15 minutos | Requisições autenticadas |
| Refresh Token | 7 dias | Renovar access token |

## Permissões

| Endpoint | USER | ADMIN |
|----------|------|-------|
| /auth/* | ✅ | ✅ |
| /users (listar/criar/editar) | ❌ | ✅ |
| /users/me/* | ✅ | ✅ |
| /bills/* | ✅ (próprias) | ✅ (todas) |
| /bill-items/* | ✅ | ✅ |
| /participants/* | ✅ | ✅ |
| /divisions/* | ✅ | ✅ |
| /fees/* | ✅ | ✅ |

---

# 📊 Exemplos de Integração

## cURL

```bash
# Login
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"joao@exemplo.com","password":"Senha@123"}' \
  | jq -r '.accessToken')

# Upload de conta
curl -X POST http://localhost:3000/bills \
  -H "Authorization: Bearer $TOKEN" \
  -F "image=@conta.jpg" \
  -F "establishmentName=Restaurante X"

# Listar contas
curl http://localhost:3000/bills \
  -H "Authorization: Bearer $TOKEN"
```

## JavaScript (Fetch)

```javascript
// Login
const loginResponse = await fetch('http://localhost:3000/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'joao@exemplo.com',
    password: 'Senha@123'
  })
});

const { accessToken } = await loginResponse.json();

// Upload de conta
const formData = new FormData();
formData.append('image', fileInput.files[0]);
formData.append('establishmentName', 'Restaurante X');

const billResponse = await fetch('http://localhost:3000/bills', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${accessToken}` },
  body: formData
});

const bill = await billResponse.json();
console.log('Conta criada:', bill);
```

## Axios (React Native)

```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://192.168.1.100:3000',
  timeout: 30000,
});

// Interceptor para adicionar token
api.interceptors.request.use((config) => {
  const token = getStoredToken(); // AsyncStorage
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Upload de conta
const uploadBill = async (imageUri, establishmentName) => {
  const formData = new FormData();
  formData.append('image', {
    uri: imageUri,
    type: 'image/jpeg',
    name: 'conta.jpg',
  });
  formData.append('establishmentName', establishmentName);

  const response = await api.post('/bills', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  return response.data;
};
```
---

# 📝 Notas Importantes

1. **Upload de Imagens:**
   - Máximo 10MB por arquivo
   - Formatos: JPEG, PNG, WebP
   - Processamento OCR é assíncrono

2. **Divisões:**
   - Soma das divisões deve ser ≤ valor total do item
   - Cada participante pode dividir um item apenas uma vez
   - Divisões são deletadas automaticamente se participante for removido

3. **Taxas:**
   - `SERVICE_PERCENTAGE`: valor é aplicado sobre o total dos itens
   - `SERVICE_FIXED` e `COVER_CHARGE`: valor fixo distribuído entre participantes

4. **Status da Conta:**
   - `PENDING_OCR` → `REVIEWING` → `DIVIDING` → `COMPLETED`
   - Fluxo linear, não pode voltar para status anterior

5. **URLs do S3:**
   - Expiram em 1 hora
   - API regenera automaticamente quando buscar conta
   - Não armazenar URL no app, sempre buscar fresh da API
