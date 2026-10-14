// Lokalno, nikad u CI-ju: PPTX_UZORCI=/data/tmp/pptx-uzorci npx vitest run --config vitest.uzorci.config.mts
// Uzorci su privatni: ovaj fajl ih samo čita, a izveštaj ide van repoa (PPTX_IZVESTAJ, podrazumevano /data/tmp/pptx-spike).
// `ng test` ga ne uzima (samo `*.spec.ts`); bez PPTX_UZORCI test se preskače.
import { chmodSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { izvestajKaoTekst } from './izvestaj';
import type { KodUpozorenja } from './izvestaj';
import { pretvoriPptx } from './uvoz';

const DIR = process.env['PPTX_UZORCI'];
const IZLAZ = process.env['PPTX_IZVESTAJ'] ?? '/data/tmp/pptx-spike/uvoz-izvestaj.txt';
// SENKA: u uzorku su sve senke teksta u ćelijama tabela sa ugrađenim stilom koji popunjava ćelije. Model nema senku
// ćelije ni dela teksta, a senka TABELA sloja (drop-shadow) bi pala iza cele tabele, ne iza slova: strukturno
// ograničenje modela (odluka 21), ne greška uvoza.
const POZNATA: ReadonlySet<KodUpozorenja> = new Set([
  'EFEKAT_ZAMENJEN', 'EFEKAT_PRIBLIZAN', 'PODELI_SMER', 'ANIMACIJA_PRESKOCENA', 'KLIK_IZGUBLJEN', 'SENKA',
]);

describe.skipIf(!DIR)('uvoz uzorka (lokalno)', () => {
  it('svih 6 bez greške, beleške 31/31, samo poznata upozorenja', async () => {
    const fajlovi = readdirSync(DIR!).filter((f) => f.toLowerCase().endsWith('.pptx')).sort();
    const delovi: string[] = [];
    const vremena: string[] = [];
    let greske = 0, beleske = 0, slajdova = 0, efekata = 0, nepoznata = 0, izgubljeni = 0, razlikaKoraka = 0;
    const pocetak = performance.now();
    for (const f of fajlovi) {
      // Najduži slajd = najduži blok glavne niti u dijalogu (uvoz popušta posle svakog slajda).
      let pre = performance.now(), najduzi = 0, kojiNajduzi = 0;
      const t0 = pre;
      const r = await pretvoriPptx(new Uint8Array(readFileSync(join(DIR!, f))), f, {
        napredak: (uradjeno) => {
          const sad = performance.now();
          if (sad - pre > najduzi) [najduzi, kojiNajduzi] = [sad - pre, uradjeno];
          pre = sad;
        },
      });
      vremena.push(`${f}: ${Math.round(performance.now() - t0)} ms, najduži slajd ${Math.round(najduzi)} ms (s${kojiNajduzi})`);
      delovi.push(izvestajKaoTekst(r));
      greske += r.greske.length;
      slajdova += r.slajdovi.length;
      for (const s of r.slajdovi) {
        beleske += s.statistika.beleske;
        efekata += s.statistika.efekataPptx;
        razlikaKoraka += s.statistika.klikoviPptx - s.statistika.koraci;
      }
      nepoznata += r.upozorenja.filter((u) => !POZNATA.has(u.kod)).length;
      izgubljeni += r.upozorenja.filter((u) => u.kod === 'KLIK_IZGUBLJEN').length;
    }
    delovi.push(`Vreme: ukupno ${Math.round(performance.now() - pocetak)} ms\n${vremena.join('\n')}`);
    delovi.push(`UKUPNO: fajlova ${fajlovi.length}, slajdova ${slajdova}, efekata ${efekata}, beleške ${beleske}, greške ${greske}, nepoznata upozorenja ${nepoznata}`);
    writeFileSync(IZLAZ, delovi.join('\n\n') + '\n', { mode: 0o600 });
    chmodSync(IZLAZ, 0o600); // mode važi samo za nov fajl
    expect(fajlovi.length).toBe(6);
    expect(greske).toBe(0);
    expect(slajdova).toBe(77);
    expect(efekata).toBe(533);
    expect(beleske).toBe(31);
    expect(nepoznata).toBe(0);
    expect(razlikaKoraka).toBe(izgubljeni);
  });
});
