// Granice između feature-a: `src/app/features/<x>` ne uvozi `features/<y>/data-access/**` (tuđe API klijente, modele i
// store-ove), a `core/` i `shared/` ne uvoze ništa iz `features/`. Ono što koristi više feature-a živi u `core/api`
// (API klijenti i DTO-i), `core/state` (zajednički store-ovi, npr. liste za hubove) ili `shared/`.
//
// Putanja se razrešava kao u `javna-ruta-uvozi.js` (relativni uvozi i `src/app/...`), pa način pisanja uvoza nije bitan.
// Uvozi čiji se izvor ne vidi iz koda (dinamički `import(x)`) se ovde ne proveravaju: to hvata pravilo javne rute
// tamo gde je bitno, a u ostatku aplikacije dinamičkih uvoza nema.
'use strict';

const path = require('node:path');

const KOREN_PROJEKTA = path.resolve(__dirname, '..');
const APP = path.join(KOREN_PROJEKTA, 'src', 'app');

function razresi(izvor, fajl) {
  return izvor.startsWith('src/') ? path.resolve(KOREN_PROJEKTA, izvor) : path.resolve(path.dirname(fajl), izvor);
}

/** Putanja u odnosu na `src/app` (kose crte); van `src/app` počinje sa `../`. */
function relativnoUApp(apsolutna) {
  return path.relative(APP, apsolutna).split(path.sep).join('/');
}

function izvorIzCvora(cvor) {
  if (!cvor) {
    return null;
  }
  if (cvor.type === 'Literal') {
    return typeof cvor.value === 'string' ? cvor.value : null;
  }
  if (cvor.type === 'TemplateLiteral' && cvor.expressions.length === 0 && cvor.quasis.length === 1) {
    return cvor.quasis[0].value.cooked;
  }
  return null;
}

module.exports = {
  meta: {
    type: 'problem',
    docs: { description: 'Feature ne uvozi tuđi data-access; core/ i shared/ ne uvoze features/.' },
    schema: [],
    messages: {
      tudjiDataAccess:
        'Feature "{{feature}}" ne sme da uvozi "{{izvor}}" (data-access feature-a "{{tudji}}"). Zajednički API i DTO-i ' +
        'idu u core/api, zajednički store-ovi u core/state, pomoćne funkcije u shared/.',
      jezgroUvoziFeature: '"{{sloj}}/" ne sme da uvozi iz features/ ("{{izvor}}"): zavisnost ide samo od feature-a ka core/shared.',
    },
  },
  create(context) {
    const fajl = context.filename;
    const ovaj = relativnoUApp(fajl);
    const mojFeature = /^features\/([^/]+)\//.exec(ovaj)?.[1] ?? null;
    const sloj = /^(core|shared)\//.exec(ovaj)?.[1] ?? null;
    if (!mojFeature && !sloj) {
      return {};
    }

    function proveri(cvor, izvor) {
      if (izvor === null || !(izvor.startsWith('.') || izvor.startsWith('src/'))) {
        return; // paket iz node_modules ili dinamički izvor
      }
      const cilj = relativnoUApp(razresi(izvor, fajl));
      if (sloj && cilj.startsWith('features/')) {
        context.report({ node: cvor, messageId: 'jezgroUvoziFeature', data: { sloj, izvor } });
        return;
      }
      const tudji = /^features\/([^/]+)\/data-access(\/|$)/.exec(cilj)?.[1];
      if (mojFeature && tudji && tudji !== mojFeature) {
        context.report({ node: cvor, messageId: 'tudjiDataAccess', data: { feature: mojFeature, izvor, tudji } });
      }
    }

    return {
      ImportDeclaration: n => proveri(n, n.source.value),
      ExportAllDeclaration: n => proveri(n, n.source.value),
      ExportNamedDeclaration: n => n.source && proveri(n, n.source.value),
      ImportExpression: n => proveri(n, izvorIzCvora(n.source)),
      TSImportType: n => proveri(n, izvorIzCvora(n.argument.type === 'TSLiteralType' ? n.argument.literal : n.argument)),
    };
  },
};
