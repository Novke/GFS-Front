// Čiste izmene dokumenta platna za editor (odluke 8, 13-16): svaka komanda vraća nov `Platno` (nepromenljivi objekti,
// nepromenjeni slojevi ostaju isti objekti), a komanda koja ne menja dokument vraća ISTI objekat `p`, pa `primeni` ne
// beleži korak i ne šalje `PUT`. Rezultati su u granicama servera (kutije kroz `ogranici`, brojevi na 2 decimale).
// Pravila editora (zaključan sloj, granice broja slojeva i animacija) proverava store pre poziva, ne ove funkcije.
import { moveItemInArray } from '@angular/cdk/drag-drop';
import type { Platno, Sloj, Tacka, VrstaOblika } from '../data-access/platno.models';
import { zaokruziKaoServer as z } from '../data-access/platno-provera';
import { uSredini } from '../data-access/platno-novo';
import { type Kutija, MAX_XY, MIN_XY, kutijaSloja, ogranici, pomeriKutiju } from './geometrija';

export type SmerZ = 'NAPRED' | 'NAZAD' | 'NA_VRH' | 'NA_DNO';
/** Pomeraj kopije (lepljenje, dupliranje) i svakog sledećeg ubačenog sloja na istom mestu (odluke 12, 15). */
export const POMAK_KOPIJE = 12;
/** Najviše pomeraja u `slobodnoMesto` (posle toga nov sloj ide na poslednje mesto, i ako je zauzeto). */
const NAJVISE_POMERAJA = 20;
/** Dužina teksta u nazivu TEKST sloja (code point-i). */
const DUZINA_NAZIVA = 30;

/** Unutrašnji međuspremnik (odluka 15): promenljiva modula, živi dok je kartica otvorena, radi i između slajdova. */
export const medjuspremnik: { slojevi: readonly Sloj[] } = { slojevi: [] };

/**
 * Nov id `s<n>` ili `a<n>`: najmanji slobodan n od 1 u zajedničkom skupu id-jeva slojeva i animacija (server traži
 * jedinstvenost preko oba, odluka 16), plus `zauzeti` (id-jevi dodeljeni u istoj radnji).
 */
export function noviId(p: Platno, prefiks: 's' | 'a', zauzeti: ReadonlySet<string> = new Set()): string {
  const svi = new Set<string>([...p.slojevi.map((s) => s.id), ...p.animacije.map((a) => a.id), ...zauzeti]);
  for (let n = 1; ; n++) {
    const id = `${prefiks}${n}`;
    if (!svi.has(id)) return id;
  }
}

/**
 * Gornji levi ugao novog sloja date veličine: centar platna, a dok tu (na manje od pola jedinice) već stoji sloj,
 * svaki sledeći je pomeren za 12 na obe ose (najviše 20 puta), pa se ubačeni slojevi ne poklapaju (odluka 12).
 */
export function slobodnoMesto(p: Platno, sirina: number, visina: number): { x: number; y: number } {
  let { x, y } = uSredini(sirina, visina);
  const zauzeto = (x0: number, y0: number) => p.slojevi.some((s) => Math.abs(x0 - s.x) < 0.5 && Math.abs(y0 - s.y) < 0.5);
  for (let i = 0; i < NAJVISE_POMERAJA && zauzeto(x, y); i++) {
    x = z(x + POMAK_KOPIJE);
    y = z(y + POMAK_KOPIJE);
  }
  return { x, y };
}

/** Sloj na vrh z-ose (kraj niza). */
export function dodajSloj(p: Platno, s: Sloj): Platno {
  return { ...p, slojevi: [...p.slojevi, s] };
}

/** Briše slojeve i SVE animacije tih slojeva (Review Focus 2: nikad animacija ka nepostojećem sloju). */
export function obrisiSlojeve(p: Platno, ids: ReadonlySet<string>): Platno {
  if (!p.slojevi.some((s) => ids.has(s.id))) return p;
  return { ...p, slojevi: p.slojevi.filter((s) => !ids.has(s.id)), animacije: p.animacije.filter((a) => !ids.has(a.slojId)) };
}

/** `f` nad izabranim slojevima; kad `f` za sve vrati isti objekat (ili nema pogotka), rezultat je isti `p`. */
export function izmeniSlojeve(p: Platno, ids: ReadonlySet<string>, f: (s: Sloj) => Sloj): Platno {
  let promena = false;
  const slojevi = p.slojevi.map((s) => {
    if (!ids.has(s.id)) return s;
    const n = f(s);
    if (n !== s) promena = true;
    return n;
  });
  return promena ? { ...p, slojevi } : p;
}

const ista = (a: Kutija, b: Kutija) =>
  a.x === b.x && a.y === b.y && a.sirina === b.sirina && a.visina === b.visina && a.rotacija === b.rotacija;

/** Razmera koja daje tačan zbir: svaki deo zaokružen, poslednji upija ostatak (i nijedan nije <= 0). */
function skalirajDelove(delovi: readonly number[], f: number): number[] {
  if (f === 1) return [...delovi];
  const cilj = z(delovi.reduce((a, b) => a + b, 0) * f);
  const prvi = delovi.slice(0, -1).map((d) => Math.max(0.01, z(d * f)));
  const ostatak = z(cilj - prvi.reduce((a, b) => a + b, 0));
  return [...prvi, Math.max(0.01, ostatak)];
}

