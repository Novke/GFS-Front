// Slanje uvoza na server: slike (deduplikacija po SHA-256, 3 paralelno, ponavljanje privremenih grešaka, smanjivanje
// prevelikih), zamena ključeva medija id-jevima servera i jedan `POST /prezentacije/{id}/slajdovi/uvoz` (jedna
// transakcija na serveru: uvoz je ceo ili ništa). Zavisi od RxJS-a i `HttpErrorResponse`, pa ga lokalna provera
// uvoza (Node) ne učitava; učitava ga samo dijalog uvoza (lenjo).
import { HttpErrorResponse } from '@angular/common/http';
import { defer, from, map, mergeMap, Observable, retry, switchMap, throwError, timer, toArray, catchError } from 'rxjs';

import type { Platno } from '../data-access/platno.models';
import { razlogGreske } from '../data-access/razlog-greske';
import type { MedijInfo, PrezentacijaDetails, SlajdCmd, UvozSlajdovaCmd } from '../data-access/uzivo.models';
import { DUZINA_ID_MEDIJA, preslikajMedije } from './granice';
import type { Upozorenje } from './izvestaj';
import { mimeSlike, smanjiSliku } from './slike';
import type { RezultatUvoza, UvezenSlajd } from './uvoz';

/** Granica tela uvoza na serveru (`UvozConfig.MAX_TELO_UVOZA`, po `Content-Length`). */
export const MAX_TELO_UVOZA = 10 * 1024 * 1024;
/** Granica slike na serveru (`spring.servlet.multipart.max-file-size`). */
export const MAX_SLIKA = 10 * 1024 * 1024;

/**
 * Greška slanja; poruka je za korisnika. `nepoznatIshod`: server je možda ipak upisao uvoz (veza prekinuta, 5xx bez
 * razloga, nepročitan 2xx odgovor), pa se uvoz ne sme ponoviti ni prezentacija obrisati pre nego što se stanje pročita.
 */
export class GreskaSlanja extends Error {
  override readonly name = 'GreskaSlanja';
  readonly nepoznatIshod: boolean;
  constructor(poruka: string, opcije: { nepoznatIshod?: boolean } = {}) {
    super(poruka);
    this.nepoznatIshod = opcije.nepoznatIshod ?? false;
  }
}

/** Deo `PrezentacijeApi` koji slanje koristi (u testovima lažan). */
export interface ApiUvoza {
  upload(f: File): Observable<MedijInfo>;
  uvezi(prezentacijaId: number, cmd: UvozSlajdovaCmd): Observable<PrezentacijaDetails>;
}

/** `od`/`do` = redni brojevi PPTX slajdova, uključivo; `posle` = id slajda posle kog se ubacuje (`null` = na kraj). */
export interface IzborUvoza { od: number; do: number; posle: number | null; }

export type Napredak = { faza: 'slike'; poslato: number; ukupno: number } | { faza: 'slajdovi' };

export interface ZavisnostiSlanja {
  api: ApiUvoza;
  /** Podrazumevano SHA-256 (`crypto.subtle`), hex. */
  hes?: (b: Uint8Array) => Promise<string>;
  /** Podrazumevano `smanjiSliku` (slike.ts). */
  smanji?: (b: Uint8Array, ime: string) => Promise<{ bajtovi: Uint8Array; ime: string }>;
  /** Podrazumevano `timer(ms)`. */
  cekaj?: (ms: number) => Observable<unknown>;
}

const MB = 1024 * 1024;
const ID_ZA_MERENJE = '0'.repeat(DUZINA_ID_MEDIJA);
const ISTOVREMENO = 3;
const PREKINUTA_VEZA = 'Server nije potvrdio uvoz (veza je prekinuta). Slajdovi su možda ipak dodati: osveži prezentaciju pre novog pokušaja.';
const PREVELIK_UVOZ = 'Uvoz je prevelik (najviše 10 MB). Izaberi manji opseg slajdova.';
const NEPROCITAN_ODGOVOR = 'Odgovor servera nije pročitan. Slajdovi su možda ipak dodati: osveži prezentaciju pre novog pokušaja.';
const PREVISE_ZAHTEVA = 'Server trenutno prima previše zahteva: pokušaj ponovo za trenutak.';

