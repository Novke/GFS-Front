// @ts-check
const eslint = require("@eslint/js");
const { defineConfig } = require("eslint/config");
const tseslint = require("typescript-eslint");
const angular = require("angular-eslint");
const javnaRutaUvozi = require("./eslint-rules/javna-ruta-uvozi");
const graniceFeaturea = require("./eslint-rules/granice-featurea");
const { JAVNI_FEATURE, dozvoljenoZa } = require("./eslint-rules/javna-ruta-konfig");

/** Sopstvena pravila (jedan objekat plugina: flat config ne dozvoljava dva razlicita plugina istog imena). */
const gfs = { rules: { "javna-ruta-uvozi": javnaRutaUvozi, "granice-featurea": graniceFeaturea } };

module.exports = defineConfig([
  {
    files: ["**/*.ts"],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      "@angular-eslint/directive-selector": [
        "error",
        {
          type: "attribute",
          prefix: "app",
          style: "camelCase",
        },
      ],
      "@angular-eslint/component-selector": [
        "error",
        {
          type: "element",
          prefix: "app",
          style: "kebab-case",
        },
      ],
    },
  },
  {
    files: ["**/*.html"],
    extends: [
      angular.configs.templateRecommended,
      angular.configs.templateAccessibility,
    ],
    rules: {},
  },
  // Granice: feature ne uvozi tudji data-access, core/ i shared/ ne uvoze features/ (eslint-rules/granice-featurea.js).
  {
    files: ["src/app/**/*.ts"],
    plugins: { gfs },
    rules: { "gfs/granice-featurea": "error" },
  },
  // Javne rute: zabrana uvoza svega sto zove zakljucan /api/* (pravilo i obrazlozenje: eslint-rules/javna-ruta-uvozi.js).
  ...JAVNI_FEATURE.map((feature) => ({
    files: [`src/app/${feature}/**/*.ts`],
    plugins: { gfs },
    rules: { "gfs/javna-ruta-uvozi": ["error", { feature, dozvoljeno: dozvoljenoZa(feature) }] },
  })),
]);
