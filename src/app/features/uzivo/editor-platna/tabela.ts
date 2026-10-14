// Čiste operacije nad tabelom (F14, odluka 19): redovi i kolone, spajanje i razdvajanje, ivice, mere. Mreža ostaje
// ispravna kao na serveru (pokrivena ćelija pod tačno jednim sidrom, spajanja u granicama); radnja koja bi dala tabelu
// preko 30 x 30 ili širu/višu od 2880 vraća null, a pozivalac javlja poruku i ne menja dokument.
import type { Celija, Ivica, IviceCelije, Pasus, TabelaSloj, Tacka } from '../data-access/platno.models';
import { zaokruziKaoServer as z } from '../data-access/platno-provera';
import { MAX_VELICINA, SIRINA_PLATNA } from './geometrija';

export interface Polje { r: number; k: number; }
/** Uključivo, r1 <= r2, k1 <= k2. */
export interface Opseg { r1: number; k1: number; r2: number; k2: number; }
export type VrstaIvica = 'SVE' | 'SPOLJNE' | 'UNUTRASNJE' | 'NIJEDNA';
export const MAX_REDOVA = 30;
export const MAX_KOLONA = 30;
/** Server odbija širinu/visinu sloja preko 2880 (odluka 19): takva radnja vraća null, a pozivalac javlja ovu poruku. */
export const PREVELIKA_TABELA = 'Tabela ne može biti šira ni viša od 2880.';

/** Pravougaonik ćelije u koordinatama sloja (jedinice platna). */
export interface PravougaonikCelije { polje: Polje; x: number; y: number; w: number; h: number; }

/** Zbir mera zaokružen kao na serveru. */
const zbir = (mere: readonly number[]) => z(mere.reduce((a, b) => a + b, 0));
const kopija = (t: TabelaSloj) => t.celije.map((red) => red.map((c) => ({ ...c })));
const neprazan = (p: Pasus) => p.delovi.some((d) => d.tekst !== '');

/** Prazna ćelija sa formatom uzora (prvi pasus i prvi deo, bez teksta), bez spajanja. */
function prazna(uzor: Celija): Celija {
  const p = uzor.pasusi[0];
  return {
    ...uzor, spojDesno: 0, spojDole: 0, pokrivena: false,
    pasusi: p ? [{ ...p, delovi: p.delovi.slice(0, 1).map((d) => ({ ...d, tekst: '' })) }] : [],
  };
}

export function vlasnik(t: TabelaSloj, r: number, k: number): Polje {
  for (let i = r; i >= 0; i--) {
    for (let j = k; j >= 0; j--) {
      const c = t.celije[i][j];
      if (!c.pokrivena && i + c.spojDole >= r && j + c.spojDesno >= k) return { r: i, k: j };
    }
  }
  return { r, k };
}

/** Opseg sređen, u granicama tabele i proširen na cela spojena polja koja seče (dok se ne ustali). */
export function prosiriOpseg(t: TabelaSloj, o: Opseg): Opseg {
  const u = (v: number, n: number) => Math.min(n - 1, Math.max(0, v));
  const R = t.redovi.length;
  const K = t.kolone.length;
  let r1 = u(Math.min(o.r1, o.r2), R);
  let r2 = u(Math.max(o.r1, o.r2), R);
  let k1 = u(Math.min(o.k1, o.k2), K);
  let k2 = u(Math.max(o.k1, o.k2), K);
  for (let promena = true; promena;) {
    promena = false;
    for (let r = r1; r <= r2; r++) {
      for (let k = k1; k <= k2; k++) {
        const v = vlasnik(t, r, k);
        const c = t.celije[v.r][v.k];
        const n = { r1: Math.min(r1, v.r), k1: Math.min(k1, v.k), r2: Math.max(r2, v.r + c.spojDole), k2: Math.max(k2, v.k + c.spojDesno) };
        if (n.r1 !== r1 || n.k1 !== k1 || n.r2 !== r2 || n.k2 !== k2) {
          ({ r1, k1, r2, k2 } = n);
          promena = true;
        }
      }
    }
  }
  return { r1, k1, r2, k2 };
}

