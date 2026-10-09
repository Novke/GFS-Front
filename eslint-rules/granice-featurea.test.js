// Pokretanje: npm run test:eslint-pravila. Pravilo u izolaciji, pa stvarni eslint.config.js (glob i povezivanje plugina).
'use strict';

const path = require('node:path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { ESLint, RuleTester } = require('eslint');
const tseslint = require('typescript-eslint');

const pravilo = require('./granice-featurea');

RuleTester.describe = describe;
RuleTester.it = it;

const KOREN = path.resolve(__dirname, '..');
const APP = path.join(KOREN, 'src', 'app');
const grupe = path.join(APP, 'features/grupe/pages/grupa-pregled-tab.ts');
const domaciStore = path.join(APP, 'features/domaci/data-access/domaci.store.ts');
const coreApi = path.join(APP, 'core/api/studenti.api.ts');
const sharedUi = path.join(APP, 'shared/ui/x.ts');
const rute = path.join(APP, 'app.routes.ts');

new RuleTester({ languageOptions: { parser: tseslint.parser } }).run('granice-featurea', pravilo, {
  valid: [
    { code: "import { G } from '../data-access/grupa.store';", filename: grupe },
    { code: "import { P } from '../../../core/api/predavanja.api';", filename: grupe },
    { code: "import { L } from '../../../core/state/predavanja-lista.store';", filename: grupe },
    { code: "import { T } from '../../predavanja/ui/predavanja-tabela';", filename: grupe }, // tuđ ui je dozvoljen
    { code: "import { D } from './domaci.api';", filename: domaciStore },
    { code: "import { R } from './reference.api';", filename: coreApi },
    { code: "import { Component } from '@angular/core';", filename: sharedUi },
    { code: "import { R } from './features/predavanja/predavanja.routes';", filename: rute }, // koren aplikacije sme
    { code: 'const m = (x) => import(x);', filename: grupe },
  ],
  invalid: [
    { code: "import { P } from '../../predavanja/data-access/predavanje.store';", filename: grupe, errors: [{ messageId: 'tudjiDataAccess' }] },
    { code: "import type { P } from 'src/app/features/predavanja/data-access/x';", filename: grupe, errors: [{ messageId: 'tudjiDataAccess' }] },
    { code: "export { P } from '../../predavanja/data-access/x';", filename: grupe, errors: [{ messageId: 'tudjiDataAccess' }] },
    { code: "const m = () => import('../../predavanja/data-access/x');", filename: grupe, errors: [{ messageId: 'tudjiDataAccess' }] },
    { code: "type T = import('../../testovi/data-access/x').T;", filename: domaciStore, errors: [{ messageId: 'tudjiDataAccess' }] },
    { code: "import { T } from '../../features/predavanja/data-access/x';", filename: coreApi, errors: [{ messageId: 'jezgroUvoziFeature' }] },
    { code: "import { T } from '../../features/grupe/ui/x';", filename: sharedUi, errors: [{ messageId: 'jezgroUvoziFeature' }] },
  ],
});

describe('eslint.config.js: pravilo granice-featurea', () => {
  it('je uključeno za src/app/**/*.ts', async () => {
    const eslint = new ESLint({ cwd: KOREN, overrideConfigFile: path.join(KOREN, 'eslint.config.js') });
    const kod = "import { P } from '../../predavanja/data-access/predavanje.store';\nexport const x = P;\n";
    const [r] = await eslint.lintText(kod, { filePath: path.join(APP, 'features/grupe/pages/test-granice.ts') });
    const m = r.messages.filter(x => x.ruleId === 'gfs/granice-featurea');
    assert.equal(m.length, 1, JSON.stringify(r.messages));
  });
});
