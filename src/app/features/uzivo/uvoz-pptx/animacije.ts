// Animacije PowerPointa (`p:timing`, niz `mainSeq`) -> animacije platna (bez Angular-a i RxJS-a).
//
// Vreme: za svaki efekat prvo se odredi početak u PowerPointu (od klika, za SVE efekte grupe, i one koji se preskaču), a
// zadržana animacija dobija kašnjenje koje na platnu (`platno-koraci.ts`, `grupaZaKorak`) daje isti početak. Početak je
// onaj koji je PowerPoint zapisao: zbir kašnjenja predaka efekta u grupi klika (unutrašnji `p:par` "posle prethodnog"
// nosi već izračunat kraj prethodnih, uključujući `p:iterate` i ponavljanje). Samo kad zapis ne nosi početak
// (nebrojčano kašnjenje, ili efekat posle/klik koji nije prvi u svom `p:par`-u) računa se po pravilima okidača: SA kreće
// kad i prethodni (pre njegovog kašnjenja), POSLE na najkasnijem kraju svih prethodnih, pa kašnjenje efekta (isto kao
// platno). Bez preskakanja kašnjenje animacije je baš kašnjenje efekta; sa preskočenim efektom (putanja, naglašavanje,
// meta koja nije uvezena) sledeći efekti ne kreću ranije nego u PowerPointu. Vreme se gubi samo na granici 0..10000 ms.
//
// IZLAZ BRISANJE i PODELI na platnu su obrnut ulaz (`kadroviAnimacije`). PowerPointov izlaz "Wipe" nosi isti podtip
// kao ulaz (strana sa koje brisanje KREĆE: izlaz "From Bottom" prvo sakriva donji deo), a obrnut ulaz odozdo bi prvo
// sakrio gornji: zato se smer izlaza BRISANJA zrcali (F19; dokaz u `animacije.spec.ts`). PODELI (`barn`) se u
// PowerPointu za izlaz pušta obrnuto u vremenu, kao na platnu, pa se ne zrcali.
import type { Animacija, Efekat, Okidac, Smer, VrstaAnimacije } from '../data-access/platno.models';
import { GRANICE } from './granice';
import type { KodUpozorenja } from './izvestaj';
import { NS, brojAtr, dete } from './xml';

export interface MetaPasusa { slojId: string; pasus: number | null; spojeno: boolean; }
export interface MapaMeta {
  /** Svi slojevi objekta (grupa = sva deca, redom z-ose); [] = nije uvezen. */
  slojevi(spid: string): readonly string[];
  /** TEKST: {sloj, i}; rasklopljena formula: {sloj pojasa, null}; nerasklopljena: {sloj, null, spojeno: true}; null = pasus nije uvezen. */
  pasus(spid: string, i: number): MetaPasusa | null;
}
export interface RezultatAnimacija { animacije: Animacija[]; efekataPptx: number; klikoviPptx: number; }

const MAX_MS = 10_000;
/** Najviše pasusa iz jednog `p:pRg` (PowerPoint piše `st == end`; opseg je samo odbrana od nemogućeg `end`). */
const MAX_OPSEG = 1000;

type OkidacPptx = 'clickEffect' | 'withEffect' | 'afterEffect';

interface MetaEfekta {
  spid: string;
  /** Indeksi pasusa iz `p:txEl/p:pRg`, ili null kad je meta ceo objekat. */
  pasusi: number[] | null;
  /** Meta je deo objekta koji model nema (`p:charRg`, `p:bg`, `p:graphicEl`, ...): animira se ceo objekat. */
  deo: boolean;
}

interface EfekatPptx {
  klasa: string;
  preset: number;
  podtip: number;
  okidac: OkidacPptx;
  meta: MetaEfekta | null;
  filter: string;
  iterira: boolean;
  /** Kašnjenje efekta (ms, >= 0). */
  kasnjenje: number;
  /** Jedan prolaz efekta: najkasniji kraj ponašanja (kašnjenje + `dur` potomka). */
  trajanje: number;
  /** Trajanje sa ponavljanjem (`repeatCount`, `autoRev`): za početak sledećih efekata. */
  ukupno: number;
  /** Efekat ili njegovo ponašanje se ponavlja (platno pušta jedan prolaz). */
  ponavlja: boolean;
  /** Početak od klika kako ga je PowerPoint zapisao, ili null (računa se po okidačima). */
  zapisaniPocetak: number | null;
}

