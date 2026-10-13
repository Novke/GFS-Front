// Proverava STVARNI eslint.config.js kroz ESLint API (glob fajlova, spisak dozvoljenog i povezivanje plugina), ne samo
// pravilo u izolaciji. Pokretanje: npm run test:eslint-pravila
'use strict';

const path = require('node:path');
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { ESLint } = require('eslint');

const { JAVNI_FEATURE, DOZVOLJENO_PO_FEATURE, ZABRANJENI_PAKETI_JAVNO, dozvoljenoZa } = require('./javna-ruta-konfig');

const KORENI = path.resolve(__dirname, '..');
const RULE_ID = 'gfs/javna-ruta-uvozi';

/** Relativni uvoz iz `src/app/<feature>/pages/x.ts` do `src/app/<rel>`. */
const odStranice = rel => `../../../${rel}`;

describe('eslint.config.js: pravilo javna-ruta-uvozi', () => {
  /** @type {ESLint} */
  let eslint;

  before(() => {
    eslint = new ESLint({ cwd: KORENI, overrideConfigFile: path.join(KORENI, 'eslint.config.js') });
  });

  /** Poruke samo našeg pravila za dati kod u fajlu `src/app/<feature>/pages/test-javni.ts`. */
  async function poruke(feature, kod, podFajl = 'pages/test-javni.ts') {
    const [rezultat] = await eslint.lintText(kod, { filePath: path.join(KORENI, 'src/app', feature, podFajl) });
    return rezultat.messages.filter(m => m.ruleId === RULE_ID);
  }

  const dubina = feature => '../'.repeat(feature.split('/').length + 1); // iz <feature>/pages do src/app

  for (const feature of JAVNI_FEATURE) {
    const gore = dubina(feature);

    describe(feature, () => {
      for (const zabranjen of [
        'core/state/reference.store',
        'core/api/studenti.api',
        'core/api/reference.api',
        'core/layout/shell',
        'features/domaci/domaci.routes',
        'shared/ui/student-picker',
        'features/predavanja/data-access/predavanje.store',
      ]) {
        it(`obara uvoz ${zabranjen}`, async () => {
          const m = await poruke(feature, `import { X } from '${gore}${zabranjen}';\nexport const y = X;\n`);
          assert.equal(m.length, 1, JSON.stringify(m));
          assert.equal(m[0].messageId, 'zabranjen');
        });
      }

      it('obara uvoz preko src/app aliasa i dinamički uvoz', async () => {
        assert.equal((await poruke(feature, `import { X } from 'src/app/core/state/reference.store';\nexport const y = X;\n`)).length, 1);
        assert.equal((await poruke(feature, `export const m = () => import('${gore}core/state/reference.store');\n`)).length, 1);
        assert.equal((await poruke(feature, `export const m = (x: string) => import(x);\n`))[0]?.messageId, 'dinamicki');
      });

      for (const dozvoljen of dozvoljenoZa(feature)) {
        it(`ćuti za dozvoljen uvoz ${dozvoljen}`, async () => {
          assert.deepEqual(await poruke(feature, `import * as X from '${gore}${dozvoljen}';\nexport const y = X;\n`), []);
        });
      }

      it('ćuti za sopstveni feature i pakete', async () => {
        assert.deepEqual(await poruke(feature, `import { X } from '../javna.api';\nexport const y = X;\n`), []);
        assert.deepEqual(await poruke(feature, `import { signal } from '@angular/core';\nexport const y = signal;\n`), []);
      });

      for (const paket of ZABRANJENI_PAKETI_JAVNO) {
        it(`obara zabranjen paket ${paket} i njegovu podputanju`, async () => {
          for (const izvor of [paket, `${paket}/esm/browser.js`]) {
            const m = await poruke(feature, `import * as X from '${izvor}';\nexport const y = X;\n`);
            assert.equal(m.length, 1, JSON.stringify(m));
            assert.equal(m[0].messageId, 'zabranjenPaket');
          }
        });
      }

      it('ne dozvoljava drugi javni feature', async () => {
        const drugi = JAVNI_FEATURE.find(f => f !== feature);
        const m = await poruke(feature, `import { X } from '${gore}${drugi}/x.api';\nexport const y = X;\n`);
        assert.equal(m.length, 1, JSON.stringify(m));
      });
    });
  }

  describe('features/uzivo/javno: dodatak važi samo za uživo, nastavnička strana ostaje zabranjena', () => {
    const gore = dubina('features/uzivo/javno');

    for (const zabranjen of [
      'features/uzivo/data-access/prezentacije.api',
      'features/uzivo/data-access/izvodjenja.api',
      'features/uzivo/data-access/izvodjenje.store',
      'features/uzivo/data-access/editor.store',
      'features/uzivo/data-access/slajd-pravila',
      'features/uzivo/pages/konzola.page',
      'features/uzivo/pages/publika-scena.component',
      'features/uzivo/ui/slajd-prikaz.component',
      'features/uzivo/ui/monitor',
      'features/uzivo/uzivo.routes',
      'core/state/notification.store',
      'core/layout/icons',
    ]) {
      it(`obara uvoz ${zabranjen}`, async () => {
        const m = await poruke('features/uzivo/javno', `import { X } from '${gore}${zabranjen}';\nexport const y = X;\n`);
        assert.equal(m.length, 1, JSON.stringify(m));
        assert.equal(m[0].messageId, 'zabranjen');
      });
    }

    it('stvarni javni fajlovi (uzivo-kod.page) uvoze samo dozvoljeno', async () => {
      const kod = `import { UzivoPutanje } from '../uzivo-putanje';\nimport { razlogGreske } from '../data-access/razlog-greske';\n` +
        `export const y = [UzivoPutanje, razlogGreske];\n`;
      assert.deepEqual(await poruke('features/uzivo/javno', kod, 'uzivo-kod.page.ts'), []);
    });

    for (const dodatak of DOZVOLJENO_PO_FEATURE['features/uzivo/javno']) {
      it(`upis ne sme da uvozi dodatak uživa ${dodatak}`, async () => {
        const m = await poruke('features/upis', `import * as X from '${dubina('features/upis')}${dodatak}';\nexport const y = X;\n`);
        assert.equal(m.length, 1, JSON.stringify(m));
      });
    }
  });

  it('fflate je dozvoljen van javnih feature-a (uvoz PPTX-a)', async () => {
    const [r] = await eslint.lintText(`import { unzipSync } from 'fflate';\nexport const y = unzipSync;\n`, {
      filePath: path.join(KORENI, 'src/app/features/uzivo/uvoz-pptx/test-nejavni.ts'),
    });
    assert.deepEqual(r.messages.filter(m => m.ruleId === RULE_ID), []);
  });

  const PAKETI_EDITORA = [
    'prosemirror-model', 'prosemirror-state', 'prosemirror-view', 'prosemirror-transform', 'prosemirror-commands',
    'prosemirror-keymap', 'prosemirror-history',
  ];

  it('biblioteke editora platna su na spisku zabranjenih', () => {
    for (const paket of PAKETI_EDITORA) {
      assert.ok(ZABRANJENI_PAKETI_JAVNO.includes(paket), paket);
    }
  });

  it('obara prosemirror-view/dist/index.js u javnom feature-u (podputanja)', async () => {
    for (const feature of JAVNI_FEATURE) {
      const m = await poruke(feature, `import * as X from 'prosemirror-view/dist/index.js';\nexport const y = X;\n`);
      assert.equal(m.length, 1, JSON.stringify(m));
      assert.equal(m[0].messageId, 'zabranjenPaket');
    }
  });

  it('prosemirror je dozvoljen van javnih feature-a (editor platna)', async () => {
    const kod = PAKETI_EDITORA.map((p, i) => `import * as P${i} from '${p}';`).join('\n') +
      `\nexport const y = [${PAKETI_EDITORA.map((_, i) => `P${i}`).join(', ')}];\n`;
    const [r] = await eslint.lintText(kod, {
      filePath: path.join(KORENI, 'src/app/features/uzivo/editor-platna/test-nejavni.ts'),
    });
    assert.deepEqual(r.messages.filter(m => m.ruleId === RULE_ID), []);
  });

  it('ne primenjuje pravilo van javnih feature-a (obim glob-a)', async () => {
    const [r] = await eslint.lintText(`import { X } from '${odStranice('core/state/reference.store')}';\nexport const y = X;\n`, {
      filePath: path.join(KORENI, 'src/app/features/domaci/pages/test-nejavni.ts'),
    });
    assert.deepEqual(r.messages.filter(m => m.ruleId === RULE_ID), []);
  });
});
