---
sidebar_position: 2
---

# Visão do produto

**Produto:** Por Partes

**Plataforma principal atual:** Android

**Atualizado em:** 25 de agosto de 2026

## Problema

Dividir uma conta em grupo costuma exigir transcrever itens, lembrar quem consumiu cada coisa, distribuir taxas e conferir cálculos. Esse processo é demorado, sujeito a erro e pode gerar atrito justamente no fim de uma experiência compartilhada.

## Proposta de valor

O Por Partes organiza a conta em um fluxo único: registrar os itens manualmente ou a partir de uma imagem, revisar os dados, adicionar participantes, atribuir os consumos e visualizar quanto cada pessoa deve pagar.

A IA reduz trabalho de digitação, mas não substitui o controle do usuário. Todo resultado de leitura deve poder ser revisado, corrigido ou abandonado em favor da entrada manual.

## Público principal

- grupos em restaurantes, bares e eventos;
- pessoas organizando despesas de viagens ou encontros;
- usuário responsável por fechar uma conta e explicar os valores ao grupo;
- pessoas que precisam dividir quantidades ou itens por medidas fracionárias.

## Princípios do produto

1. **Transparência:** cada total deve ser explicável pelos itens, divisões e taxas.
2. **Controle do usuário:** a leitura automática sempre passa por revisão.
3. **Caminho manual preservado:** indisponibilidade de IA ou saldo nunca impede uma divisão manual.
4. **Recuperação clara:** erros devem indicar o que ocorreu e qual ação é possível.
5. **Acessibilidade:** tema e tamanho de fonte devem ser respeitados em todo o fluxo.
6. **Monetização proporcional:** cobranças e anúncios não podem surpreender nem bloquear um resultado já produzido.

## Capacidades implementadas

### Conta e acesso

- cadastro e login com e-mail e senha;
- login nativo com Google;
- renovação e revogação de sessão;
- recuperação de senha;
- edição de perfil, avatar e exclusão da própria conta.

### Criação e leitura

- criação manual de conta;
- captura pela câmera ou seleção da galeria;
- envio direto de imagem por URL pré-assinada;
- processamento assíncrono de OCR;
- estados de processamento, revisão e falha;
- retentativa de leitura.

### Divisão

- edição, inclusão e remoção de itens;
- quantidades inteiras ou fracionárias com unidades de medida;
- participantes por conta;
- atribuição de valores de itens aos participantes;
- taxas percentuais e fixas;
- resumo final e histórico de contas;
- duplicação de uma conta existente.

### Preferências

- tema claro e escuro;
- ajuste de tamanho de fonte;
- telas de informações, segurança e acessibilidade.

## Próxima fase

A próxima fase tem horizonte máximo de 12 semanas e equipe mínima de seis pessoas. Ela está organizada em sete épicos:

- qualidade, bugs e observabilidade;
- confiabilidade e custo do OCR;
- cota gratuita e ledger de créditos;
- compra avulsa de créditos pela Google Play;
- anúncios responsáveis e privacidade;
- otimização de aplicativo e backend;
- estabilização e lançamento gradual.

O detalhamento, a capacidade e os critérios de aceite estão no [planejamento de épicos](../dev/planejamento-epicos-nova-fase-2026.md).

## Fora do escopo atual

- assinatura recorrente;
- pagamentos entre participantes;
- transferência ou liquidação do valor da conta;
- marketplace ou comissão sobre pagamentos do restaurante;
- painel web para usuários finais;
- reconhecimento sem possibilidade de revisão;
- anúncios ou créditos ativados antes da conclusão dos épicos correspondentes.

## Indicadores de valor

O produto deve acompanhar, no mínimo:

- percentual de contas iniciadas e finalizadas;
- tempo para concluir uma divisão;
- uso e sucesso da leitura automática;
- quantidade de correções após OCR;
- falhas e abandono por etapa;
- recorrência de uso e contas por usuário;
- divergências entre total da conta e soma distribuída;
- acessibilidade e estabilidade percebida.

As metas numéricas da nova fase serão definidas após o baseline da primeira sprint.
