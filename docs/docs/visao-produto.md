---
sidebar_position: 2
---

# 📄 Visão de Produto


## 🗓 Informações Gerais

- **Nome do Projeto:** Divisor de Conta Inteligente

- **Cliente:** Público geral de bares, restaurantes e eventos

- **Responsável da Visão de Produto (PO):**
 Yanomã Fernandes Piont Konwski

- **Duração Total Estimada:** 
Total de 10 semanas

- **Período na Etapa de Design (estimado):** 
Total de 2 semanas

- **Período na Etapa de Desenvolvimento (estimado):** 
Total de 7 semanas

---

## ✅ Checklist de Entrada (para iniciar o projeto)

- [X] Reunião de Kickoff com o cliente realizada
- [X] Objetivo do projeto compreendido
- [ ] Tecnologias necessárias mapeadas
- [ ] Estimativa de esforço feita
- [ ] Capacidade do time verificada
- [ ] Escopo inicial aprovado pelo cliente

---

## 📤 Checklist de Saída (para encaminhar o projeto às próximas áreas)

- [X] Documento de Visão preenchido e validado
- [X] Matriz “é/não é/faz/não faz” definida
- [ ] Wireframes (se aplicável) finalizados
- [X] Epics e User Stories redigidas
- [X] Datas de entrada/saída em cada área definidas
- [X] Contrato e escopo revisados e claros
- [ ] Alinhamento com área de Design ou Desenvolvimento realizado

---

## 📘 Resumo do Projeto


**Descrição:**
Aplicativo de calculadora inteligente para organizar e dividir contas de consumo em bares, restaurantes e eventos. O usuário tira uma foto da conta, aprova a qualidade, e a IA identifica os itens e valores. Permite dividir cada produto entre pessoas, adicionar taxas (garçom, couvert fixo ou percentual), e exibe quanto cada pessoa deve pagar, detalhando os produtos consumidos. O app mantém histórico dos participantes para facilitar futuras divisões. Disponível para celulares Android na Play Store.


**Objetivos:**
- Automatizar o processo de divisão de contas, tornando-o rápido, justo e transparente.
- Reduzir erros e discussões ao dividir despesas em grupo.
- Facilitar o registro e seleção de pessoas que já dividiram contas anteriormente.


**Público-Alvo:**
Usuários de celulares Android que frequentam bares, restaurantes, eventos e desejam dividir contas de forma prática e inteligente com amigos, familiares ou colegas.


## 👤 Personas

Lucas, 28 anos, profissional de tecnologia, mora em uma grande cidade e tem vida social ativa. Costuma sair semanalmente com amigos para bares, restaurantes e eventos, onde o momento de dividir a conta sempre gera dúvidas e discussões. É organizado, gosta de praticidade e valoriza soluções digitais que economizam tempo e evitam conflitos.

Objetivo com o app: Utilizar o Divisor de Conta Inteligente para registrar facilmente o consumo de cada pessoa, dividir produtos e taxas de forma justa, visualizar o valor exato que cada um deve pagar e manter o histórico dos participantes para facilitar futuras saídas. Busca eliminar confusões, garantir transparência e tornar o momento de pagar a conta mais rápido e tranquilo.

**Principais Funcionalidades:**
Cadastro e login de usuários
Captura e aprovação de foto da conta
Reconhecimento automático dos itens e valores via IA
Divisão personalizada de produtos entre pessoas
Adição de taxas (garçom, couvert fixo ou percentual)
Cálculo do valor individual de cada pessoa
Exibição dos produtos consumidos por pessoa
Histórico de pessoas que já dividiram conta
Seleção rápida de participantes recorrentes

## 🔄 Fluxo de Uso

1. Usuário tira foto da conta e aprova a qualidade.
2. IA analisa a imagem e retorna lista de produtos e valores.
3. Usuário define quem pagará cada produto e insere participantes, podendo ser mais de uma pessoa por produto.
4. Adiciona taxas (garçom, couvert fixo ou percentual).
5. App calcula e exibe quanto cada pessoa deve pagar, detalhando os itens.
6. Participantes ficam salvos no histórico para facilitar futuras divisões.
 


