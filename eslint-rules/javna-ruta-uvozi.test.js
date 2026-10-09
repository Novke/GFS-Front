// Pokretanje: npm run test:eslint-pravila (CI: posle ng lint). Pravilo samo; stvarni eslint.config.js: javna-ruta-konfig.test.js.
'use strict';

const path = require('node:path');
const { describe, it } = require('node:test');
const { RuleTester } = require('eslint');
const tseslint = require('typescript-eslint');

const pravilo = require('./javna-ruta-uvozi');
const { dozvoljenoZa } = require('./javna-ruta-konfig');

RuleTester.describe = describe;
RuleTester.it = it;

const APP = path.resolve(__dirname, '..', 'src', 'app');
const opcije = (feature) => [{ feature, dozvoljeno: dozvoljenoZa(feature) }];
const upis = path.join(APP, 'features/upis/pages/javni-upis.ts');
const upisKoren = path.join(APP, 'features/upis/upis.api.ts');
const uzivo = path.join(APP, 'features/uzivo/javno/pages/ekran.ts');

new RuleTester({ languageOptions: { parser: tseslint.parser } }).run('javna-ruta-uvozi', pravilo, {
  valid: [
    { code: 'const m = () => import(`../upis.api`);', filename: upis, options: opcije('features/upis') },
    { code: "import { Component } from '@angular/core';", filename: upis, options: opcije('features/upis') },
    { code: "import { UpisApi } from '../upis.api';", filename: upis, options: opcije('features/upis') },
    { code: "import { x } from './pravila';", filename: upisKoren, options: opcije('features/upis') },
    { code: "import { API_URL } from '../../../core/api/api-url';", filename: upis, options: opcije('features/upis') },
    { code: "import { toApiError } from '../../../core/api/api-error';", filename: upis, options: opcije('features/upis') },
    { code: "import { a } from '../../../shared/forms/form-error-banner';", filename: upis, options: opcije('features/upis') },
    { code: "import { a } from '../../../core/layout/okruzenje';", filename: upis, options: opcije('features/upis') },
    { code: "import { a } from '../../../core/layout/public-layout';", filename: upis, options: opcije('features/upis') },
    { code: "import { a } from 'src/app/features/upis/upis.api';", filename: upis, options: opcije('features/upis') },
    { code: "import { a } from '../javno.api';", filename: uzivo, options: opcije('features/uzivo/javno') },
    { code: "import { a } from '../data-access/uzivo.api';", filename: uzivo, options: opcije('features/uzivo/javno') },
    // uživo: čisti moduli van javnog dela (spisak u javna-ruta-konfig.js, DOZVOLJENO_PO_FEATURE)
    { code: "import { a } from '../../data-access/uzivo.models';", filename: uzivo, options: opcije('features/uzivo/javno') },
    { code: "import { a } from '../../data-access/stomp';", filename: uzivo, options: opcije('features/uzivo/javno') },
    { code: "import { a } from '../../ui/rang-lista.component';", filename: uzivo, options: opcije('features/uzivo/javno') },
    { code: "import { a } from 'src/app/features/uzivo/ui/tajmer.component';", filename: uzivo, options: opcije('features/uzivo/javno') },
    { code: "import { a } from '../../uzivo-putanje';", filename: uzivo, options: opcije('features/uzivo/javno') },
  ],
  invalid: [
    // fail-closed: dinamički izvor, šablon sa izrazom, van src/app, apsolutna putanja
    { code: 'const m = (x) => import(x);', filename: upis, options: opcije('features/upis'), errors: [{ messageId: 'dinamicki' }] },
    { code: 'const m = (x) => import(`./${x}`);', filename: upis, options: opcije('features/upis'), errors: [{ messageId: 'dinamicki' }] },
    { code: 'const m = () => import(`../../../core/state/reference.store`);', filename: upis, options: opcije('features/upis'), errors: [{ messageId: 'zabranjen' }] },
    { code: "import { e } from 'src/environments/environment';", filename: upis, options: opcije('features/upis'), errors: [{ messageId: 'zabranjen' }] },
    { code: "import { e } from '../../../../../package.json';", filename: upis, options: opcije('features/upis'), errors: [{ messageId: 'zabranjen' }] },
    { code: "import { e } from '/etc/passwd';", filename: upis, options: opcije('features/upis'), errors: [{ messageId: 'zabranjen' }] },
    { code: "const r = require('../../../core/state/reference.store');", filename: upis, options: opcije('features/upis'), errors: [{ messageId: 'zabranjen' }] },
    { code: "type T = import('../../../core/state/reference.store').X;", filename: upis, options: opcije('features/upis'), errors: [{ messageId: 'zabranjen' }] },
    { code: "import { ReferenceStore } from '../../../core/state/reference.store';", filename: upis, options: opcije('features/upis'), errors: [{ messageId: 'zabranjen' }] },
    // upozorenje pre zatvaranja kartice je nastavnička briga: javna ruta ga nikad ne instancira
    { code: "import { NesacuvaneIzmene } from '../../../core/state/nesacuvane-izmene';", filename: upis, options: opcije('features/upis'), errors: [{ messageId: 'zabranjen' }] },
    { code: "import { RegistarCuvanja } from '../../../core/state/registar-cuvanja';", filename: upis, options: opcije('features/upis'), errors: [{ messageId: 'zabranjen' }] },
    { code: "import { ReferenceStore } from '../../core/state/reference.store';", filename: upisKoren, options: opcije('features/upis'), errors: [{ messageId: 'zabranjen' }] },
    { code: "import { S } from '../../../core/api/studenti.api';", filename: upis, options: opcije('features/upis'), errors: [{ messageId: 'zabranjen' }] },
    { code: "import { S } from '../../../core/layout/shell';", filename: upis, options: opcije('features/upis'), errors: [{ messageId: 'zabranjen' }] },
    { code: "import { D } from '../../domaci/domaci.routes';", filename: upis, options: opcije('features/upis'), errors: [{ messageId: 'zabranjen' }] },
    { code: "import { D } from 'src/app/features/domaci/domaci.routes';", filename: upis, options: opcije('features/upis'), errors: [{ messageId: 'zabranjen' }] },
    { code: "import { M } from 'src/app/features/predavanja/data-access/predavanje.store';", filename: upis, options: opcije('features/upis'), errors: [{ messageId: 'zabranjen' }] },
    { code: "export { D } from '../../domaci/domaci.routes';", filename: upis, options: opcije('features/upis'), errors: [{ messageId: 'zabranjen' }] },
    { code: "const m = () => import('../../../core/state/reference.store');", filename: upis, options: opcije('features/upis'), errors: [{ messageId: 'zabranjen' }] },
    { code: "import type { T } from '../../../shared/ui/student-picker';", filename: upis, options: opcije('features/upis'), errors: [{ messageId: 'zabranjen' }] },
    { code: "import { a } from '../../../shared/forms/unsaved-changes.guard';", filename: upis, options: opcije('features/upis'), errors: [{ messageId: 'zabranjen' }] },
    // javni feature ne uvozi drugi javni feature
    { code: "import { a } from '../../../upis/upis.api';", filename: uzivo, options: opcije('features/uzivo/javno'), errors: [{ messageId: 'zabranjen' }] },
    // druga polovina uzivo feature-a (nastavnicka strana) nije javna
    { code: "import { a } from '../../data-access/nastavnik.api';", filename: uzivo, options: opcije('features/uzivo/javno'), errors: [{ messageId: 'zabranjen' }] },
    { code: "import { a } from '../../data-access/prezentacije.api';", filename: uzivo, options: opcije('features/uzivo/javno'), errors: [{ messageId: 'zabranjen' }] },
    { code: "import { a } from '../../data-access/izvodjenja.api';", filename: uzivo, options: opcije('features/uzivo/javno'), errors: [{ messageId: 'zabranjen' }] },
    { code: "import { a } from '../../data-access/izvodjenje.store';", filename: uzivo, options: opcije('features/uzivo/javno'), errors: [{ messageId: 'zabranjen' }] },
    { code: "import { a } from '../../pages/konzola.page';", filename: uzivo, options: opcije('features/uzivo/javno'), errors: [{ messageId: 'zabranjen' }] },
    { code: "const m = () => import('../../ui/slajd-prikaz.component');", filename: uzivo, options: opcije('features/uzivo/javno'), errors: [{ messageId: 'zabranjen' }] },
    // dodatak uživa ne važi za upis
    { code: "import { a } from '../../uzivo/data-access/uzivo.models';", filename: upis, options: opcije('features/upis'), errors: [{ messageId: 'zabranjen' }] },
  ],
});
