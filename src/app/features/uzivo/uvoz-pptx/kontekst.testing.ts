// Kontekst slajda iz fabrike sintetičkih PPTX-ova, za specove F3-F11 (bez Angular-a).
import { napraviKontekst, transformacija, type ZajednickoUvoza } from './kontekst';
import { otvoriPaket } from './paket';
import { napraviPptx, type OpcijeFabrike } from './pptx-fabrika.testing';
import type { KontekstSlajda } from './tipovi';
import { dete, NS } from './xml';

/** Kontekst slajda rednog broja `indeks` (1-based, kao `KontekstSlajda.indeks`; podrazumevano prvi) iz fabrike. */
export function kontekstZaTest(o: OpcijeFabrike, indeks = 1): { ctx: KontekstSlajda; z: ZajednickoUvoza } {
  const paket = otvoriPaket(napraviPptx(o), 'test.pptx');
  const z: ZajednickoUvoza = { paket, t: transformacija(paket.velicina), upozorenja: [], mediji: new Map(), brojacGen: { n: 0 } };
  return { ctx: napraviKontekst(z, paket.slajdovi[indeks - 1], indeks), z };
}

/** Oblik slajda (`p:sp`, `p:pic`, `p:grpSp`, ...) sa datim `cNvPr id`, bilo gde u `p:spTree`; nema ga -> izuzetak. */
export function oblikSaId(ctx: KontekstSlajda, id: number): Element {
  const cSld = dete(ctx.slajd.doc.documentElement, NS.p, 'cSld');
  const stablo = cSld && dete(cSld, NS.p, 'spTree');
  for (const c of Array.from(stablo?.getElementsByTagNameNS(NS.p, 'cNvPr') ?? [])) {
    const oblik = c.parentElement?.parentElement;
    if (oblik && oblik !== stablo && c.getAttribute('id') === String(id)) return oblik;
  }
  throw new Error(`oblik ${id} nije na slajdu`);
}