/** Uvezeni slajdovi u opsegu izbora (skriveni i neuspeli ne postoje u rezultatu, pa ih opseg samo preskače). */
export function izaberiSlajdove(r: RezultatUvoza, izbor: IzborUvoza): UvezenSlajd[] {
  return r.slajdovi.filter((s) => s.indeks >= izbor.od && s.indeks <= izbor.do);
}

/**
 * Ključevi medija -> id-jevi servera na četiri mesta (`pozadina.medijId`, `medijId` SLIKA i CRTEZ, `slikaIzvora`
 * FORMULE); ključ kog nema u mapi ostaje. Novi objekat, ulaz se ne menja.
 */
export function zameniMedije(p: Platno, mapa: ReadonlyMap<string, string>): Platno {
  return preslikajMedije(p, (k) => mapa.get(k) ?? k);
}

function cmdSaMedijima(cmd: SlajdCmd, f: (kljuc: string) => string): SlajdCmd {
  return cmd.platno ? { ...cmd, platno: preslikajMedije(cmd.platno, f) } : cmd;
}

/** UTF-8 dužina teksta bez pravljenja bafera (usamljen surogat je U+FFFD, 3 bajta, kao `TextEncoder`). */
function utf8Bajtova(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}

/**
 * Bajtovi tela `UvozSlajdovaCmd` kakvo `HttpClient` šalje (`JSON.stringify`, UTF-8), sa ključevima medija kao id-jem
 * servera od 36 znakova (server meri `Content-Length`). Slajdovi se mere jedan po jedan, bez jednog velikog stringa.
 */
export function velicinaTela(slajdovi: readonly UvezenSlajd[], posle: number | null): number {
  const omot = utf8Bajtova(JSON.stringify({ posle, slajdovi: [] }));
  const zarezi = Math.max(0, slajdovi.length - 1);
  return slajdovi.reduce((n, s) => n + utf8Bajtova(JSON.stringify(cmdSaMedijima(s.cmd, () => ID_ZA_MERENJE))), omot + zarezi);
}

/** Megabajti sa jednom decimalom, zaokruženo naviše (telo preko granice nikad ne piše "10,0 MB"). */
const megabajta = (b: number) => (Math.ceil((b / MB) * 10) / 10).toFixed(1).replace('.', ',');

/** Poruka za telo uvoza preko 10 MB (dijalog onemogućava "Uvezi" sa njom), `null` kad telo staje. */
export function porukaVelicineTela(telo: number): string | null {
  return telo > MAX_TELO_UVOZA
    ? `Izabrani slajdovi su preveliki za jedan uvoz (${megabajta(telo)} MB, najviše 10 MB). Izaberi manji opseg.`
    : null;
}

const bezTacke = (s: string) => s.replace(/[.\s]+$/, '');

const NEBEZBEDNA_VEZA = 'Pregledač ne dozvoljava proveru slika na nebezbednoj vezi (http). Otvori aplikaciju preko https i pokušaj ponovo.';

/** SHA-256, hex. `crypto.subtle` postoji samo u bezbednom kontekstu (https, localhost): bez njega -> `GreskaSlanja`. */
async function sha256(b: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new GreskaSlanja(NEBEZBEDNA_VEZA);
  const h = await subtle.digest('SHA-256', b as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(h), (x) => x.toString(16).padStart(2, '0')).join('');
}

/** Status 0 (veza), 408, 429 i 5xx su privremeni: ponavljaju se. */
function privremena(e: unknown): boolean {
  return e instanceof HttpErrorResponse && (e.status === 0 || e.status === 408 || e.status === 429 || e.status >= 500);
}

/** Jedinstvena slika za slanje: `hes` gotovih bajtova, `ime` iz fajla (za poruke), `imeFajla` za server. */
interface SlikaZaSlanje { hes: string; ime: string; imeFajla: string; bajtovi: Uint8Array; mime: string; }

interface Priprema { slike: SlikaZaSlanje[]; hesPoKljucu: Map<string, string>; upozorenja: Upozorenje[]; }

/**
 * Bajtovi svih medija izabranih slajdova: nedostaje -> greška; > 10 MB ili format koji server ne prima -> smanjivanje
 * (+ `SLIKA_SMANJENA`); heš gotovih bajtova; isti heš -> jedna slika. Ista izvorna slika se priprema jednom.
 */