const ogranici = (ms: number) => Math.min(MAX_MS, Math.max(0, Math.round(ms)));

function cvorovi(el: Element): Element[] {
  return Array.from(el.getElementsByTagNameNS(NS.p, 'cTn'));
}

function nizovi(timing: Element | null, tip: 'mainSeq' | 'interactiveSeq'): Element[] {
  return timing ? cvorovi(timing).filter((c) => c.getAttribute('nodeType') === tip) : [];
}

/** Efekti niza redom dokumenta: `p:cTn[@presetClass]` (efekat ugnježden u efekat se ne broji posebno). */
function efektiNiza(niz: Element): Element[] {
  const rez: Element[] = [];
  for (const c of cvorovi(niz)) {
    if (!c.hasAttribute('presetClass')) continue;
    // Redom dokumenta potomak efekta dolazi odmah posle svog efekta (i njegovih potomaka), pa je dovoljan poslednji.
    if (rez.length > 0 && rez[rez.length - 1].contains(c)) continue;
    rez.push(c);
  }
  return rez;
}

/** Kašnjenje čvora: `p:stCondLst/p:cond@delay` (prvi uslov); `indefinite` ili nebroj -> 0. */
function kasnjenjeCvora(c: Element): number {
  const uslovi = dete(c, NS.p, 'stCondLst');
  return Math.max(0, brojAtr(uslovi && dete(uslovi, NS.p, 'cond'), 'delay', 0));
}

/** Koliko puta se čvor odigra: `repeatCount` (u hiljaditim delovima; `indefinite` -> 1) puta 2 za `autoRev`. */
function ponavljanje(c: Element): number {
  const n = brojAtr(c, 'repeatCount', 1000) / 1000;
  const obrnuto = ['1', 'true'].includes(c.getAttribute('autoRev') ?? '') ? 2 : 1;
  return (n > 0 ? n : 1) * obrnuto;
}

/** Čvor ima `repeatCount` različit od jednog prolaza (i `indefinite`) ili `autoRev`. */
function ponavljaSe(c: Element): boolean {
  const rc = c.getAttribute('repeatCount');
  return (rc !== null && Number(rc) !== 1000) || ['1', 'true'].includes(c.getAttribute('autoRev') ?? '');
}

/** Zapisano kašnjenje čvora (`p:stCondLst/p:cond@delay`, prvi uslov), ili null kad ga nema ili nije broj. */
function zapisanoKasnjenje(c: Element): number | null {
  const uslovi = dete(c, NS.p, 'stCondLst');
  const v = (uslovi && dete(uslovi, NS.p, 'cond'))?.getAttribute('delay');
  const n = v == null || v.trim() === '' ? Number.NaN : Number(v);
  return Number.isFinite(n) ? Math.max(0, n) : null;
}

/** Efekti jedne liste dece (`p:childTnLst`): indeks svakog efekta i prvi indeks >= 1 koji nije "sa prethodnim". */
interface Braca { indeks: Map<Element, number>; prviNeSa: number; }
/** Keš po listi dece: bez njega se lista gradi i pretražuje za svaki efekat (kvadratno; neprijateljski fajl visi). */
type KesBrace = Map<Element, Braca>;

function bracaEfekta(lista: Element, kes: KesBrace): Braca {
  let b = kes.get(lista);
  if (b) return b;
  const indeks = new Map<Element, number>();
  let prviNeSa = Number.POSITIVE_INFINITY;
  for (const p of Array.from(lista.children)) {
    const x = dete(p, NS.p, 'cTn');
    if (!x?.hasAttribute('presetClass')) continue;
    const i = indeks.size;
    indeks.set(x, i);
    if (i >= 1 && prviNeSa === Number.POSITIVE_INFINITY && x.getAttribute('nodeType') !== 'withEffect') prviNeSa = i;
  }
  b = { indeks, prviNeSa };
  kes.set(lista, b);
  return b;
}