/** Nov red na indeksu `posle + 1`; red koji preseca vertikalno spajanje produžava ga (ćelije su pokrivene). */
export function dodajRed(t: TabelaSloj, posle: number): TabelaSloj | null {
  if (t.redovi.length >= MAX_REDOVA) return null;
  const r = posle + 1;
  const uzorRed = Math.min(Math.max(posle, 0), t.redovi.length - 1);
  const celije = kopija(t);
  const nov: Celija[] = [];
  for (let k = 0; k < t.kolone.length; k++) {
    const v = r > 0 ? vlasnik(t, r - 1, k) : null;
    const sidro = v ? t.celije[v.r][v.k] : null;
    if (v && sidro && v.r + sidro.spojDole >= r) {
      if (v.k === k) celije[v.r][v.k] = { ...celije[v.r][v.k], spojDole: celije[v.r][v.k].spojDole + 1 };
      nov.push({ ...prazna(sidro), pokrivena: true, pasusi: [] });
    } else {
      const u = vlasnik(t, uzorRed, k);
      nov.push(prazna(t.celije[u.r][u.k]));
    }
  }
  celije.splice(r, 0, nov);
  const redovi = [...t.redovi];
  redovi.splice(r, 0, t.redovi[uzorRed]);
  const visina = zbir(redovi);
  if (visina > MAX_VELICINA) return null;   // PREVELIKA_TABELA (odluka 19)
  return { ...t, celije, redovi, visina };
}

/** Nova kolona na indeksu `posle + 1` (isti algoritam po kolonama, `spojDesno`). */
export function dodajKolonu(t: TabelaSloj, posle: number): TabelaSloj | null {
  if (t.kolone.length >= MAX_KOLONA) return null;
  const k = posle + 1;
  const uzorKolona = Math.min(Math.max(posle, 0), t.kolone.length - 1);
  const celije = kopija(t);
  for (let r = 0; r < t.redovi.length; r++) {
    const v = k > 0 ? vlasnik(t, r, k - 1) : null;
    const sidro = v ? t.celije[v.r][v.k] : null;
    let nova: Celija;
    if (v && sidro && v.k + sidro.spojDesno >= k) {
      if (v.r === r) celije[v.r][v.k] = { ...celije[v.r][v.k], spojDesno: celije[v.r][v.k].spojDesno + 1 };
      nova = { ...prazna(sidro), pokrivena: true, pasusi: [] };
    } else {
      const u = vlasnik(t, r, uzorKolona);
      nova = prazna(t.celije[u.r][u.k]);
    }
    celije[r].splice(k, 0, nova);
  }
  const kolone = [...t.kolone];
  kolone.splice(k, 0, t.kolone[uzorKolona]);
  const sirina = zbir(kolone);
  if (sirina > MAX_VELICINA) return null;
  return { ...t, celije, kolone, sirina };
}

/** Briše red `r`: spajanja koja ga presecaju se skraćuju; sidro u tom redu sa spajanjem nadole prelazi u red ispod. */
export function obrisiRed(t: TabelaSloj, r: number): TabelaSloj | null {
  if (t.redovi.length <= 1) return null;
  const celije = kopija(t);
  for (let k = 0; k < t.kolone.length; k++) {
    const v = vlasnik(t, r, k);
    if (v.k !== k) continue;                       // svako sidro jednom (u svojoj prvoj koloni)
    const s = t.celije[v.r][v.k];
    if (s.spojDole === 0) continue;
    if (v.r < r) celije[v.r][v.k] = { ...celije[v.r][v.k], spojDole: s.spojDole - 1 };
    else celije[r + 1][k] = { ...s, spojDole: s.spojDole - 1, pokrivena: false };
  }
  celije.splice(r, 1);
  const redovi = t.redovi.filter((_, i) => i !== r);
  return { ...t, celije, redovi, visina: zbir(redovi) };
}

/** Briše kolonu `k` (isti algoritam po kolonama): sidro sa spajanjem udesno prelazi u kolonu desno. */
export function obrisiKolonu(t: TabelaSloj, k: number): TabelaSloj | null {
  if (t.kolone.length <= 1) return null;
  const celije = kopija(t);
  for (let r = 0; r < t.redovi.length; r++) {
    const v = vlasnik(t, r, k);
    if (v.r !== r) continue;
    const s = t.celije[v.r][v.k];
    if (s.spojDesno === 0) continue;
    if (v.k < k) celije[v.r][v.k] = { ...celije[v.r][v.k], spojDesno: s.spojDesno - 1 };
    else celije[r][k + 1] = { ...s, spojDesno: s.spojDesno - 1, pokrivena: false };
  }
  celije.forEach((red) => red.splice(k, 1));
  const kolone = t.kolone.filter((_, i) => i !== k);
  return { ...t, celije, kolone, sirina: zbir(kolone) };
}

/**
 * Spaja (prošireni) opseg: sidro je gornja leva ćelija, ostale postaju pokrivene bez pasusa; neprazni pasusi ostalih
 * (red po red) idu na kraj pasusa sidra (prazno sidro ih zamenjuje). Ništa za spajanje -> isti objekat.
 */
