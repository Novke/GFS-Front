import type { Node as PmCvor, Schema } from 'prosemirror-model';
import type { Deo, Pasus } from '../../data-access/platno.models';
import type { AtributiDela, AtributiPasusa } from './pm-sema';

/**
 * Preslikavanje pasusa modela u ProseMirror dokument i nazad (odluka 17), bez gubitka do normalizacije:
 * `dokUPasuse(pasusiUDok(p)) = normalizujPasuse(p)` (prazni delovi nepraznog pasusa se izostavljaju, susedni delovi
 * istog stila se spajaju; prikaz ih ionako crta isto).
 */

const POLJA_DELA = ['font', 'velicina', 'boja', 'podebljano', 'kurziv', 'podvuceno', 'precrtano', 'polozaj'] as const;

/** Atributi dela bez teksta (samo 8 polja modela). */
export function atributiDela(d: Deo): AtributiDela {
  return {
    font: d.font, velicina: d.velicina, boja: d.boja, podebljano: d.podebljano, kurziv: d.kurziv,
    podvuceno: d.podvuceno, precrtano: d.precrtano, polozaj: d.polozaj,
  };
}

export function istiStil(a: AtributiDela, b: AtributiDela): boolean {
  return POLJA_DELA.every((k) => a[k] === b[k]);
}

/** Atributi pasusa modela (bez delova), duboka kopija: dokument i model ne dele objekte (`uvlacenje`, `lista`, ...). */
function atributiPasusa(p: Omit<Pasus, 'delovi'>): Omit<Pasus, 'delovi'> {
  return structuredClone({
    poravnanje: p.poravnanje, nivo: p.nivo, lista: p.lista, uvlacenje: p.uvlacenje, razmakPre: p.razmakPre,
    razmakPosle: p.razmakPosle, proredProcenat: p.proredProcenat, tabulatori: p.tabulatori,
  });
}

/** Svaki pasus dobija ključ `p<i>` (i = indeks u ulazu), po kome animacije pasusa prate pasus kroz uređivanje. */
export function pasusiUDok(pasusi: readonly Pasus[], sema: Schema): PmCvor {
  const cvorovi = pasusi.map((p, i) => {
    const neprazni = p.delovi.filter((d) => d.tekst !== '');
    const sadrzaj: PmCvor[] = [];
    for (const d of neprazni) {
      const znak = sema.marks['stil'].create(atributiDela(d));
      d.tekst.split('\n').forEach((komad, j) => {
        if (j > 0) sadrzaj.push(sema.nodes['prelom'].create(null, null, [znak]));
        if (komad) sadrzaj.push(sema.text(komad, [znak]));
      });
    }
    const prazanDeo = neprazni.length === 0 && p.delovi[0] ? atributiDela(p.delovi[0]) : null;
    const attrs: AtributiPasusa = { ...atributiPasusa(p), prazanDeo, kljuc: `p${i}` };
    return sema.nodes['pasus'].create(attrs, sadrzaj);
  });
  return sema.nodes['doc'].create(null, cvorovi.length ? cvorovi : [sema.nodes['pasus'].create()]);
}

export function dokUPasuse(dok: PmCvor): Pasus[] {
  const pasusi: Pasus[] = [];
  dok.forEach((cvor) => {
    const a = cvor.attrs as AtributiPasusa;
    const delovi: Deo[] = [];
    cvor.forEach((dete) => {
      const stil = dete.marks.find((m) => m.type.name === 'stil')?.attrs as AtributiDela | undefined;
      if (!stil) return; // dodatak stila (F12) garantuje mark; bez njega deo ne bi imao font ni veličinu
      const tekst = dete.isText ? (dete.text ?? '') : '\n';
      const poslednji = delovi[delovi.length - 1];
      if (poslednji && istiStil(atributiDela(poslednji), stil)) poslednji.tekst += tekst;
      else delovi.push({ tekst, ...atributiDela({ ...stil, tekst: '' }) });
    });
    pasusi.push({
      ...atributiPasusa(a),
      delovi: delovi.length ? delovi : a.prazanDeo ? [{ tekst: '', ...atributiDela({ ...a.prazanDeo, tekst: '' }) }] : [],
    });
  });
  return pasusi;
}

export function normalizujPasuse(pasusi: readonly Pasus[]): Pasus[] {
  return pasusi.map((p) => {
    const neprazni = p.delovi.filter((d) => d.tekst !== '');
    if (neprazni.length === 0) return { ...p, delovi: p.delovi.slice(0, 1) };
    const spojeni: Deo[] = [];
    for (const d of neprazni) {
      const pre = spojeni[spojeni.length - 1];
      if (pre && istiStil(atributiDela(pre), atributiDela(d))) spojeni[spojeni.length - 1] = { ...pre, tekst: pre.tekst + d.tekst };
      else spojeni.push({ ...d });
    }
    return { ...p, delovi: spojeni };
  });
}
