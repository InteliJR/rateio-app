---
title: Política de Privacidade
permalink: /politica-de-privacidade/
---

# Política de Privacidade

Última atualização: 08 de julho de 2026

Esta Política de Privacidade descreve como o aplicativo **Por Partes** coleta, usa, armazena, protege e exclui dados dos usuários.

O Por Partes é um aplicativo para registrar notas fiscais/contas, extrair itens por OCR e ajudar usuários a dividir valores entre participantes.

## 1. Responsável pelo app

Responsável pelo tratamento de dados e pela publicação na Google Play: MarielePS

Nome legal/completo do responsável: MARIELE PEDRO DE SOUZA

Nome comercial/projeto: Por Partes

Pacote Android: `com.intelijunior.porpartes`

Contato de privacidade: porpartes.app@gmail.com

Desenvolvimento técnico do aplicativo: Inteli Júnior

A Inteli Júnior atuou no desenvolvimento técnico do aplicativo. A responsabilidade pela publicação, operação, atendimento aos usuários, manutenção da Política de Privacidade e decisões sobre tratamento de dados pertence ao responsável indicado acima.

## 2. Dados que coletamos

O Por Partes pode coletar e processar os seguintes dados, conforme o uso do app:

- Dados de conta: nome, e-mail, identificador interno do usuário, data de criação e data de atualização da conta.
- Dados de autenticação: senha protegida por hash no backend, tokens de sessão, refresh tokens e tokens revogados.
- Dados de login com Google: identificador Google, e-mail, nome, foto de perfil do Google e confirmação de e-mail verificado, quando o usuário escolhe entrar com Google.
- Foto de perfil: imagem enviada pelo usuário ou foto obtida do perfil Google, quando aplicável.
- Imagens de notas fiscais/contas: fotos capturadas pela câmera ou selecionadas da galeria.
- Dados extraídos por OCR: texto bruto extraído da imagem, nome do estabelecimento, itens, quantidades, preços, taxas, descontos e total.
- Dados de divisão de conta: nomes de participantes, itens atribuídos a participantes, valores individuais, taxas e status da conta.
- Dados de recuperação de senha: e-mail informado, código/token temporário de redefinição e data de expiração.
- Dados técnicos básicos: registros de requisições, erros e métricas operacionais necessários para segurança, estabilidade, prevenção de abuso e diagnóstico do serviço.

O Por Partes não solicita acesso a localização, contatos, SMS, chamadas ou microfone.

## 3. Permissões do dispositivo

O app pode solicitar as seguintes permissões:

- Câmera: usada para fotografar notas fiscais/contas.
- Fotos/galeria: usada quando o usuário escolhe uma imagem existente para enviar ao app.

Essas permissões são usadas somente para funcionalidades iniciadas pelo usuário. O Por Partes não captura imagens em segundo plano.

## 4. Como usamos os dados

Usamos os dados para:

- Criar, autenticar e manter a conta do usuário.
- Permitir login local e login com Google.
- Permitir redefinição de senha por e-mail.
- Receber e armazenar imagens de notas fiscais/contas enviadas pelo usuário.
- Processar imagens por OCR para extrair itens, valores e totais.
- Permitir revisão, correção e edição dos itens extraídos.
- Permitir divisão de contas entre participantes.
- Exibir histórico de contas do próprio usuário.
- Proteger a segurança do app, prevenir abuso e resolver problemas técnicos.
- Cumprir obrigações legais, regulatórias ou solicitações válidas de autoridades, quando aplicável.

## 5. Compartilhamento e processamento por terceiros

Não vendemos dados pessoais.

Podemos usar provedores de serviço para operar o app. Esses provedores processam dados somente para viabilizar as funcionalidades descritas nesta política:

- Hospedagem do backend/API: VERCEL.
- Banco de dados PostgreSQL: SUPABASE.
- Armazenamento de imagens: Amazon S3.
- OCR/processamento de imagem: OpenAI API, usada para analisar imagens de notas fiscais/contas e retornar dados estruturados.
- Login com Google: Google Sign-In/Google OAuth, quando o usuário escolhe entrar com a conta Google.
- E-mail transacional: GMAIL, usado para enviar códigos de recuperação de senha.

