// Pravilo za javne rute (`/upis/:token`, kasnije `uzivo/javno`): student na telefonu nema basic-auth, pa svaki poziv
// zaključanog `/api/*` otvara dijalog za lozinku. Zato fajlovi javnog feature-a smeju da uvoze samo sopstveni feature i
// kratak spisak bezbednih modula (opcija `dozvoljeno`); sve ostalo u `src/app` je greška.
//
// Zašto sopstveno pravilo, a ne `no-restricted-imports`: njegovi obrasci gledaju samo tekst uvoza (gitignore sintaksa,
// bez `!(upis)` extglob-a), pa ne vide `../domaci/x` ni `../../core/api/studenti.api`. Ovde se putanja razrešava u
// stvarnu lokaciju (relativni uvozi i `src/app/...`), pa dubina fajla i način pisanja uvoza nisu bitni.
//
// Lista je dozvoljenih (fail-closed): novi modul na javnoj ruti mora svesno da se doda u `javna-ruta-konfig.js`. Provera
// važi samo za DIREKTNE uvoze fajla. Izvor uvoza mora biti string (ili šablon bez izraza); sve što se razrešava van
// `src/app` (osim paketa iz node_modules) je greška, osim ako je na listi.
'use strict';

const path = require('node:path');

const KORENI_PROJEKTA = path.resolve(__dirname, '..');
const APP = path.join(KORENI_PROJEKTA, 'src', 'app');

/** Paket iz node_modules (`@angular/core`, `rxjs`): jedino što sme van `src/app` bez dozvole. */
function jePaket(izvor) {
  return !izvor.startsWith('.') && !izvor.startsWith('/') && izvor !== 'src' && !izvor.startsWith('src/');
}

function razresi(izvor, fajl) {
  return izvor.startsWith('src/') ? path.resolve(KORENI_PROJEKTA, izvor) : path.resolve(path.dirname(fajl), izvor);
}

/** Putanja u odnosu na `src/app` (kose crte, bez `.ts`); van `src/app` počinje sa `../`. */
function relativnoUApp(apsolutna) {
  return path.relative(APP, apsolutna).split(path.sep).join('/').replace(/\.(ts|js)$/, '');
}

function jeDozvoljeno(rel, feature, dozvoljeno) {
  if (rel === feature || rel.startsWith(`${feature}/`)) {
    return true;
  }
  return dozvoljeno.some(d => (d.endsWith('/**') ? rel === d.slice(0, -3) || rel.startsWith(d.slice(0, -2)) : rel === d));
}

/** Vrednost literala za izvor uvoza: string ili šablon bez izraza; inače `null` (dinamički izvor). */
function izvorIzCvora(cvor) {
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
    docs: { description: 'Javna ruta ne sme da uvozi kod koji zove zaključan /api/*.' },
    schema: [
      {
        type: 'object',
        properties: {
          feature: { type: 'string' },
          dozvoljeno: { type: 'array', items: { type: 'string' } },
        },
        required: ['feature'],
        additionalProperties: false,
      },
    ],
    messages: {
      dinamicki:
        'Javna ruta ({{feature}}) ne sme da koristi uvoz čiji se izvor ne vidi iz koda: izvor mora biti string literal, ' +
        'inače se ne može proveriti da ne zove zaključan /api/*.',
      zabranjen:
        'Javna ruta ({{feature}}) ne sme da uvozi "{{izvor}}": zaključan /api/* studentu na telefonu otvara dijalog za ' +
        'lozinku. Dozvoljeni su samo sopstveni feature i spisak u eslint-rules/javna-ruta-konfig.js.',
    },
  },
  create(context) {
    const { feature, dozvoljeno = [] } = context.options[0];
    const fajl = context.filename;

    function proveri(cvor, izvor) {
      if (izvor === null) {
        context.report({ node: cvor, messageId: 'dinamicki', data: { feature } });
        return;
      }
      if (jePaket(izvor)) {
        return;
      }
      const rel = relativnoUApp(razresi(izvor, fajl));
      if (!jeDozvoljeno(rel, feature, dozvoljeno)) {
        context.report({ node: cvor, messageId: 'zabranjen', data: { feature, izvor } });
      }
    }

    return {
      ImportDeclaration: n => proveri(n, n.source.value),
      ExportAllDeclaration: n => proveri(n, n.source.value),
      ExportNamedDeclaration: n => n.source && proveri(n, n.source.value),
      ImportExpression: n => proveri(n, izvorIzCvora(n.source)),
      CallExpression: n => {
        if (n.callee.type === 'Identifier' && n.callee.name === 'require' && n.arguments.length > 0) {
          proveri(n, izvorIzCvora(n.arguments[0]));
        }
      },
      TSImportEqualsDeclaration: n =>
        n.moduleReference.type === 'TSExternalModuleReference' && proveri(n, izvorIzCvora(n.moduleReference.expression)),
      TSImportType: n => proveri(n, izvorIzCvora(n.argument.type === 'TSLiteralType' ? n.argument.literal : n.argument)),
    };
  },
};