/**
 * Sadržaj sloja `novi` (sa novom kutijom) srazmeran staroj kutiji sloja `stari`: krajevi linije, kolone i redovi
 * tabele (zbir tačan), tačke poteza crteža. Tekst, slika i formula menjaju samo kutiju.
 */
function skalirajSadrzaj(novi: Sloj, stari: Sloj): Sloj {
  const fx = novi.sirina / stari.sirina;
  const fy = novi.visina / stari.visina;
  if (fx === 1 && fy === 1) return novi;
  const tacka = (t: Tacka | null): Tacka | null => (t == null ? null : { x: z(t.x * fx), y: z(t.y * fy) });
  switch (novi.tip) {
    case 'OBLIK':
      return { ...novi, od: tacka(novi.od), do: tacka(novi.do) };
    case 'TABELA':
      return { ...novi, kolone: skalirajDelove(novi.kolone, fx), redovi: skalirajDelove(novi.redovi, fy) };
    case 'CRTEZ':
      return novi.potezi == null ? novi : {
        ...novi, potezi: novi.potezi.map((pz) => ({ ...pz, tacke: pz.tacke.map((v, i) => z(v * (i % 2 === 0 ? fx : fy))) })),
      };
    default:
      return novi;
  }
}

/**
 * Nova kutija sloja (kroz `ogranici`: granice servera, 2 decimale) i srazmerno skaliran sadržaj: krajevi linije, kolone
 * i redovi tabele (poslednja kolona/red upija zaokruživanje, pa je zbir tačan), potezi crteža. Tekst, slika i formula
 * menjaju samo kutiju. Ista kutija -> isti `p`.
 */
export function postaviKutiju(p: Platno, id: string, k: Kutija): Platno {
  const nova = ogranici(k);
  // poređenje sa OGRANIČENOM kutijom sloja: sloj sa npr. `rotacija: -90` (ogranici daje 270) i nepromenjenom kutijom
  // ostaje isti objekat (bez fantomskog koraka istorije i PUT-a)
  return izmeniSlojeve(p, new Set([id]), (s) => (ista(nova, ogranici(kutijaSloja(s))) ? s : skalirajSadrzaj({ ...s, ...nova }, s)));
}

/** Pomeraj `d` stegnut tako da nijedna od koordinata `poz` ne izađe iz [-960, 1920] (0 je uvek dozvoljen). */
function zajednickiPomeraj(poz: readonly number[], d: number): number {
  const od = Math.min(0, Math.max(...poz.map((v) => MIN_XY - v)));
  const doK = Math.max(0, Math.min(...poz.map((v) => MAX_XY - v)));
  return Math.min(Math.max(d, od), doK);
}

/**
 * Pomera izabrane slojeve za ZAJEDNIČKI (dx, dy), stegnut tako da nijedan pomereni sloj ne izađe iz [-960, 1920]
 * (pa se raspored više izabranih slojeva na granici ne kvari), 2 decimale. Menja samo x i y: veličina, rotacija i krajevi
 * linije (relativni u okviru) ostaju. Sloj koji se ne pomeri (granica, pomeraj 0) ostaje isti objekat.
 */
export function pomeriSlojeve(p: Platno, ids: ReadonlySet<string>, dx: number, dy: number): Platno {
  const izabrani = p.slojevi.filter((s) => ids.has(s.id));
  if (izabrani.length === 0) return p;
  const zdx = zajednickiPomeraj(izabrani.map((s) => s.x), dx);
  const zdy = zajednickiPomeraj(izabrani.map((s) => s.y), dy);
  if (zdx === 0 && zdy === 0) return p;
  return izmeniSlojeve(p, ids, (s) => {
    // `pomeriKutiju` (ogranici) i dalje steže: važi samo za sloj koji je već bio van granica (star dokument)
    const { x, y } = pomeriKutiju(kutijaSloja(s), zdx, zdy);
    return x === s.x && y === s.y ? s : { ...s, x, y };
  });
}

/**
 * Kopije slojeva (lepljenje iz međuspremnika, dupliranje): svaka dobija nov `s<n>` bez sudara (ni međusobno), x i y
 * + `pomak` (kroz `pomeriKutiju`), isti naziv, i ide na vrh z-ose redom. Animacije se ne kopiraju (odluka 15).
 */
export function kopijeSlojeva(p: Platno, slojevi: readonly Sloj[], pomak: number): { platno: Platno; ids: string[] } {
  if (slojevi.length === 0) return { platno: p, ids: [] };
  const dodeljeni = new Set<string>();
  const kopije = slojevi.map((s) => {
    const id = noviId(p, 's', dodeljeni);
    dodeljeni.add(id);
    const { x, y } = pomeriKutiju(kutijaSloja(s), pomak, pomak);
    return { ...s, id, x, y };
  });
  return { platno: { ...p, slojevi: [...p.slojevi, ...kopije] }, ids: kopije.map((s) => s.id) };
}

