// Jedini izvor za javne rute: koristi ga eslint.config.js (pravilo javna-ruta-uvozi) i testovi pravila.
'use strict';

// Javne rute (student na telefonu, bez basic-auth-a): smeju da zovu samo assets/env.json i api/public/*.
// Direktorijumi su u odnosu na src/app; novi javni feature (uzivo/javno) je ovde od početka.
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

module.exports = { JAVNI_FEATURE, JAVNO_DOZVOLJENO };
