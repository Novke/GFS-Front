// @ts-check
const eslint = require("@eslint/js");
const { defineConfig } = require("eslint/config");
const tseslint = require("typescript-eslint");
const angular = require("angular-eslint");
const javnaRutaUvozi = require("./eslint-rules/javna-ruta-uvozi");
const { JAVNI_FEATURE, JAVNO_DOZVOLJENO } = require("./eslint-rules/javna-ruta-konfig");

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
  // Javne rute: zabrana uvoza svega sto zove zakljucan /api/* (pravilo i obrazlozenje: eslint-rules/javna-ruta-uvozi.js).
  ...JAVNI_FEATURE.map((feature) => ({
    files: [`src/app/${feature}/**/*.ts`],
    plugins: { gfs: { rules: { "javna-ruta-uvozi": javnaRutaUvozi } } },
    rules: { "gfs/javna-ruta-uvozi": ["error", { feature, dozvoljeno: JAVNO_DOZVOLJENO }] },
  })),
  // Stari ekrani, zamenjuju se u F2. Pravila ostaju ukljucena za sav novi kod; ovde su isključena samo za
  // postojece fajlove sa prekrsajima. Kada F2 zameni ekran, fajl se brise i izlazi sa ove liste.
  // OnPush: komponente su namerno na Eager (Angular 22 migracija, zone.js ostaje) do F2 (OnPush + signali).
  {
    files: [
  "src/app/components/select-base.component.ts",
  "src/app/domaci/domaci-list/domaci-list.component.ts",
  "src/app/domaci/domaci-select/domaci-select.component.ts",
  "src/app/domaci/evidentiranje/evidentiranje.component.ts",
  "src/app/domaci/nov-domaci/nov-domaci.component.ts",
  "src/app/domaci/pregled-domaceg/pregled-domaceg.component.ts",
  "src/app/grupa/grupa-details/grupa-details.component.ts",
  "src/app/grupa/grupe/grupe.component.ts",
  "src/app/home/home.component.ts",
  "src/app/models/model.ts",
  "src/app/ocenjivanje/ocenjivanje-select.component.ts",
  "src/app/onboarding/onboarding-prijave/onboarding-prijave.component.ts",
  "src/app/onboarding/onboarding-qr/onboarding-qr.component.ts",
  "src/app/predavanje/live-predavanje/live-predavanje.component.ts",
  "src/app/predavanje/predavanje-list/predavanje-list.component.ts",
  "src/app/predavanje/predavanje-select/predavanje-select.component.ts",
  "src/app/predavanje/predavanje.service.ts",
  "src/app/predavanje/pregled-predavanja/pregled-predavanja.component.ts",
  "src/app/predavanje/start-predavanje/start-predavanje.component.ts",
  "src/app/student/student-details/student-details.component.ts",
  "src/app/student/student-predmet/student-predmet.component.ts",
  "src/app/test/nov-test/nov-test.component.ts",
  "src/app/test/test-evidentiranje/test-evidentiranje.component.ts",
  "src/app/test/test-list/test-list.component.ts",
  "src/app/test/test-pregled/test-pregled.component.ts",
  "src/app/test/test-select/test-select.component.ts"
    ],
    rules: {
      "@angular-eslint/prefer-on-push-component-change-detection": "off",
      "@typescript-eslint/no-inferrable-types": "off",
      "@typescript-eslint/no-wrapper-object-types": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/consistent-indexed-object-style": "off",
      "no-var": "off",
    },
  },
  // Stari sabloni (pristupacnost), zamenjuju se u F2.
  {
    files: [
  "src/app/domaci/evidentiranje/evidentiranje.component.html",
  "src/app/domaci/nov-domaci/nov-domaci.component.html",
  "src/app/ocenjivanje/ocenjivanje-select.component.html",
  "src/app/predavanje/live-predavanje/live-predavanje.component.html",
  "src/app/predavanje/pregled-predavanja/pregled-predavanja.component.html",
  "src/app/student/student-predmet/student-predmet.component.html",
  "src/app/test/test-evidentiranje/test-evidentiranje.component.html"
    ],
    rules: {
      "@angular-eslint/template/label-has-associated-control": "off",
      "@angular-eslint/template/click-events-have-key-events": "off",
      "@angular-eslint/template/interactive-supports-focus": "off",
    },
  },
]);