/**
 * Z-osa: izabrani se pomeraju zajedno, zadržavajući međusobni redosled (NAPRED/NAZAD: preko jednog neizabranog suseda).
 * Kad se redosled ne promeni (npr. NAPRED za sloj koji je već na vrhu) vraća ISTI objekat `p`, pa `primeni` ne beleži
 * korak i ne šalje `PUT` (odluka 8). Zaključani slojevi se pomeraju kao i ostali (odluka 14).
 */
export function zOsa(p: Platno, ids: ReadonlySet<string>, smer: SmerZ): Platno {
  let s = [...p.slojevi];
  const izabran = (i: number) => ids.has(s[i].id);
  if (smer === 'NA_VRH' || smer === 'NA_DNO') {
    const da = s.filter((x) => ids.has(x.id));
    const ne = s.filter((x) => !ids.has(x.id));
    s = smer === 'NA_VRH' ? [...ne, ...da] : [...da, ...ne];
  } else if (smer === 'NAPRED') {
    for (let i = s.length - 2; i >= 0; i--) if (izabran(i) && !izabran(i + 1)) [s[i], s[i + 1]] = [s[i + 1], s[i]];
  } else {
    for (let i = 1; i < s.length; i++) if (izabran(i) && !izabran(i - 1)) [s[i], s[i - 1]] = [s[i - 1], s[i]];
  }
  return s.every((x, i) => x === p.slojevi[i]) ? p : { ...p, slojevi: s };
}

/** Sloj na indeks z-ose (prevlačenje u panelu Slojevi; indeks ograničen na [0, n-1]). Isti indeks ili nepoznat id -> `p`. */
export function premestiSloj(p: Platno, id: string, indeks: number): Platno {
  const od = p.slojevi.findIndex((s) => s.id === id);
  if (od < 0 || Number.isNaN(indeks)) return p;
  const ka = Math.min(Math.max(Math.trunc(indeks), 0), p.slojevi.length - 1);
  if (ka === od) return p;
  const slojevi = [...p.slojevi];
  moveItemInArray(slojevi, od, ka);
  return { ...p, slojevi };
}

const NAZIV_OBLIKA: Record<VrstaOblika, string> = {
  PRAVOUGAONIK: 'Pravougaonik', ZAOBLJENI_PRAVOUGAONIK: 'Zaobljeni pravougaonik', ELIPSA: 'Elipsa', TROUGAO: 'Trougao',
  LINIJA: 'Linija', STRELICA: 'Strelica', DVOSTRUKA_STRELICA: 'Dvostruka strelica',
};
const NAZIV_TIPA = { TEKST: 'Tekst', SLIKA: 'Slika', FORMULA: 'Formula', CRTEZ: 'Crtež' } as const;

/** Redni broj sloja među slojevima iste vrste odozdo (OBLIK: iste vrste oblika); sloj van dokumenta je sledeći. */
function redniBroj(p: Platno, s: Sloj): number {
  const isteVrste = (x: Sloj) => x.tip === s.tip && (x.tip !== 'OBLIK' || s.tip !== 'OBLIK' || x.oblik === s.oblik);
  let n = 0;
  for (const x of p.slojevi) {
    if (!isteVrste(x)) continue;
    n++;
    if (x === s || x.id === s.id) return n;
  }
  return n + 1;
}

/** Prvi neprazan red teksta (do preloma ili kraja pasusa), tab kao razmak, najviše 30 znakova (pa `…`). */
function prviRed(pasusi: readonly { delovi: readonly { tekst: string }[] }[]): string {
  const ceo = pasusi.map((ps) => ps.delovi.map((d) => d.tekst).join('')).join('\n').replace(/\t/g, ' ');
  const red = ceo.split('\n').map((r) => r.trim()).find((r) => r.length > 0) ?? '';
  const znaci = Array.from(red);
  return znaci.length > DUZINA_NAZIVA ? `${znaci.slice(0, DUZINA_NAZIVA).join('').trimEnd()}…` : red;
}

/**
 * Naziv sloja za panel Slojevi i najave: `naziv` ako postoji; inače TEKST `Tekst: <prvi red>` (ili `Tekst N` kad je
 * prazan), OBLIK po vrsti + N, TABELA `Tabela r × k`, ostali `Slika N`, `Formula N`, `Crtež N` (N odozdo).
 */
export function nazivSloja(p: Platno, s: Sloj): string {
  if (s.naziv) return s.naziv;
  switch (s.tip) {
    case 'TEKST': {
      const red = prviRed(s.pasusi);
      return red ? `Tekst: ${red}` : `Tekst ${redniBroj(p, s)}`;
    }
    case 'OBLIK':
      return `${NAZIV_OBLIKA[s.oblik]} ${redniBroj(p, s)}`;
    case 'TABELA':
      return `Tabela ${s.redovi.length} × ${s.kolone.length}`;
    default:
      return `${NAZIV_TIPA[s.tip]} ${redniBroj(p, s)}`;
  }
}