async function pripremi(r: RezultatUvoza, izabrani: readonly UvezenSlajd[], z: ZavisnostiSlanja): Promise<Priprema> {
  const izracunaj = z.hes ?? sha256;
  /** Heš sa porukom za korisnika: `GreskaSlanja` prolazi, ostalo -> slika nije mogla da se pripremi. */
  const hes = async (b: Uint8Array, ime: string) => {
    try {
      return await izracunaj(b);
    } catch (e) {
      throw e instanceof GreskaSlanja ? e : new GreskaSlanja(`Slika ${ime} nije mogla da se pripremi.`);
    }
  };
  const smanji = z.smanji ?? smanjiSliku;
  const prviSlajd = new Map<string, number>();
  for (const s of izabrani) for (const k of s.mediji) if (!prviSlajd.has(k)) prviSlajd.set(k, s.indeks);

  const slike = new Map<string, SlikaZaSlanje>();
  const hesPoKljucu = new Map<string, string>();
  const izvorni = new Map<string, string>(); // heš izvornih bajtova -> heš poslatih (smanjivanje jednom)
  const upozorenja: Upozorenje[] = [];
  for (const [kljuc, slajd] of prviSlajd) {
    const m = r.mediji.get(kljuc);
    const ime = m?.ime ?? kljuc;
    let bajtovi: Uint8Array | null;
    try {
      bajtovi = m?.bajtovi() ?? null;
    } catch {
      bajtovi = null;
    }
    if (!bajtovi) throw new GreskaSlanja(`Slika ${ime} nije pronađena u fajlu.`);

    const hesIzvora = await hes(bajtovi, ime);
    const poznat = izvorni.get(hesIzvora);
    if (poznat !== undefined) {
      hesPoKljucu.set(kljuc, poznat);
      continue;
    }
    let imeFajla = ime;
    let mime = mimeSlike(bajtovi);
    let hesSlanja = hesIzvora;
    if (bajtovi.length > MAX_SLIKA || !mime) {
      const razlog = bajtovi.length > MAX_SLIKA ? 'veća od 10 MB' : 'u formatu koji server ne prima';
      let smanjena: { bajtovi: Uint8Array; ime: string };
      try {
        smanjena = await smanji(bajtovi, ime);
      } catch {
        throw new GreskaSlanja(`Slika ${ime} nije mogla da se pripremi.`);
      }
      mime = mimeSlike(smanjena.bajtovi);
      if (!mime || smanjena.bajtovi.length > MAX_SLIKA) throw new GreskaSlanja(`Slika ${ime} nije mogla da se pripremi.`);
      bajtovi = smanjena.bajtovi;
      imeFajla = smanjena.ime;
      hesSlanja = await hes(bajtovi, ime);
      upozorenja.push({ slajd, kod: 'SLIKA_SMANJENA', poruka: `Slika ${ime} je ${razlog}: poslata je kao ${imeFajla} (${megabajta(bajtovi.length)} MB).` });
    }
    izvorni.set(hesIzvora, hesSlanja);
    hesPoKljucu.set(kljuc, hesSlanja);
    if (!slike.has(hesSlanja)) slike.set(hesSlanja, { hes: hesSlanja, ime, imeFajla, bajtovi, mime });
  }
  return { slike: [...slike.values()], hesPoKljucu, upozorenja };
}

/** Šalje jedinstvene slike (najviše 3 istovremeno, do 2 ponavljanja privremene greške); rezultat: heš -> id servera. */
function posaljiSlike(slike: readonly SlikaZaSlanje[], z: ZavisnostiSlanja, napredak: (n: Napredak) => void): Observable<Map<string, string>> {
  const cekaj = z.cekaj ?? ((ms: number) => timer(ms));
  return defer(() => {
    const ukupno = slike.length;
    let poslato = 0;
    napredak({ faza: 'slike', poslato, ukupno });
    return from(slike).pipe(
      mergeMap((s) => defer(() => z.api.upload(new File([s.bajtovi as Uint8Array<ArrayBuffer>], s.imeFajla, { type: s.mime }))).pipe(
        retry({ count: 2, delay: (e: unknown, i: number) => (privremena(e) ? cekaj(i === 1 ? 1000 : 3000) : throwError(() => e)) }),
        catchError((e: unknown) => throwError(() => new GreskaSlanja(`Slika ${s.ime} nije poslata: ${bezTacke(razlogGreske(e, porukaStatusa(e)))}.`))),
        map((info): [string, string] => {
          poslato++;
          napredak({ faza: 'slike', poslato, ukupno });
          return [s.hes, info.id];
        }),
      ), ISTOVREMENO),
      toArray(),
      map((parovi) => new Map(parovi)),
    );
  });
}

