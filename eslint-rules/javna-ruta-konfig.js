// Jedini izvor za javne rute: koristi ga eslint.config.js (pravilo javna-ruta-uvozi) i testovi pravila.
'use strict';

// Javne rute (student na telefonu, bez basic-auth-a): smeju da zovu samo assets/* i api/public/*.
// Direktorijumi su u odnosu na src/app.
const JAVNI_FEATURE = ['features/upis', 'features/uzivo/javno', 'features/nalog'];

// Šta javni feature sme da uvozi pored sebe (putanje u odnosu na src/app, bez ekstenzije; "/**" = ceo direktorijum).
// Pravilo proverava samo DIREKTNE uvoze fajla, ne i ono što dozvoljeni modul uvozi dalje: svaki dodatak ovde mora
// svesno da se proveri (modul i njegovi uvozi ne smeju da zovu zaključan /api/*). Fail-closed: sve ostalo je greška.
const JAVNO_DOZVOLJENO = [
  'core/api/api-url',
  'core/api/api-error', // samo HttpContextToken i toApiError, bez store-a
  'core/layout/public-layout',
  'core/layout/okruzenje', // assets/env.json
  'shared/forms/form-error-banner',
  'shared/util/nazad', // čista funkcija, bez uvoza (bezbednoNazad: povratak posle prijave, spec prijave 5.1 tačka 6)
  // Indeks u tri dela (smer + broj + godina, 2026-10-22): forme `nalog` i `upis`. `shared/util/indeks` nema uvoza (čiste
  // funkcije i SMEROVI); `shared/forms/indeks-polja` uvozi samo @angular/core, @angular/forms, @angular/material
  // (form-field, input) i shared/util/indeks. Nijedan ne zove HTTP.
  'shared/util/indeks',
  'shared/forms/indeks-polja',
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
    // lenji import() u ui/formula-ucitavanje, iza komponente. Tranzitivno statički (stanje posle F3 i F2 fix kruga):
    // ui/formula-ucitavanje -> @angular/core i ui/cekanje-fontova (bez uvoza; samo document.fonts), pa ui/preducitavanje,
    // ui/teme i ui/platno-fontovi više ne stižu na telefon (e2e/lenji-formule.spec.ts to proverava nad buildom, jer pravilo
    // vidi samo direktne uvoze); nema HTTP klijenta ni /api/* van api/public/*. Lenji chunk:
    // ui/formula-markup -> mathlive/ssr, ui/formula-komande, ui/formula-sanitizer (bez uvoza).
    'features/uzivo/ui/tekst-formule.component', // formule $...$: uvozi @angular/core, ui/tekst-formule, ui/markdown i ui/formula-ucitavanje; mathlive/ssr samo dinamički (ui/formula-markup), stil i fontovi iz assets/mathlive/
    'features/uzivo/ui/tekst-formule', // čiste funkcije (tekstZaCitac), samo `import type` iz marked
    // Pravila polja Zadatka (studentski portal faze 2-3, 2026-10-29: izdvojeno iz javno/zadatak-unos i javno/odgovor-unos da
    // ih deli vežbanje na nalogu): čiste funkcije, uvozi samo ui/format (gore) i `import type` iz uzivo.models.
    'features/uzivo/ui/polja-zadatka',
  ],
  // Nalog studenta (spec prijave 10, 2026-10-20): stranice `nalog` i `nalog/moodle` zovu samo api/public/nalog/*,
  // api/public/lti/povezi i api/public/lti/povezivanje (ime Moodle naloga). Oba modula su proverena sa svim uvozima: nijedan ne zove HTTP, ne uvozi store, nastavnički API
  // ni ljusku.
  'features/nalog': [
    'shared/ui/confirm-dialog', // "Odjavi sve uređaje": uvozi samo @angular/core, @angular/material (button, dialog) i rxjs
    'shared/util/datum.pipe', // formatDatum (uređaji): uvozi samo @angular/core
    'shared/util/termin', // naredni časovi (dan, datum, vreme termina): bez ijednog uvoza
    // Studentski portal, faze 2 i 3 (2026-10-29; spec 12.9 tačke 8 i 11). Pregledano sa svim uvozima: nijedan ne zove HTTP
    // (slike samo `api/public/mediji/*` kroz `medijUrl`), ne uvozi nastavnički API, store, `pages/` ni `core/state`.
    // - vežbanje (strana `vezbanje`, `ui/vezbanje-unos`): ista polja kao na času. `ui/polja-zadatka` je gore (uzivo/javno);
    //   `ui/tekst-formule.component` i `ui/tekst-formule` su isti moduli kao za telefon na času (formule $...$, lenji
    //   `mathlive/ssr` samo kroz `ui/formula-ucitavanje`); `ui/format` su čiste funkcije bez uvoza.
    'features/uzivo/ui/polja-zadatka',
    'features/uzivo/ui/tekst-formule.component',
    'features/uzivo/ui/tekst-formule',
    'features/uzivo/ui/format',
    // - pregled prezentacije (samo lenja strana `prezentacija/:id`, nikad ljuska ni rute): projektorski renderer slajda.
    //   `ui/slajd-prikaz.component` uvozi samo `ui/*` (platno, pločice i rezultat pitanja, tajmer, formule, markdown, teme,
    //   zadatak-prikaz) i `data-access/{sat,uzivo.models,platno.models,platno-koraci}` (čisti tipovi i funkcije); `mathlive/ssr`
    //   samo lenjo (`ui/formula-ucitavanje`), editor, `fflate`, `pdfjs-dist` i ProseMirror nikad. `ui/slajd-za-prikaz` su samo
    //   tipovi (ulaz renderera bez beleški).
    'features/uzivo/ui/slajd-prikaz.component',
    'features/uzivo/ui/slajd-za-prikaz',
  ],
};

// npm paketi koje javni feature ne sme da uvozi (ni podputanje, npr. `fflate/esm`; "@scope/*" = ceo scope). Paketi su
// inače slobodni (nemaju pristup `/api/*`), ali biblioteke editora i uvoza graditelja slajdova (uvoz PPTX-a i PDF-a,
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