/**
 * Početak efekta od klika kako ga je PowerPoint zapisao: zbir kašnjenja svih `p:cTn` predaka (i samog efekta) ispod
 * spoljnog `p:par` grupe klika. PowerPoint stavlja svaki efekat "posle prethodnog" na čelo novog unutrašnjeg `p:par`-a
 * sa izračunatim kašnjenjem, a "sa prethodnim" u `p:par` svog čela; efekat posle/klik koji nije prvi u svom `p:par`-u
 * (ručno pisan XML) zapis ne opisuje, pa je tada (i za nebrojčano kašnjenje) rezultat null.
 */
function zapisaniPocetak(c: Element, niz: Element, kes: KesBrace): number | null {
  const lista = c.parentElement?.parentElement;
  if (!lista) return null;
  const braca = bracaEfekta(lista, kes);
  const k = braca.indeks.get(c) ?? -1;
  if (braca.prviNeSa <= k) return null;
  const preci: Element[] = [];
  let x: Element | null = c;
  for (; x && x !== niz; x = x.parentElement) if (x.localName === 'cTn' && x.namespaceURI === NS.p) preci.push(x);
  if (x !== niz || preci.length < 2) return null;
  preci.pop();   // spoljni `p:cTn` grupe klika (`delay="indefinite"`, kreće na klik)
  let t = 0;
  for (const p of preci) {
    const d = zapisanoKasnjenje(p);
    if (d === null) return null;
    t += d;
  }
  return t;
}

function opsegPasusa(pRg: Element): number[] | null {
  const st = brojAtr(pRg, 'st', -1);
  if (!Number.isInteger(st) || st < 0) return null;
  const end = brojAtr(pRg, 'end', st);
  const kraj = Number.isInteger(end) && end >= st ? Math.min(end, st + MAX_OPSEG - 1) : st;
  return Array.from({ length: kraj - st + 1 }, (_, i) => st + i);
}

/** Meta iz prvog `p:spTgt` efekta (ili `p:inkTgt`); null kad efekat ne cilja oblik. */
function metaEfekta(efekat: Element): MetaEfekta | null {
  const tgt = efekat.getElementsByTagNameNS(NS.p, 'spTgt')[0] ?? efekat.getElementsByTagNameNS(NS.p, 'inkTgt')[0];
  const spid = tgt?.getAttribute('spid');
  if (!tgt || !spid) return null;
  const txEl = dete(tgt, NS.p, 'txEl');
  const pRg = txEl && dete(txEl, NS.p, 'pRg');
  const pasusi = pRg ? opsegPasusa(pRg) : null;
  return { spid, pasusi, deo: pasusi === null && tgt.children.length > 0 };
}

function procitaj(c: Element, niz: Element, kes: KesBrace): EfekatPptx {
  const klasa = c.getAttribute('presetClass') ?? '';
  const preset = brojAtr(c, 'presetID', 0);
  const tip = c.getAttribute('nodeType');
  let trajanje = 0;
  let ukupno = 0;
  let ponavlja = ponavljaSe(c);
  for (const d of cvorovi(c)) {
    ponavlja ||= ponavljaSe(d);
    const dur = brojAtr(d, 'dur', Number.NaN);
    if (!Number.isFinite(dur) || dur < 0) continue;
    trajanje = Math.max(trajanje, kasnjenjeCvora(d) + dur);
    ukupno = Math.max(ukupno, kasnjenjeCvora(d) + dur * ponavljanje(d));
  }
  // Appear je `set` od 1 ms: na platnu traje 0, pa se i za vreme sledećih računa 0.
  const pojavi = preset === 1 && (klasa === 'entr' || klasa === 'exit');
  return {
    klasa, preset,
    podtip: brojAtr(c, 'presetSubtype', 0),
    okidac: tip === 'clickEffect' || tip === 'afterEffect' ? tip : 'withEffect',
    meta: metaEfekta(c),
    filter: c.getElementsByTagNameNS(NS.p, 'animEffect')[0]?.getAttribute('filter') ?? '',
    iterira: dete(c, NS.p, 'iterate') !== null,
    kasnjenje: kasnjenjeCvora(c),
    trajanje: pojavi ? 0 : trajanje,
    ukupno: pojavi ? 0 : ukupno * ponavljanje(c),
    ponavlja,
    zapisaniPocetak: zapisaniPocetak(c, niz, kes),
  };
}

