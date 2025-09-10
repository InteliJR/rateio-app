import type { ReactNode } from "react";
import clsx from "clsx";
import Heading from "@theme/Heading";
import styles from "./styles.module.css";

type FeatureItem = {
  title: string;
  description: ReactNode;
};

const FeatureList: FeatureItem[] = [
  {
    title: "Inovação",
    description: (
      <>
        Buscamos constantemente soluções inovadoras, desafiando o status quo e
        promovendo a criatividade.
      </>
    ),
  },
  {
    title: "Inconformismo",
    description: (
      <>
        Abraçamos desafios com coragem, e nunca nos conformamos com nosso estado
        atual, buscando crescer cada vez mais.
      </>
    ),
  },
  {
    title: "Compromisso",
    description: (
      <>
        Somos dedicados ao sucesso, comprometendo-nos com a excelência em cada
        projeto e ação.
      </>
    ),
  },
  {
    title: "Protagonismo",
    description: (
      <>
        Assumimos a responsabilidade pelo nosso crescimento e impacto, buscando
        impulsionar a nossa organização e o ecossistema ao redor.
      </>
    ),
  },
];

function Feature({ title, description }: FeatureItem) {
  return (
    <div className={styles.feature}>
      <div className="text--center padding-horiz--md">
        <Heading as="h2">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className={styles.featureGrid}>
        {FeatureList.map((props, idx) => (
          <Feature key={idx} {...props} />
        ))}
      </div>
    </section>
  );
}