export function spoji(t: TabelaSloj, o: Opseg): TabelaSloj {
  const { r1, k1, r2, k2 } = prosiriOpseg(t, o);
  const sidro = t.celije[r1][k1];
  if (sidro.spojDole === r2 - r1 && sidro.spojDesno === k2 - k1) return t;
  const celije = kopija(t);
  const dodati: Pasus[] = [];
  for (let r = r1; r <= r2; r++) {
    for (let k = k1; k <= k2; k++) {
      if (r === r1 && k === k1) continue;
      const c = t.celije[r][k];
      dodati.push(...c.pasusi.filter(neprazan));
      celije[r][k] = { ...c, spojDesno: 0, spojDole: 0, pokrivena: true, pasusi: [] };
    }
  }
  const pasusi = !dodati.length ? sidro.pasusi : sidro.pasusi.some(neprazan) ? [...sidro.pasusi, ...dodati] : dodati;
  celije[r1][k1] = { ...sidro, spojDesno: k2 - k1, spojDole: r2 - r1, pokrivena: false, pasusi };
  return { ...t, celije };
}

/** Razdvaja spajanje vlasnika polja: polja postaju prazne ćelije sa formatom sidra, sidro gubi spajanje. */
export function razdvoji(t: TabelaSloj, p: Polje): TabelaSloj {
  const v = vlasnik(t, p.r, p.k);
  const s = t.celije[v.r][v.k];
  if (!s.spojDesno && !s.spojDole) return t;
  const celije = kopija(t);
  for (let r = v.r; r <= v.r + s.spojDole; r++) {
    for (let k = v.k; k <= v.k + s.spojDesno; k++) celije[r][k] = prazna(s);
  }
  celije[v.r][v.k] = { ...s, spojDesno: 0, spojDole: 0 };
  return { ...t, celije };
}

/** `f` nad svakim vlasnikom u (proširenom) opsegu; nepromenjena tabela -> isti objekat. */
export function izmeniCelije(t: TabelaSloj, o: Opseg, f: (c: Celija) => Celija): TabelaSloj {
  const { r1, k1, r2, k2 } = prosiriOpseg(t, o);
  let celije: Celija[][] | null = null;
  for (let r = r1; r <= r2; r++) {
    for (let k = k1; k <= k2; k++) {
      const c = t.celije[r][k];
      if (c.pokrivena) continue;
      const n = f(c);
      if (n === c) continue;
      celije ??= t.celije.map((red) => [...red]);
      celije[r][k] = n;
    }
  }
  return celije ? { ...t, celije } : t;
}

const istaIvica = (a: Ivica | null, b: Ivica | null) =>
  a === b || (!!a && !!b && a.boja === b.boja && a.debljina === b.debljina && a.crtica === b.crtica);

/**
 * Ivice vlasnika u (proširenom) opsegu: SVE = sve četiri strane, SPOLJNE = samo strane na rubu opsega (ostale null),
 * UNUTRASNJE = samo strane unutar opsega (rub null), NIJEDNA = sve null (`ivica` se ne gleda). Rub opsega dobija istu
 * vrednost i na suprotnoj strani suseda van opsega (prikaz crta širu od dve ivice deljene linije, `border-collapse`), pa
 * posle "Bez ivica" nema ruba ni sa jedne strane. Ćelija sa istim ivicama ostaje isti objekat; bez promene isti `t`.
 */
export function postaviIvice(t: TabelaSloj, o: Opseg, vrsta: VrstaIvica, ivica: Ivica | null): TabelaSloj {
  const g = prosiriOpseg(t, o);
  const iv = vrsta === 'NIJEDNA' ? null : ivica;
  const strana = (rub: boolean) => (vrsta === 'SVE' || (vrsta === 'SPOLJNE') === rub ? iv : null);
  let celije: Celija[][] | null = null;
  const postavi = (r: number, k: number, izmena: Partial<IviceCelije>) => {
    const c = (celije ?? t.celije)[r][k];
    const strane = Object.keys(izmena) as (keyof IviceCelije)[];
    if (strane.every((s) => istaIvica(c.ivice[s], izmena[s] ?? null))) return;
    celije ??= t.celije.map((red) => [...red]);
    celije[r][k] = { ...c, ivice: { ...c.ivice, ...izmena } };
  };
  const sused = (r: number, k: number, izmena: Partial<IviceCelije>) => {
    const v = vlasnik(t, r, k);
    postavi(v.r, v.k, izmena);
  };
  const R = t.redovi.length;
  const K = t.kolone.length;
  for (let r = g.r1; r <= g.r2; r++) {
    for (let k = g.k1; k <= g.k2; k++) {
      const c = t.celije[r][k];
      if (c.pokrivena) continue;
      const dno = r + c.spojDole;
      const desno = k + c.spojDesno;
      const gore = strana(r === g.r1);
      const dole = strana(dno === g.r2);
      const levo = strana(k === g.k1);
      const desnaIvica = strana(desno === g.k2);
      postavi(r, k, { gore, dole, levo, desno: desnaIvica });
      // susedi van opsega (opseg je proširen, pa se njihova ivica poklapa sa rubom)
      for (let j = k; j <= desno; j++) {
        if (r === g.r1 && r > 0) sused(r - 1, j, { dole: gore });
        if (dno === g.r2 && dno < R - 1) sused(dno + 1, j, { gore: dole });
      }
      for (let i = r; i <= dno; i++) {
        if (k === g.k1 && k > 0) sused(i, k - 1, { desno: levo });
        if (desno === g.k2 && desno < K - 1) sused(i, desno + 1, { levo: desnaIvica });
      }
    }
  }
  return celije ? { ...t, celije } : t;
}