/** Strana sa koje objekat dolazi iz bit-maske podtipa (1 gore, 2 desno, 4 dole, 8 levo); dijagonale po vertikali. */
function smerIzPodtipa(podtip: number): Smer {
  if (podtip & 1) return 'GORE';
  if (podtip & 4) return 'DOLE';
  if (podtip & 8) return 'LEVO';
  if (podtip & 2) return 'DESNO';
  return 'DOLE';
}

/** Suprotna strana (izlaz BRISANJA). */
const ZRCALO: Record<Smer, Smer> = {
  GORE: 'DOLE', DOLE: 'GORE', LEVO: 'DESNO', DESNO: 'LEVO', HORIZONTALNO: 'HORIZONTALNO', VERTIKALNO: 'VERTIKALNO',
};

interface Preslikano { efekat: Efekat; smer: Smer | null; }

function preslikaj(e: EfekatPptx, u: Zbirna): Preslikano {
  switch (e.preset) {
    case 1: return { efekat: 'POJAVI', smer: null };
    case 10: return { efekat: 'FADE', smer: null };
    case 2: return { efekat: 'ULET', smer: smerIzPodtipa(e.podtip) };
    // IZLAZ: zrcaljen smer, jer platno izlaz crta kao obrnut ulaz (zaglavlje).
    case 22: return { efekat: 'BRISANJE', smer: e.klasa === 'exit' ? ZRCALO[smerIzPodtipa(e.podtip)] : smerIzPodtipa(e.podtip) };
    case 16: {
      const m = /barn\((in|out)?(vertical|horizontal)\)/i.exec(e.filter);
      // platno PODELI crta od sredine, a izlaz kao obrnut ulaz (ka sredini): poruka opisuje ono što se zaista vidi
      if (m?.[1]?.toLowerCase() === 'in') {
        u.dodaj('PODELI_SMER', e.klasa === 'exit'
          ? 'Izlaz podelom od sredine se prikazuje kao izlaz podelom ka sredini.'
          : 'Podela ka sredini se prikazuje kao podela od sredine.');
      }
      return { efekat: 'PODELI', smer: m?.[2].toLowerCase() === 'horizontal' ? 'HORIZONTALNO' : 'VERTIKALNO' };
    }
    case 23:
    case 53: return { efekat: 'ZUM', smer: null };
    case 31:
      u.dodaj('EFEKAT_PRIBLIZAN', 'Efekat 31 se prikazuje kao ZUM, bez okretanja.');
      return { efekat: 'ZUM', smer: null };
    case 63:
      if (e.klasa === 'entr') return { efekat: 'ISCRTAJ', smer: 'LEVO' };
      break;
  }
  u.dodaj('EFEKAT_ZAMENJEN', `Efekat ${e.preset} nije podržan; prikazuje se kao FADE.`);
  return { efekat: 'FADE', smer: null };
}

/** Upozorenja jednog slajda: isto upozorenje (kod + poruka) se prijavljuje jednom, sa brojem ponavljanja. */
class Zbirna {
  private readonly m = new Map<string, { kod: KodUpozorenja; poruka: string; n: number }>();
  dodaj(kod: KodUpozorenja, poruka: string): void {
    const k = `${kod}|${poruka}`;
    const v = this.m.get(k);
    if (v) v.n++; else this.m.set(k, { kod, poruka, n: 1 });
  }
  posalji(upozori: (kod: KodUpozorenja, poruka: string) => void): void {
    for (const { kod, poruka, n } of this.m.values()) {
      upozori(kod, n === 1 ? poruka : `${poruka.replace(/\.$/, '')} (${n} puta).`);
    }
  }
}

