// Jedini izvor za javne rute: koristi ga eslint.config.js (pravilo javna-ruta-uvozi) i testovi pravila.
'use strict';

// Javne rute (student na telefonu, bez basic-auth-a): smeju da zovu samo assets/* i api/public/*.
// Direktorijumi su u odnosu na src/app.
const JAVNI_FEATURE = ['features/upis', 'features/uzivo/javno'];

// Šta javni feature sme da uvozi pored sebe (putanje u odnosu na src/app, bez ekstenzije; "/**" = ceo direktorijum).
// Pravilo proverava samo DIREKTNE uvoze fajla, ne i ono što dozvoljeni modul uvozi dalje: svaki dodatak ovde mora
// svesno da se proveri (modul i njegovi uvozi ne smeju da zovu zaključan /api/*). Fail-closed: sve ostalo je greška.
const JAVNO_DOZVOLJENO = [
  'core/api/api-url',
  'core/api/api-error', // samo HttpContextToken i toApiError, bez store-a
  'core/layout/public-layout',
  'core/layout/okruzenje', // assets/env.json
  'shared/forms/form-error-banner',
];

// Dodatak po javnom feature-u (važi samo za njega): moduli iz istog feature-a van javnog dela. Svaki je proveren sa
// svim svojim uvozima (Task 30, 2026-10-09): nijedan ne zove HTTP osim `api/public/*`, nijedan ne uvozi nastavnički
// API (`prezentacije.api`, `izvodjenja.api`), store-ove (`izvodjenje.store`, `editor.store`, `core/state`) ni `pages/`.
const DOZVOLJENO_PO_FEATURE = {
  'features/uzivo/javno': [
    'features/uzivo/uzivo-putanje', // samo string konstante, bez uvoza
    'features/uzivo/data-access/uzivo.models', // tipovi + medijUrl ('api/public/mediji/...'), bez uvoza
    'features/uzivo/data-access/stomp', // RxStomp na 'api/ws' | 'api/public/ws' (javno koristi samo api/public/ws)
    'features/uzivo/data-access/sat', // čista klasa, bez uvoza
    'features/uzivo/data-access/razlog-greske', // samo HttpErrorResponse (tip), bez HTTP poziva
    'features/uzivo/ui/format', // čiste funkcije, bez uvoza
    'features/uzivo/ui/markdown', // paket marked i ui/tekst-formule (markdownSaFormulama; tekst-formule ima samo `import type` iz marked)
    'features/uzivo/ui/opcija-oblik', // komponenta, samo @angular/core
    'features/uzivo/ui/rang-lista.component', // uvozi samo uzivo.models i ui/format (oba gore)
    'features/uzivo/ui/tajmer.component', // uvozi samo data-access/sat (gore)
    'features/uzivo/lazni-sat.testing', // samo za specove (vitest), bez uvoza iz src/app
    // Formule $...$ na telefonu (faza 5, odluka 4; pregled uvoza 2026-10-14, F3). Javni fajl ne uvozi ui/formula-markup,
    // ui/formula-prikaz.component ni ui/formula-ucitavanje direktno (testovi pravila to drže): put do mathlive/ssr je samo
    // lenji import() u ui/formula-ucitavanje, iza komponente. Tranzitivno statički: ui/formula-ucitavanje -> ui/preducitavanje
    // (`import type` modela, uzivo.models/medijUrl, ui/platno-fontovi, ui/teme, ui/tekst-formule): podaci, `new Image()` i
    // document.fonts, bez HTTP klijenta i bez /api/* van api/public/*; ui/formula-markup -> mathlive/ssr, ui/formula-komande,
    // ui/formula-sanitizer (bez uvoza), samo u lenjom chunk-u.
    'features/uzivo/ui/tekst-formule.component', // formule $...$: uvozi @angular/core, ui/tekst-formule, ui/markdown i ui/formula-ucitavanje; mathlive/ssr samo dinamički (ui/formula-markup), stil i fontovi iz assets/mathlive/
    'features/uzivo/ui/tekst-formule', // čiste funkcije (tekstZaCitac), samo `import type` iz marked
  ],
};

// npm paketi koje javni feature ne sme da uvozi (ni podputanje, npr. `fflate/esm`; "@scope/*" = ceo scope). Paketi su
// inače slobodni (nemaju pristup `/api/*`), ali biblioteke editora i uvoza graditelja slajdova (uvoz PPTX-a,
// ProseMirror, MathLive) su teške i nastavničke: idu ovde da nikad ne uđu u javni chunk studenta.
// Pravilo uzima ovaj spisak i kad mu se ne prosledi opcija (fail-closed).
const ZABRANJENI_PAKETI_JAVNO = [
  'fflate', // uvoz PPTX-a (features/uzivo/uvoz-pptx), samo dinamički iz nastavničkog dijaloga
  // Editor platna, faza 4: samo u lenjom chunk-u `editor-platna/` (uređivač teksta, F11-F13).
  'prosemirror-model',
  'prosemirror-state',
  'prosemirror-view',
  'prosemirror-transform',
  'prosemirror-commands',
  'prosemirror-keymap',
  'prosemirror-history',
  // Formule, faza 4 (F15): `mathlive/ssr` samo kroz lenji `ui/formula-markup` (projektor, konzola, editor, od faze 5 i
  // telefon preko `ui/tekst-formule.component`), ceo `mathlive` samo u dijalogu formule editora (F16). Javni fajl nikad
  // ne uvozi paket direktno (ni `mathlive/ssr`, podputanja).
  'mathlive',
  'pdfjs-dist', // uvoz PDF-a (features/uzivo/uvoz-pdf), samo dinamički iz nastavničkog dijaloga (faza 5)
];

/** Ukupan spisak dozvoljenog za javni feature: zajednički plus njegov dodatak. */
function dozvoljenoZa(feature) {
  return [...JAVNO_DOZVOLJENO, ...(DOZVOLJENO_PO_FEATURE[feature] ?? [])];
}

module.exports = { JAVNI_FEATURE, JAVNO_DOZVOLJENO, DOZVOLJENO_PO_FEATURE, ZABRANJENI_PAKETI_JAVNO, dozvoljenoZa };