## 🧩 Matriz "É / Não É / Faz / Não Faz"
<div align="center">

| Categoria  | Descrição |
|-----------|-----------|
| **É**     | Um aplicativo mobile Android disponível na Play Store, com uso de IA para reconhecimento de itens em contas |
| **Não É** | Um aplicativo para desktop ou iOS |
| **Faz**   | Organiza e divide contas, reconhece itens via IA, permite divisão personalizada, adiciona taxas, salva histórico de participantes |
| **Não Faz** | Não realiza pagamentos, não controla acesso físico, não faz integração bancária |

</div>

---

## 🧠 Matriz de Certezas, Suposições e Dúvidas



<div align="center">

| Tipo        | Descrição                                                                |
|-------------|--------------------------------------------------------------------------|
| **Certeza**   | O sistema deve permitir cadastro/login, reconhecimento de itens via IA, divisão personalizada de produtos, e histórico de participantes |
| **Suposição** | Usuários preferem dividir contas por produto e não por valor total; taxas variáveis são comuns em estabelecimentos |
| **Dúvida**    | Haverá demanda para integração com métodos de pagamento? |

</div>

---


## 🧱 Epics e User Stories

### 🔹 Epics

- Epic 1: Cadastro e gerenciamento de usuários
- Epic 2: Reconhecimento de itens e valores via IA
- Epic 3: Divisão personalizada de produtos e cálculo de valores
- Epic 4: Histórico de participantes e contas divididas

### 🔸 User Stories

#### US1
- **Usuário:** Como um usuário do app
- **Objetivo:** Quero tirar foto da conta e aprovar a qualidade
- **Justificativa:** Para garantir que a IA reconheça corretamente os itens e valores

#### US2
- **Usuário:** Como um usuário do app
- **Objetivo:** Quero dividir cada produto entre pessoas específicas
- **Justificativa:** Para que cada um pague apenas pelo que consumiu

#### US3
- **Usuário:** Como um usuário do app
- **Objetivo:** Quero adicionar taxas de garçom e couvert (fixo ou percentual)
- **Justificativa:** Para calcular corretamente o valor final de cada pessoa

#### US4
- **Usuário:** Como um usuário do app
- **Objetivo:** Quero visualizar o histórico de pessoas que já dividiram conta comigo
- **Justificativa:** Para facilitar futuras divisões sem precisar cadastrar novamente

---

## ⚙️ Requisitos Funcionais

RF01 - O sistema deve permitir cadastro e login de usuários
RF02 - O sistema deve permitir captura e aprovação de foto da conta
RF03 - O sistema deve reconhecer automaticamente itens e valores via IA
RF04 - O sistema deve permitir divisão personalizada de produtos entre participantes
RF05 - O sistema deve permitir adicionar taxas (garçom, couvert fixo ou percentual)
RF06 - O sistema deve calcular e exibir o valor individual de cada pessoa, detalhando os produtos
RF07 - O sistema deve manter histórico de participantes e contas divididas

## 📱 Responsividade


**O projeto será responsivo?**
- [x] Sim
- [ ] Não


**Se sim, até qual ponto?**
- [x] Mobile-first
- [x] Adaptável para tablets
- [ ] Desktops Grandes e notebooks menores
- [ ] Totalmente responsivo (desktop, tablet, mobile)

---

## 📌 Observações Finais


O aplicativo depende de conexão com a internet para funcionamento da IA de reconhecimento de itens. Não realiza pagamentos, apenas cálculo e organização das contas. Pode haver limitações em estabelecimentos com contas pouco legíveis ou fotos de baixa qualidade. Recomenda-se atenção à privacidade dos dados dos usuários e participantes.

Possível adicional, seria a possibilidade de exportar toda conta e divisão feita, além da imagem da conta.

---