const PRESKOCENA_KLASA: Readonly<Record<string, string>> = {
  emph: 'Animacija naglašavanja nije podržana i preskočena je.',
  path: 'Animacija putanje nije podržana i preskočena je.',
};

interface Cilj { slojId: string; pasus: number | null; }

/** Slojevi (i pasusi) koje efekat pogađa; [] = preskače se (upozorenje je već dodato kad treba). */
function ciljevi(e: EfekatPptx, vrsta: VrstaAnimacije, mete: MapaMeta, spojeni: Set<string>, u: Zbirna): Cilj[] {
  const meta = e.meta;
  const slojevi = meta?.pasusi ? [] : meta ? mete.slojevi(meta.spid) : [];
  if (!meta || (!meta.pasusi && slojevi.length === 0)) {
    u.dodaj('ANIMACIJA_PRESKOCENA', 'Animacija cilja objekat koji nije uvezen i preskočena je.');
    return [];
  }
  if (!meta.pasusi) {
    if (meta.deo) u.dodaj('EFEKAT_PRIBLIZAN', 'Animacija dela objekta se prikazuje na celom objektu.');
    return slojevi.map((slojId) => ({ slojId, pasus: null }));
  }
  const rez: Cilj[] = [];
  const vec = new Set<string>();
  let uvezenih = 0;
  for (const i of meta.pasusi) {
    const mp = mete.pasus(meta.spid, i);
    if (!mp) continue;
    uvezenih++;
    // Nerasklopljena formula: ostaje samo prva animacija iste vrste (FORMULA_ODJEDNOM je već prijavljen).
    if (mp.spojeno) {
      const kljuc = `${mp.slojId}|${vrsta}`;
      if (spojeni.has(kljuc)) continue;
      spojeni.add(kljuc);
    }
    const pasus = mp.spojeno ? null : mp.pasus;
    const kljuc = `${mp.slojId}|${pasus}`;
    if (!vec.has(kljuc)) {
      vec.add(kljuc);
      rez.push({ slojId: mp.slojId, pasus });
    }
  }
  if (uvezenih === 0) u.dodaj('ANIMACIJA_PRESKOCENA', 'Animacija cilja pasus koji nije uvezen i preskočena je.');
  return rez;
}

/**
 * Animacije slajda iz `p:timing`. Efekti `interactiveSeq` (okidač klikom na objekat) se preskaču uz jedno upozorenje.
 * Grupa klika PowerPointa počinje na `clickEffect`; ako se njen KLIK efekat preskoči, prvi zadržan efekat iste grupe
 * postaje KLIK, a bez njega slajd ima korak manje (`KLIK_IZGUBLJEN`). Kopije za više slojeva: prva nosi okidač, ostale
 * su SA_PRETHODNIM sa istim kašnjenjem. Granicu od 400 animacija proverava `uklopiUGranice` (F11); gradnja staje čim
 * animacija ima više od granice (grupa od hiljada slojeva puta hiljade efekata bi inače pravila milione objekata), pa
 * rezultat sa `GRANICE.animacija + 1` animacija postaje greška slajda sa istom porukom.
 */