const porukaStatusa = (e: unknown) => (e instanceof HttpErrorResponse ? `server je odgovorio greškom ${e.status}` : 'neočekivana greška');

/**
 * Greška `POST slajdovi/uvoz` za korisnika. Uvoz se nikad ne ponavlja sam (nije idempotentan): bez odgovora servera
 * (veza, 502/503/504 bez poruke) ili sa nepročitanim uspešnim odgovorom (2xx) slajdovi su možda već dodati, pa poruka
 * to kaže. `Slajd N: …` se preslikava na redni broj u PPTX-u bez obzira na status.
 */
function greskaUvoza(e: unknown, izabrani: readonly UvezenSlajd[]): GreskaSlanja {
  if (!(e instanceof HttpErrorResponse)) return e instanceof GreskaSlanja ? e : new GreskaSlanja('Slajdovi nisu uvezeni: neočekivana greška.');
  if (e.status >= 200 && e.status < 300) return new GreskaSlanja(NEPROCITAN_ODGOVOR, { nepoznatIshod: true });
  const reason = e.status === 0 ? '' : razlogGreske(e, '');
  const m = /^Slajd (\d+): ([\s\S]*)$/.exec(reason);
  const s = m ? izabrani[Number(m[1]) - 1] : undefined;
  if (m && s) return new GreskaSlanja(`PowerPoint slajd ${s.indeks}: ${m[2]}`);
  if (e.status === 413) return new GreskaSlanja(reason || PREVELIK_UVOZ);
  if (e.status === 429) return new GreskaSlanja(PREVISE_ZAHTEVA);
  if (!reason && (e.status === 0 || e.status >= 500)) return new GreskaSlanja(PREKINUTA_VEZA, { nepoznatIshod: true });
  if (e.status >= 500) return new GreskaSlanja(`Slajdovi nisu uvezeni: ${reason}`);
  return new GreskaSlanja(reason || `Slajdovi nisu uvezeni (greška ${e.status}).`);
}

/**
 * Uvoz izabranog opsega u prezentaciju:
 * 1. opseg bez slajdova ili telo > 10 MB -> `GreskaSlanja` pre ijedne slike;
 * 2. mediji izabranih slajdova se pripremaju (`pripremi`) i dedupliciraju po hešu;
 * 3. jedinstvene slike idu na `POST /mediji` (3 paralelno, ponavljanje privremenih grešaka posle 1 s i 3 s), napredak
 *    `slike` na početku i posle svake;
 * 4. ključevi -> id-jevi, napredak `slajdovi`, jedan `uvezi`; 400 `Slajd N: …` -> `PowerPoint slajd <indeks>: …`.
 * Odjava prekida slike u toku i ne šalje uvoz.
 */
export function posaljiUvoz(
  prezentacijaId: number, r: RezultatUvoza, izbor: IzborUvoza, z: ZavisnostiSlanja, napredak: (n: Napredak) => void,
): Observable<{ prezentacija: PrezentacijaDetails; upozorenja: Upozorenje[] }> {
  return defer(() => {
    const izabrani = izaberiSlajdove(r, izbor);
    if (izabrani.length === 0) throw new GreskaSlanja('Izabrani opseg nema nijedan slajd.');
    const prevelik = porukaVelicineTela(velicinaTela(izabrani, izbor.posle));
    if (prevelik) throw new GreskaSlanja(prevelik);
    return from(pripremi(r, izabrani, z)).pipe(
      switchMap((p) => posaljiSlike(p.slike, z, napredak).pipe(
        switchMap((idPoHesu) => {
          const id = new Map([...p.hesPoKljucu].map(([k, h]) => [k, idPoHesu.get(h)!]));
          const cmd: UvozSlajdovaCmd = { posle: izbor.posle, slajdovi: izabrani.map((s) => cmdSaMedijima(s.cmd, (k) => id.get(k) ?? k)) };
          napredak({ faza: 'slajdovi' });
          return z.api.uvezi(prezentacijaId, cmd).pipe(catchError((e: unknown) => throwError(() => greskaUvoza(e, izabrani))));
        }),
        map((prezentacija) => ({ prezentacija, upozorenja: p.upozorenja })),
      )),
    );
  });
}