/** Širina kolone `k`; širina sloja = zbir kolona; null preko 2880. */
export function sirinaKolone(t: TabelaSloj, k: number, sirina: number): TabelaSloj | null {
  const kolone = t.kolone.map((w, i) => (i === k ? z(sirina) : w));
  const s = zbir(kolone);
  return s > MAX_VELICINA ? null : { ...t, kolone, sirina: s };
}

/** Visina reda `r`; visina sloja = zbir redova; null preko 2880. */
export function visinaReda(t: TabelaSloj, r: number, visina: number): TabelaSloj | null {
  const redovi = t.redovi.map((h, i) => (i === r ? z(visina) : h));
  const v = zbir(redovi);
  return v > MAX_VELICINA ? null : { ...t, redovi, visina: v };
}

export function celijaNaTacki(pravougaonici: readonly { polje: Polje; x: number; y: number; w: number; h: number }[], t: Tacka): Polje | null {
  const p = pravougaonici.find((c) => t.x >= c.x && t.x <= c.x + c.w && t.y >= c.y && t.y <= c.y + c.h);
  return p ? { ...p.polje } : null;
}

/** Sledeći (smer 1) ili prethodni (-1) vlasnik redom čitanja (Tab u ćeliji); null na kraju ili početku tabele. */
export function sledecaCelija(t: TabelaSloj, p: Polje, smer: 1 | -1): Polje | null {
  const K = t.kolone.length;
  for (let i = p.r * K + p.k + smer; i >= 0 && i < t.redovi.length * K; i += smer) {
    const r = Math.floor(i / K);
    const k = i % K;
    if (!t.celije[r][k].pokrivena) return { r, k };
  }
  return null;
}

/** Pravougaonik vlasnika polja po merama modela (bez rasta reda zbog teksta; rezerva kad DOM nije izmeren). */
export function pravougaonikPolja(t: TabelaSloj, p: Polje): PravougaonikCelije {
  const v = vlasnik(t, p.r, p.k);
  const c = t.celije[v.r][v.k];
  const deo = (mere: number[], od: number, n: number) => zbir(mere.slice(od, od + n));
  return {
    polje: v, x: deo(t.kolone, 0, v.k), y: deo(t.redovi, 0, v.r),
    w: deo(t.kolone, v.k, c.spojDesno + 1), h: deo(t.redovi, v.r, c.spojDole + 1),
  };
}

/**
 * Pravougaonici vlasnika tabele u koordinatama sloja, izmereni iz nacrtanih `td[data-celija]` sloja u `platno` (red koji je
 * tekst raširio je viši od modela; `offset*` ne vidi rotaciju sloja, a deli se sa px po jedinici). Bez merenja (sloj nije
 * nacrtan, jsdom) po merama modela.
 */
export function pravougaoniciTabele(platno: Element | null, t: TabelaSloj): PravougaonikCelije[] {
  const sirina = platno?.getBoundingClientRect().width ?? 0;
  const izmereno = izmeriCelije(platno?.querySelector(`[data-sloj="${t.id}"]`), sirina > 0 ? sirina / SIRINA_PLATNA : 1);
  if (izmereno.length) return izmereno;
  return t.celije.flatMap((red, r) => red.flatMap((c, k) => (c.pokrivena ? [] : [pravougaonikPolja(t, { r, k })])));
}

function izmeriCelije(sloj: Element | null | undefined, px: number): PravougaonikCelije[] {
  if (!sloj) return [];
  return Array.from(sloj.querySelectorAll<HTMLTableCellElement>('td[data-celija]')).flatMap((td) => {
    const [r, k] = (td.dataset['celija'] ?? '').split('-').map(Number);
    const tabela = td.closest('table');
    if (!td.offsetWidth || !tabela) return [];
    return [{
      polje: { r, k }, x: (td.offsetLeft + tabela.offsetLeft) / px, y: (td.offsetTop + tabela.offsetTop) / px,
      w: td.offsetWidth / px, h: td.offsetHeight / px,
    }];
  });
}
