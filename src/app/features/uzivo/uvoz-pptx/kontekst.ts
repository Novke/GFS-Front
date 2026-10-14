// Graditelj konteksta slajda: slajd -> layout -> master -> tema po vezama, mapa boja, stilovi prezentacije, mediji i
// upozorenja. Jedini graditelj konteksta (uvoz.ts u F12 i specovi F3-F11). Bez Angular-a.
import { GreskaUvoza } from './ime-fajla';
import type { Upozorenje } from './izvestaj';
import type { Paket } from './paket';
import { mapaBoja, PODRAZUMEVANA_TEMA, procitajTemu } from './tema';
import { EMU_PO_PT, type KontekstSlajda, type MedijUvoza, type Transformacija } from './tipovi';
import { dete, NS } from './xml';

/** Stanje uvoza zajedničko za sve slajdove jednog fajla. */
export interface ZajednickoUvoza {
  paket: Paket;
  t: Transformacija;
  upozorenja: Upozorenje[];
  mediji: Map<string, MedijUvoza>;
  /** Brojač generisanih medija (`gen:<n>`), zajednički za ceo fajl. */
  brojacGen: { n: number };
}

const SIRINA = 960;
const VISINA = 540;

/** Uklapanje slajda veličine `velicina` (EMU) u 960 x 540, centrirano (F12 pravilo 2). */
export function transformacija(velicina: { cx: number; cy: number }): Transformacija {
  const w = velicina.cx / EMU_PO_PT;
  const h = velicina.cy / EMU_PO_PT;
  const s = Math.min(SIRINA / w, VISINA / h);
  return { s, ox: (SIRINA - w * s) / 2, oy: (VISINA - h * s) / 2 };
}

/** Deo na koji pokazuje unutrašnja veza datog tipa, ili `null` (nema veze, spoljna je, ili deo ne postoji). */
function deoPoVezi(paket: Paket, odDela: string, tip: string): { putanja: string; doc: Document } | null {
  const v = paket.vezaTipa(odDela, tip);
  if (!v || v.spoljna) return null;
  const doc = paket.xml(v.cilj);
  return doc ? { putanja: v.cilj, doc } : null;
}

/**
 * Kontekst slajda `putanjaSlajda` (`indeks` = redni broj u PPTX-u, 1-based). Layout je veza `slideLayout` slajda, master
 * veza `slideMaster` layouta, tema veza `theme` mastera (ne prvi `theme*.xml` u paketu: master beležaka ima svoju temu).
 * Nema layouta ili mastera -> `null` i `PODRAZUMEVANA_TEMA`. Deo slajda ne postoji -> izuzetak (F12: greška slajda).
 */
export function napraviKontekst(z: ZajednickoUvoza, putanjaSlajda: string, indeks: number): KontekstSlajda {
  const { paket } = z;
  const slajdDoc = paket.xml(putanjaSlajda);
  if (!slajdDoc) throw new GreskaUvoza('deo slajda ne postoji u fajlu');

  const layout = deoPoVezi(paket, putanjaSlajda, 'slideLayout');
  const master = layout ? deoPoVezi(paket, layout.putanja, 'slideMaster') : null;
  const temaDeo = master ? deoPoVezi(paket, master.putanja, 'theme') : null;
  const tema = temaDeo ? procitajTemu(temaDeo.doc) : PODRAZUMEVANA_TEMA;
  const mapa = mapaBoja(master?.doc ?? null, layout?.doc ?? null, slajdDoc);

  const glavna = paket.vezaTipa('', 'officeDocument');
  const prezentacija = glavna && !glavna.spoljna ? paket.xml(glavna.cilj)?.documentElement ?? null : null;
  const defaultTextStyle = prezentacija ? dete(prezentacija, NS.p, 'defaultTextStyle') : null;
  const tabelaStilova = glavna && !glavna.spoljna ? deoPoVezi(paket, glavna.cilj, 'tableStyles')?.doc ?? null : null;

  const bg1 = mapa['bg1'] ?? 'lt1';
  return {
    paket,
    indeks,
    slajd: { putanja: putanjaSlajda, doc: slajdDoc },
    layout,
    master,
    tema,
    mapaBoja: mapa,
    defaultTextStyle,
    tabelaStilova,
    t: z.t,
    pozadina: tema.boje[bg1] ?? PODRAZUMEVANA_TEMA.boje['lt1'],
    upozori(kod, poruka) {
      z.upozorenja.push({ slajd: indeks, kod, poruka });
    },
    medijIzVeze(odDela, rId) {
      const v = paket.veza(odDela, rId);
      if (!v || v.spoljna || !paket.postoji(v.cilj)) return null;
      const kljuc = `pptx:${v.cilj}`;
      if (!z.mediji.has(kljuc)) {
        const putanja = v.cilj;
        z.mediji.set(kljuc, { kljuc, ime: putanja.slice(putanja.lastIndexOf('/') + 1), bajtovi: () => paket.bajtovi(putanja) });
      }
      return kljuc;
    },
    noviMedij(ime, bajtovi) {
      const kljuc = `gen:${++z.brojacGen.n}`;
      z.mediji.set(kljuc, { kljuc, ime, bajtovi: () => bajtovi });
      return kljuc;
    },
  };
}
