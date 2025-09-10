---
sidebar_position: 4
---

# 💻 Desenvolvimento

<!-- Este documento deve ser preenchido pela equipe de Desenvolvimento ao iniciar um projeto. -->

## 🗓 Informações Gerais

- **Nome do Projeto:** 
<!-- Exemplo: Sistema de Gestão de Reservas para Biblioteca -->

- **Scrum Master Responsável:**
<!-- Nome do Scrum Master que acompanhará o projeto -->

- **Equipe de Desenvolvimento:**
<!-- Lista com nome das pessoas desenvolvedoras envolvidas -->

- **Data de Entrada na Área:**
<!-- Exemplo: 10/04/2025 -->

- **Data Estimada de Conclusão da Área:**
<!-- Exemplo: 08/06/2025 -->

---

## ✅ Checklist de Entrada

- [ ] Documento de Visão de Produto revisado e compreendido
- [ ] Tecnologias e requisitos funcionais claramente definidos
- [ ] Wireframes ou protótipos recebidos e validados
- [ ] Modelo de dados alinhado entre frontend e backend
- [ ] User Stories priorizadas e estimadas
- [ ] Capacidade técnica e de tempo confirmada
- [ ] Entendimento dos custos de manutenção

---

## 📤 Checklist de Saída

- [ ] Funcionalidades desenvolvidas conforme requisitos
- [ ] Deploy realizado (ou instruções de deploy definidas)
- [ ] Documentação técnica entregue (API, banco, estrutura de dados, etc.)
- [ ] Entrega validada com PO

---

## 🛠 Tecnologias Utilizadas

**Frontend:**
<!-- Exemplo: React, Next.js -->

**Backend:**
<!-- Exemplo: Node.js + Express -->

**Banco de Dados:**
<!-- Exemplo: PostgreSQL -->

**Hospedagem:**
<!-- Exemplo: Vercel (frontend), Railway (backend), Supabase (DB) -->

**Outros Serviços:**
<!-- Exemplo: Firebase Auth, SendGrid, AWS S3 -->

---

## 💸 Custos de Manutenção

<!-- Detalhar os custos mensais previstos para manter a aplicação em funcionamento -->
<div align="center">

| Serviço                     | Valor Mensal Estimado | Observações                        |
|----------------------------|------------------------|------------------------------------|
| Hospedagem do Frontend     | R$ 10,00               | Plano gratuito da Vercel é suficiente |
| API / Backend              | R$ 25,00               | Uso do Railway com plano básico   |
| Banco de Dados             | R$ 20,00               | Supabase com 1GB de dados          |
| Domínio                    | R$ 40,00               | Registro anual dividido mensalmente |
| Outros                     | R$ 15,00               | Envio de e-mails via SendGrid     |

</div>


**Total:** R$ 110,00 / mês

---

## 🧱 Infraestrutura de Dados

### 🔗 Modelo Lógico do Banco de Dados

<!-- Inserir imagem ou link para o modelo lógico (diagrama) -->

**Link para o modelo:** 
<!-- Exemplo: https://dbdiagram.io/xyz -->

### 🔄 Estrutura de Dados (Frontend ↔ Backend)

<!-- 
Esta seção é essencial para garantir que o frontend e o backend consigam se comunicar corretamente.

Um dos problemas mais comuns durante o desenvolvimento de software é a **integração mal alinhada entre frontend e backend**. Isso costuma acontecer quando:

- O frontend espera um dado que o backend não envia.
- O backend envia um dado com formato diferente do esperado.
- Os nomes das chaves são inconsistentes entre os times.
- Informações essenciais estão faltando ou sobrando.
- Os endpoints não retornam o que foi combinado.

Esse desalinhamento costuma causar bugs, atrasos e retrabalho — principalmente quando não há **um contrato bem definido entre as partes**.

---

#### 📝 O que são contratos de dados?

Um **contrato de dados** é um acordo entre frontend e backend sobre **como será a estrutura da informação trocada entre eles**.

Esse contrato é geralmente representado por **interfaces** (em TypeScript, por exemplo), que descrevem o formato exato dos objetos esperados nas requisições e respostas da API.

Essas interfaces servem tanto para:

- Guiar a implementação de quem desenvolve o backend (para saber exatamente o que entregar),
- Quanto para guiar o frontend (para saber exatamente o que esperar e como lidar com os dados recebidos).

Além disso, uma vez definidos, **esses contratos se transformam em dados reais** durante o desenvolvimento, e podem inclusive ser usados para gerar mocks e testes automatizados.

---

#### 🛠 Exemplo de Interface (Contrato de Dados)

**Arquivo:** `src/interfaces/IReserva.ts`

```ts
// Interface que define o formato dos dados que o backend deve retornar para o frontend

export interface IReserva {
  id: number
  sala: string
  inicio: string // ISO string
  fim: string // ISO string
  usuario: {
    nome: string
    email: string
  }
}
```

Essa interface deve ser conhecida tanto pelo time de frontend quanto pelo de backend — é o **contrato oficial** do endpoint, por exemplo, `GET /reservas`.

---

#### 📦 Exemplo de Dados Reais (Baseados na Interface)

```json
// Resposta real simulada da API: GET /reservas
[
  {
    "id": 12,
    "sala": "A201",
    "inicio": "2025-04-10T10:00:00Z",
    "fim": "2025-04-10T11:00:00Z",
    "usuario": {
      "nome": "João Silva",
      "email": "joao@exemplo.com"
    }
  },
  {
    "id": 13,
    "sala": "B102",
    "inicio": "2025-04-10T13:00:00Z",
    "fim": "2025-04-10T14:00:00Z",
    "usuario": {
      "nome": "Maria Costa",
      "email": "maria@exemplo.com"
    }
  }
]
```

---

#### 🎯 Boas Práticas

- Sempre que um endpoint for definido, **especifique a interface correspondente**.
- Sempre que houver mudanças nos dados, **atualize o contrato e alinhe com o outro time**.
- Preferencialmente, **comece pelo contrato** antes de qualquer implementação — ele pode ser escrito em conjunto, e depois cada parte trabalha com segurança.
- Use esses contratos também em testes automatizados e mocks locais.

---

-->

#### 🛠 Exemplo de Interface (Contrato de Dados)

**Arquivo:** `src/interfaces/IReserva.ts`

```ts
// Interface que define o formato dos dados que o backend deve retornar para o frontend

export interface IReserva {
  id: number;
  active: boolean;
  sala?: string; // opcional
  inicio: Date; // ISO string
  fim: Date; // ISO string
  usuario: {
    nome: string;
    email: string;
  }
}
```
