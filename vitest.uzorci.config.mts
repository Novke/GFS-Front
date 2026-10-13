// Lokalna provera uvoza na Novicinom uzorku (van `ng test` i CI-ja): uzima samo `*.uzorci.ts`, koje čitaju fajlove (node:fs).
// Pokretanje: PPTX_UZORCI=/data/tmp/pptx-uzorci npx vitest run --config vitest.uzorci.config.mts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'jsdom', include: ['src/**/*.uzorci.ts'], testTimeout: 300_000 } });