Esses provedores podem processar dados em servidores localizados fora do país do usuário, conforme suas próprias infraestruturas e políticas.

## 6. Dados de terceiros inseridos pelo usuário

Ao criar uma divisão, o usuário pode inserir nomes de participantes. Esses nomes são tratados como dados fornecidos pelo próprio usuário para organizar a divisão da conta.

O usuário deve evitar inserir informações desnecessárias ou sensíveis de outras pessoas.

## 7. Segurança

Adotamos medidas técnicas e organizacionais para proteger os dados, incluindo:

- Comunicação com a API por HTTPS em produção.
- Autenticação por tokens.
- Armazenamento de senhas com hash seguro no backend.
- Controle de acesso para que cada usuário acesse apenas seus próprios dados.
- Armazenamento de imagens em chaves associadas ao usuário.
- Limitação de tentativas em rotas sensíveis, como login e OCR.
- Logs de produção no app sem exposição de tokens ou payloads sensíveis.

Apesar dessas medidas, nenhum sistema é completamente imune a riscos. Em caso de incidente relevante de segurança, adotaremos as medidas cabíveis conforme a legislação aplicável.

## 8. Retenção de dados

Mantemos os dados enquanto a conta do usuário estiver ativa ou enquanto forem necessários para fornecer as funcionalidades do Por Partes.

Em geral:

- Dados de perfil, contas, itens, participantes, divisões, taxas, imagens e OCR ficam associados à conta do usuário.
- Códigos de recuperação de senha expiram em 1 hora.
- Dados técnicos e registros operacionais podem ser mantidos pelo período necessário para segurança, prevenção de abuso, diagnóstico e cumprimento de obrigações legais.
- Backups e registros de infraestrutura podem permanecer por 1 dia antes da remoção definitiva, conforme a política dos provedores utilizados.

## 9. Exclusão de conta e dados

O usuário pode excluir sua conta diretamente no app:

1. Abra o app Por Partes.
2. Acesse **Perfil**.
3. Toque em **Segurança**.
4. Toque em **Excluir conta**.
5. Confirme a exclusão.

Ao excluir a conta pelo app, apagamos os dados associados à conta, incluindo perfil, contas, itens, participantes, divisões, taxas, imagens enviadas, jobs de OCR e tokens associados, exceto quando houver necessidade de retenção por obrigação legal, segurança, prevenção de fraude, resolução de disputas ou cumprimento regulatório.

Se o usuário não conseguir acessar o app, também pode iniciar uma solicitação de exclusão pela página:

https://intelijr.github.io/rateio-app/excluir-conta

ou pelo e-mail:

porpartes.app@gmail.com

## 10. Direitos do usuário

Conforme a legislação aplicável, incluindo a Lei Geral de Proteção de Dados do Brasil (LGPD), o usuário pode solicitar:

- Confirmação sobre o tratamento de seus dados.
- Acesso aos dados pessoais.
- Correção de dados incompletos, inexatos ou desatualizados.
- Exclusão de dados pessoais, quando aplicável.
- Informações sobre compartilhamento com terceiros.
- Revogação de consentimento, quando o tratamento depender de consentimento.

Para exercer esses direitos, entre em contato pelo e-mail:

porpartes.app@gmail.com

## 11. Crianças e adolescentes

O Por Partes não é direcionado a crianças. O app é destinado a usuários capazes de gerenciar contas e despesas pessoais.

Se identificarmos uso por criança sem autorização adequada, poderemos remover a conta e os dados associados.

## 12. Anúncios e venda de dados

O Por Partes não vende dados pessoais.

O Por Partes não exibe anúncios.

## 13. Alterações nesta política

Podemos atualizar esta Política de Privacidade para refletir mudanças no app, nos provedores utilizados, em requisitos legais ou em práticas de segurança.

A versão mais recente estará sempre disponível nesta página. Quando mudanças relevantes forem feitas, poderemos informar os usuários por meio do app ou por outro canal adequado.

## 14. Contato

Para dúvidas, solicitações ou reclamações sobre privacidade e proteção de dados:

Responsável pelo app: MarielePS

porpartes.app@gmail.com

Desenvolvimento técnico: Inteli Júnior
