// Proverava STVARNI eslint.config.js kroz ESLint API (glob fajlova, spisak dozvoljenog i povezivanje plugina), ne samo
// pravilo u izolaciji. Pokretanje: npm run test:eslint-pravila
'use strict';

const path = require('node:path');
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { ESLint } = require('eslint');

const { JAVNI_FEATURE, JAVNO_DOZVOLJENO } = require('./javna-ruta-konfig');

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

      for (const dozvoljen of JAVNO_DOZVOLJENO) {
        it(`ćuti za dozvoljen uvoz ${dozvoljen}`, async () => {
          assert.deepEqual(await poruke(feature, `import * as X from '${gore}${dozvoljen}';\nexport const y = X;\n`), []);
        });
      }

      it('ćuti za sopstveni feature i pakete', async () => {
        assert.deepEqual(await poruke(feature, `import { X } from '../javna.api';\nexport const y = X;\n`), []);
        assert.deepEqual(await poruke(feature, `import { signal } from '@angular/core';\nexport const y = signal;\n`), []);
      });

      it('ne dozvoljava drugi javni feature', async () => {
        const drugi = JAVNI_FEATURE.find(f => f !== feature);
        const m = await poruke(feature, `import { X } from '${gore}${drugi}/x.api';\nexport const y = X;\n`);
        assert.equal(m.length, 1, JSON.stringify(m));
      });
    });
  }

  it('ne primenjuje pravilo van javnih feature-a (obim glob-a)', async () => {
    const [r] = await eslint.lintText(`import { X } from '${odStranice('core/state/reference.store')}';\nexport const y = X;\n`, {
      filePath: path.join(KORENI, 'src/app/features/domaci/pages/test-nejavni.ts'),
    });
    assert.deepEqual(r.messages.filter(m => m.ruleId === RULE_ID), []);
  });
});