export function pretvoriAnimacije(timing: Element | null, mete: MapaMeta,
                                  upozori: (kod: KodUpozorenja, poruka: string) => void): RezultatAnimacija {
  const u = new Zbirna();
  if (nizovi(timing, 'interactiveSeq').some((n) => efektiNiza(n).length > 0)) {
    u.dodaj('ANIMACIJA_PRESKOCENA', 'Preskočene su animacije koje pokreće klik na objekat: okidač klikom na objekat nije podržan.');
  }
  const kes: KesBrace = new Map();
  const efekti = nizovi(timing, 'mainSeq').flatMap((niz) => efektiNiza(niz).map((c) => procitaj(c, niz, kes)));
  const grupe: EfekatPptx[][] = [[]];
  for (const e of efekti) {
    if (e.okidac === 'clickEffect') grupe.push([e]); else grupe[grupe.length - 1].push(e);
  }

  const animacije: Animacija[] = [];
  const spojeni = new Set<string>();
  const preko = () => animacije.length > GRANICE.animacija;
  for (let gi = 0; gi < grupe.length && !preko(); gi++) {
    const grupa = grupe[gi];
    // PowerPoint: okidanje prethodnog efekta i najkasniji kraj svih prethodnih (od klika).
    let okidanjePpt = 0;
    let krajPpt = 0;
    // Platno, isto kao `grupaZaKorak`.
    let okidanjePl = 0;
    let krajPl = 0;
    let prva = true;
    let trebaKlik = gi > 0;
    for (let i = 0; i < grupa.length && !preko(); i++) {
      const e = grupa[i];
      const okidanje = i === 0 ? 0 : e.okidac === 'afterEffect' ? krajPpt : okidanjePpt;
      const pocetak = e.zapisaniPocetak ?? okidanje + e.kasnjenje;
      okidanjePpt = e.zapisaniPocetak === null ? okidanje : Math.max(0, pocetak - e.kasnjenje);
      krajPpt = Math.max(krajPpt, pocetak + e.ukupno);

      if (e.klasa !== 'entr' && e.klasa !== 'exit') {
        u.dodaj('ANIMACIJA_PRESKOCENA', PRESKOCENA_KLASA[e.klasa] ?? `Animacija vrste "${e.klasa}" nije podržana i preskočena je.`);
        continue;
      }
      const vrsta: VrstaAnimacije = e.klasa === 'entr' ? 'ULAZ' : 'IZLAZ';
      const cilj = ciljevi(e, vrsta, mete, spojeni, u);
      if (cilj.length === 0) continue;
      const { efekat, smer } = preslikaj(e, u);
      if (e.iterira) u.dodaj('TEKST_PRIBLIZAN', 'Animacija po rečima ili slovima prikazuje ceo tekst odjednom.');
      if (e.ponavlja) u.dodaj('EFEKAT_PRIBLIZAN', 'Ponavljanje efekta se ne prenosi: efekat se pušta jednom.');
      const trajanjeMs = efekat === 'POJAVI' ? 0 : ogranici(e.trajanje);
      for (let j = 0; j < cilj.length && !preko(); j++) {
        const c = cilj[j];
        const okidac: Okidac = j > 0 ? 'SA_PRETHODNIM' : trebaKlik ? 'KLIK' : e.okidac === 'afterEffect' ? 'POSLE_PRETHODNOG' : 'SA_PRETHODNIM';
        const okidanjeAn = prva ? 0 : okidac === 'POSLE_PRETHODNOG' ? krajPl : okidanjePl;
        const kasnjenjeMs = ogranici(pocetak - okidanjeAn);
        okidanjePl = okidanjeAn;
        krajPl = Math.max(krajPl, okidanjeAn + kasnjenjeMs + trajanjeMs);
        prva = false;
        trebaKlik = false;
        animacije.push({
          id: `a${animacije.length + 1}`, slojId: c.slojId, pasus: c.pasus, vrsta, efekat, smer, okidac, trajanjeMs, kasnjenjeMs,
        });
      }
    }
    if (trebaKlik && !preko()) {
      u.dodaj('KLIK_IZGUBLJEN', `Klik ${gi} pokreće samo animacije koje nisu uvezene: slajd ima korak manje nego u PowerPointu.`);
    }
  }
  u.posalji(upozori);
  return {
    animacije,
    efekataPptx: efekti.length,
    klikoviPptx: efekti.filter((e) => e.okidac === 'clickEffect').length,
  };
}

/** spid -> indeksi pasusa koje ciljaju ulazni i izlazni efekti `mainSeq` (samo oni postaju animacije platna). */
export function pasusiSaAnimacijom(timing: Element | null): Map<string, Set<number>> {
  const rez = new Map<string, Set<number>>();
  for (const c of nizovi(timing, 'mainSeq').flatMap(efektiNiza)) {
    const klasa = c.getAttribute('presetClass');
    const meta = metaEfekta(c);
    if ((klasa !== 'entr' && klasa !== 'exit') || !meta?.pasusi) continue;
    const skup = rez.get(meta.spid) ?? new Set<number>();
    for (const i of meta.pasusi) skup.add(i);
    rez.set(meta.spid, skup);
  }
  return rez;
}
