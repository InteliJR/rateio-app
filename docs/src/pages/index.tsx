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
      description="Informações legais e suporte do aplicativo Por Partes"
    >
      <main className={styles.main}>
        <section className={clsx("hero", styles.heroBanner)}>
          <div className="container">
            <div className={styles.content}>
              <Heading as="h1" className="hero__title">
                Por Partes
              </Heading>
              <p className="hero__subtitle">
                Informações legais e suporte para usuários do aplicativo.
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
                  to="/excluir-conta"
                >
                  Exclusão de Conta
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
