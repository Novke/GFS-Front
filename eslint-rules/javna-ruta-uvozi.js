// Pravilo za javne rute (`/upis/:token`, kasnije `uzivo/javno`): student na telefonu nema basic-auth, pa svaki poziv
// zaključanog `/api/*` otvara dijalog za lozinku. Zato fajlovi javnog feature-a smeju da uvoze samo sopstveni feature i
// kratak spisak bezbednih modula (opcija `dozvoljeno`); sve ostalo u `src/app` je greška.
//
// Zašto sopstveno pravilo, a ne `no-restricted-imports`: njegovi obrasci gledaju samo tekst uvoza (gitignore sintaksa,
// bez `!(upis)` extglob-a), pa ne vide `../domaci/x` ni `../../core/api/studenti.api`. Ovde se putanja razrešava u
// stvarnu lokaciju (relativni uvozi i `src/app/...`), pa dubina fajla i način pisanja uvoza nisu bitni.
//
// Lista je dozvoljenih (fail-closed): novi modul na javnoj ruti mora svesno da se doda u `eslint.config.js`.
'use strict';

const path = require('node:path');

const KORENI_PROJEKTA = path.resolve(__dirname, '..');
const APP = path.join(KORENI_PROJEKTA, 'src', 'app');

function razresi(izvor, fajl) {
  if (izvor.startsWith('.')) {
    return path.resolve(path.dirname(fajl), izvor);
  }
  if (izvor.startsWith('src/')) {
    return path.resolve(KORENI_PROJEKTA, izvor);
  }
  return null; // paket (@angular/*, rxjs, ...)
}

/** Putanja u odnosu na `src/app`, sa kosim crtama i bez `.ts`; `null` ako je van `src/app`. */
function unutarApp(apsolutna) {
  const rel = path.relative(APP, apsolutna).split(path.sep).join('/');
  return rel.startsWith('..') || path.isAbsolute(rel) ? null : rel.replace(/\.(ts|js)$/, '');
}

function jeDozvoljeno(rel, feature, dozvoljeno) {
  if (rel === feature || rel.startsWith(`${feature}/`)) {
    return true;
  }
  return dozvoljeno.some(d => (d.endsWith('/**') ? rel === d.slice(0, -3) || rel.startsWith(d.slice(0, -2)) : rel === d));
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
      zabranjen:
        'Javna ruta ({{feature}}) ne sme da uvozi "{{izvor}}": zaključan /api/* studentu na telefonu otvara dijalog za ' +
        'lozinku. Dozvoljeni su samo sopstveni feature i spisak "dozvoljeno" u eslint.config.js.',
    },
  },
  create(context) {
    const { feature, dozvoljeno = [] } = context.options[0];
    const fajl = context.filename;

    function proveri(cvor, izvor) {
      if (typeof izvor !== 'string') {
        return;
      }
      const apsolutna = razresi(izvor, fajl);
      const rel = apsolutna && unutarApp(apsolutna);
      if (rel !== null && rel !== undefined && !jeDozvoljeno(rel, feature, dozvoljeno)) {
        context.report({ node: cvor, messageId: 'zabranjen', data: { feature, izvor } });
      }
    }

    return {
      ImportDeclaration: n => proveri(n, n.source.value),
      ExportAllDeclaration: n => proveri(n, n.source.value),
      ExportNamedDeclaration: n => n.source && proveri(n, n.source.value),
      ImportExpression: n => n.source.type === 'Literal' && proveri(n, n.source.value),
      TSImportEqualsDeclaration: n =>
        n.moduleReference.type === 'TSExternalModuleReference' && proveri(n, n.moduleReference.expression.value),
      TSImportType: n => n.argument?.literal && proveri(n, n.argument.literal.value),
    };
  },
};
