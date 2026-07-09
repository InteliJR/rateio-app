import { themes as prismThemes } from "prism-react-renderer";
import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";

const config: Config = {
  title: "Por Partes",
  tagline: "Divida contas com leitura automática de itens",
  favicon: "img/favicon.ico",

  url: "https://intelijr.github.io",
  baseUrl: "/rateio-app/",
  organizationName: "InteliJR",
  projectName: "rateio-app",
  trailingSlash: false,

  onBrokenLinks: "throw",
  onBrokenMarkdownLinks: "warn",

  i18n: {
    defaultLocale: "pt-br",
    locales: ["pt-br"],
  },

  presets: [
    [
      "classic",
      {
        docs: false,
        blog: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    navbar: {
      title: "Por Partes",
      items: [
        {
          to: "/",
          position: "left",
          label: "Início",
        },
        {
          to: "/politica-de-privacidade",
          position: "left",
          label: "Política de Privacidade",
        },
        {
          to: "/termos-de-uso",
          position: "left",
          label: "Termos de Uso",
        },
        {
          to: "/excluir-conta",
          position: "left",
          label: "Exclusão de Conta",
        },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Informações legais",
          items: [
            {
              label: "Política de Privacidade",
              to: "/politica-de-privacidade",
            },
            {
              label: "Termos de Uso",
              to: "/termos-de-uso",
            },
            {
              label: "Exclusão de Conta",
              to: "/excluir-conta",
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Por Partes.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
