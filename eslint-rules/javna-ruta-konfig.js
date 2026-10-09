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
    'features/uzivo/ui/markdown', // samo paket marked
    'features/uzivo/ui/opcija-oblik', // komponenta, samo @angular/core
    'features/uzivo/ui/rang-lista.component', // uvozi samo uzivo.models i ui/format (oba gore)
    'features/uzivo/ui/tajmer.component', // uvozi samo data-access/sat (gore)
    'features/uzivo/lazni-sat.testing', // samo za specove (vitest), bez uvoza iz src/app
  ],
};

/** Ukupan spisak dozvoljenog za javni feature: zajednički plus njegov dodatak. */
function dozvoljenoZa(feature) {
  return [...JAVNO_DOZVOLJENO, ...(DOZVOLJENO_PO_FEATURE[feature] ?? [])];
}

module.exports = { JAVNI_FEATURE, JAVNO_DOZVOLJENO, DOZVOLJENO_PO_FEATURE, dozvoljenoZa };
