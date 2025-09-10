import type { ReactNode } from "react";
import clsx from "clsx";
import Link from "@docusaurus/Link";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import Layout from "@theme/Layout";
import HomepageFeatures from "@site/src/components/HomepageFeatures";
import Heading from "@theme/Heading";

import styles from "./index.module.css";

import { useColorMode } from "@docusaurus/theme-common";
import useBaseUrl from "@docusaurus/useBaseUrl";

function HomepageHeader() {
  const { siteConfig } = useDocusaurusContext();
  const { colorMode } = useColorMode();

  const isDarkTheme = colorMode === "dark";

  const logoSrc = isDarkTheme
    ? useBaseUrl("/img/ijLogoDark.png")
    : useBaseUrl("/img/ijLogoLight.png");

  return (
    <header
      className={clsx(
        "hero",
        styles.heroBanner,
        isDarkTheme ? styles.darkGradient : styles.lightGradient
      )}
    >
      <div className="container">
        <div className={styles.headerContent}>
          <div className={styles.textContent}>
            <Heading as="h1" className="hero__title">
              {siteConfig.title}
            </Heading>
            <p className="hero__subtitle">{siteConfig.tagline}</p>
            <div className={styles.buttons}>
              <Link
                className={clsx(
                  styles.docButton,
                  isDarkTheme ? styles.darkButton : styles.lightButton
                )}
                to="/docs/intro"
              >
                Acesse a documentação
              </Link>
            </div>
          </div>
          <div className={styles.logoContent}>
            <img
              src={logoSrc}
              alt="Logo da Inteli Junior"
              className={styles.logoImage}
            />
          </div>
        </div>
      </div>
    </header>
  );
}

export default function Home(): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout
      title={`${siteConfig.title}`}
      description="Description will go into a meta tag in <head />"
    >
      <HomepageHeader />
      <main>
        <HomepageFeatures />
      </main>
    </Layout>
  );
}
