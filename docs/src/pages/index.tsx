import type { ReactNode } from "react";
import clsx from "clsx";
import Link from "@docusaurus/Link";
import Layout from "@theme/Layout";
import Heading from "@theme/Heading";

import styles from "./index.module.css";

export default function Home(): ReactNode {
  return (
    <Layout
      title="Por Partes"
      description="Por Partes ajuda usuários a dividir contas com leitura automática de itens."
    >
      <main className={styles.main}>
        <section className={clsx("hero", styles.heroBanner)}>
          <div className="container">
            <div className={styles.content}>
              <Heading as="h1" className="hero__title">
                Por Partes
              </Heading>
              <p className="hero__subtitle">
                Divida contas com leitura automática de itens, revisão manual e distribuição de valores entre participantes.
              </p>
              <p className={styles.summary}>
                O Por Partes é um aplicativo Android para organizar despesas compartilhadas em restaurantes, bares,
                viagens e outras situações em que uma conta precisa ser dividida de forma simples.
              </p>
              <div className={styles.buttons}>
                <Link
                  className={clsx("button button--primary", styles.button)}
                  to="/politica-de-privacidade"
                >
                  Política de Privacidade
                </Link>
                <Link
                  className={clsx("button button--secondary", styles.button)}
                  to="/termos-de-uso"
                >
                  Termos de Uso
                </Link>
                <Link
                  className={clsx("button button--secondary", styles.button)}
                  to="/excluir-conta"
                >
                  Exclusão de Conta
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <div className="container">
            <Heading as="h2">O que o app faz</Heading>
            <div className={styles.grid}>
              <article className={styles.card}>
                <Heading as="h3">Leitura de contas</Heading>
                <p>
                  Permite fotografar ou selecionar uma imagem de uma nota ou conta para identificar itens e valores.
                </p>
              </article>
              <article className={styles.card}>
                <Heading as="h3">Revisão pelo usuário</Heading>
                <p>
                  Os dados identificados podem ser revisados e ajustados antes da divisão, mantendo o usuário no controle.
                </p>
              </article>
              <article className={styles.card}>
                <Heading as="h3">Divisão organizada</Heading>
                <p>
                  Ajuda a distribuir itens, taxas e valores entre participantes e mantém o histórico das contas.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className={clsx(styles.section, styles.supportSection)}>
          <div className="container">
            <Heading as="h2">Suporte e informações legais</Heading>
            <p>
              Para dúvidas sobre o aplicativo, privacidade, tratamento de dados ou exclusão de conta, entre em contato
              pelo e-mail <a href="mailto:porpartes.app@gmail.com">porpartes.app@gmail.com</a>.
            </p>
            <p>
              Responsável pela publicação e operação do aplicativo: MarielePS. Desenvolvimento técnico: Inteli Júnior.
            </p>
          </div>
        </section>
      </main>
    </Layout>
  );
}
