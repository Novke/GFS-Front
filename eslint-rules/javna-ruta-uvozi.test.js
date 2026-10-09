// Pokretanje: node --test eslint-rules/   (npm run test:eslint-pravila)
'use strict';

const path = require('node:path');
const { describe, it } = require('node:test');
const { RuleTester } = require('eslint');
const tseslint = require('typescript-eslint');

const pravilo = require('./javna-ruta-uvozi');

RuleTester.describe = describe;
RuleTester.it = it;

const APP = path.resolve(__dirname, '..', 'src', 'app');
const DOZVOLJENO = ['core/api/api-url', 'core/api/api-error', 'core/layout/public-layout', 'shared/forms/**'];
const opcije = (feature) => [{ feature, dozvoljeno: DOZVOLJENO }];
const upis = path.join(APP, 'features/upis/pages/javni-upis.ts');
const upisKoren = path.join(APP, 'features/upis/upis.api.ts');
const uzivo = path.join(APP, 'features/uzivo/javno/pages/ekran.ts');

new RuleTester({ languageOptions: { parser: tseslint.parser } }).run('javna-ruta-uvozi', pravilo, {
  valid: [
    { code: "import { Component } from '@angular/core';", filename: upis, options: opcije('features/upis') },
    { code: "import { UpisApi } from '../upis.api';", filename: upis, options: opcije('features/upis') },
    { code: "import { x } from './pravila';", filename: upisKoren, options: opcije('features/upis') },
    { code: "import { API_URL } from '../../../core/api/api-url';", filename: upis, options: opcije('features/upis') },
    { code: "import { toApiError } from '../../../core/api/api-error';", filename: upis, options: opcije('features/upis') },
    { code: "import { a } from '../../../shared/forms/form-error-banner';", filename: upis, options: opcije('features/upis') },
    { code: "import { a } from 'src/app/features/upis/upis.api';", filename: upis, options: opcije('features/upis') },
    { code: "import { a } from '../javno.api';", filename: uzivo, options: opcije('features/uzivo/javno') },
    { code: "import { a } from '../data-access/uzivo.api';", filename: uzivo, options: opcije('features/uzivo/javno') },
  ],
  invalid: [
    { code: "import { ReferenceStore } from '../../../core/state/reference.store';", filename: upis, options: opcije('features/upis'), errors: [{ messageId: 'zabranjen' }] },
    { code: "import { ReferenceStore } from '../../core/state/reference.store';", filename: upisKoren, options: opcije('features/upis'), errors: [{ messageId: 'zabranjen' }] },
    { code: "import { S } from '../../../core/api/studenti.api';", filename: upis, options: opcije('features/upis'), errors: [{ messageId: 'zabranjen' }] },
    { code: "import { S } from '../../../core/layout/shell';", filename: upis, options: opcije('features/upis'), errors: [{ messageId: 'zabranjen' }] },
    { code: "import { D } from '../../domaci/domaci.routes';", filename: upis, options: opcije('features/upis'), errors: [{ messageId: 'zabranjen' }] },
    { code: "import { D } from 'src/app/features/domaci/domaci.routes';", filename: upis, options: opcije('features/upis'), errors: [{ messageId: 'zabranjen' }] },
    { code: "import { M } from 'src/app/models/model';", filename: upis, options: opcije('features/upis'), errors: [{ messageId: 'zabranjen' }] },
    { code: "export { D } from '../../domaci/domaci.routes';", filename: upis, options: opcije('features/upis'), errors: [{ messageId: 'zabranjen' }] },
    { code: "const m = () => import('../../../core/state/reference.store');", filename: upis, options: opcije('features/upis'), errors: [{ messageId: 'zabranjen' }] },
    { code: "import type { T } from '../../../shared/ui/student-picker';", filename: upis, options: opcije('features/upis'), errors: [{ messageId: 'zabranjen' }] },
    // javni feature ne uvozi drugi javni feature
    { code: "import { a } from '../../../upis/upis.api';", filename: uzivo, options: opcije('features/uzivo/javno'), errors: [{ messageId: 'zabranjen' }] },
    // druga polovina uzivo feature-a (nastavnicka strana) nije javna
    { code: "import { a } from '../../data-access/nastavnik.api';", filename: uzivo, options: opcije('features/uzivo/javno'), errors: [{ messageId: 'zabranjen' }] },
  ],
});
