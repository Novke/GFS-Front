// Uvoz izabranih strana PDF-a (faza 5d, odluka 18): crtanje i slanje slika teku zajedno, pa jedan
// `POST /prezentacije/{id}/slajdovi/uvoz` (jedna transakcija na serveru: uvoz je ceo ili ništa). Bez pdf.js: strane crta
// `CrtacPdf` (adapter nad pdf.js, `pdf-crtac.ts`), pa se ovde testira lažnim crtačem.
import { firstValueFrom, fromEvent, takeUntil, type Observable } from 'rxjs';

import type { Tema } from '../data-access/platno.models';
import type { PrezentacijaDetails, SlajdCmd } from '../data-access/uzivo.models';
import type { MimeSlike } from '../uvoz-pptx/format-slike';
import { GreskaSlanja, greskaUvozaSlajdova, posaljiSliku, sha256, zameniMedije, type ApiUvoza } from '../uvoz-pptx/slanje';
import { MAX_SLIKA_STRANE, nazivStrane, porukaOpsega, slajdStrane, type IzborStrana } from './strane';

/** Nacrtana strana: kodirana slika i veličina strane u pt (iz nje se računa sloj, ne iz piksela slike). */
export interface CrtezStrane { bajtovi: Uint8Array; mime: MimeSlike; sirina: number; visina: number; }

/** Otvoren PDF. `nacrtaj(broj)` crta stranu `broj` (od 1); `zatvori()` oslobađa dokument i radnika (zove ga pozivalac). */
export interface CrtacPdf { readonly brojStrana: number; nacrtaj(broj: number): Promise<CrtezStrane>; zatvori(): Promise<void>; }

/** `strane`: gotove strane (nacrtane i na serveru, ili iste kao ranija); `slajdovi`: poslat je uvoz slajdova. */
export type NapredakPdf = { faza: 'strane'; uradjeno: number; ukupno: number } | { faza: 'slajdovi' };

export interface ZavisnostiPdf {
  api: ApiUvoza;
  /** Tema prezentacije: njena pozadina je boja traka oko strane. */
  tema: Tema;
  /** Ime PDF fajla (za nazive slojeva i slika). */
  imeFajla: string;
  /** Podrazumevano SHA-256 (`crypto.subtle`), hex. */
  hes?: (b: Uint8Array) => Promise<string>;
  /** Podrazumevano `timer(ms)` (čekanje pre ponavljanja slanja). */
  cekaj?: (ms: number) => Observable<unknown>;
}

export const OTKAZANO_PDF = 'Uvoz je otkazan; nijedan slajd nije dodat.';

const ISTOVREMENO = 3;
const EKSTENZIJA: Record<MimeSlike, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };

/**
 * Uvoz izabranih strana (odluka 18): strane se crtaju redom, a slike se šalju dok se crta; posle crtanja nove strane
 * slanje čeka dok su 3 slanja u toku (u memoriji nikad više od 4 slike); ista slika (SHA-256) se šalje jednom. Kad su
 * sve slike na serveru, jedan `POST slajdovi/uvoz`. Prva greška ili "Otkaži" (`prekid`) zaustavlja crtanje i otkazuje
 * slanja slika koja još teku; slajdovi se tada ne prave. Sam `POST slajdovi/uvoz` se ne prekida (ishod bi bio nepoznat).
 * Greške: `GreskaSlanja` (poruka za korisnika; `nepoznatIshod` kao u fazi 2) ili greška crtača kakva jeste.
 * Crtač ne zatvara: to radi pozivalac (dijalog, u `finally`).
 */
export async function uveziPdf(prezentacijaId: number, crtac: CrtacPdf, izbor: IzborStrana, z: ZavisnostiPdf,
                               napredak: (n: NapredakPdf) => void, prekid: AbortSignal): Promise<PrezentacijaDetails> {
  // Dijalog ne nudi nevažeći opseg; ovo je odbrana (i granica od 200 strana) pre ijednog crtanja.
  const nevazeci = porukaOpsega(izbor.od, izbor.do, crtac.brojStrana, 0);
  if (nevazeci) throw new GreskaSlanja(nevazeci);
  // `stop` otkazuje slanja u toku i na "Otkaži" i kad uvoz izađe sa greškom (kao `mergeMap` u fazi 2).
  const stop = new AbortController();
  const naPrekid = () => stop.abort();
  prekid.addEventListener('abort', naPrekid);
  try {
    return await crtajISalji(prezentacijaId, crtac, izbor, z, napredak, prekid, stop);
  } finally {
    prekid.removeEventListener('abort', naPrekid);
    stop.abort();
  }
}

async function crtajISalji(prezentacijaId: number, crtac: CrtacPdf, izbor: IzborStrana, z: ZavisnostiPdf,
                           napredak: (n: NapredakPdf) => void, prekid: AbortSignal, stop: AbortController): Promise<PrezentacijaDetails> {
  const izracunaj = z.hes ?? sha256;
  const brojevi = Array.from({ length: izbor.do - izbor.od + 1 }, (_, i) => izbor.od + i);
  const ukupno = brojevi.length;
  const idPoHesu = new Map<string, Promise<string>>();
  const slajdovi: SlajdCmd[] = [];
  const uLetu = new Set<Promise<void>>();
  let uradjeno = 0;
  let greska: unknown = null;
  const proveri = () => {
    if (prekid.aborted) throw new GreskaSlanja(OTKAZANO_PDF);
    if (greska) throw greska;
  };
  const gotova = () => napredak({ faza: 'strane', uradjeno: ++uradjeno, ukupno });
  /** Heš sa porukom za korisnika: `GreskaSlanja` (nebezbedna veza) prolazi, ostalo -> strana nije pripremljena. */
  const hes = async (b: Uint8Array, broj: number) => {
    try {
      return await izracunaj(b);
    } catch (e) {
      throw e instanceof GreskaSlanja ? e : new GreskaSlanja(`Strana ${broj} nije mogla da se pripremi.`);
    }
  };

  napredak({ faza: 'strane', uradjeno, ukupno });
  for (const broj of brojevi) {
    proveri();
    const c = await crtac.nacrtaj(broj);
    proveri();
    if (c.bajtovi.length > MAX_SLIKA_STRANE) throw new GreskaSlanja(`Strana ${broj} je i posle sažimanja veća od 10 MB.`);
    const h = await hes(c.bajtovi, broj);
    proveri();
    const naziv = nazivStrane(z.imeFajla, broj);
    slajdovi.push(slajdStrane(h, c, naziv, z.tema));
    if (idPoHesu.has(h)) {
      gotova();
      continue;
    }
    // Čekanje slobodnog mesta POSLE crtanja: u memoriji su 3 slike u slanju + ova nacrtana = najviše 4 (odluka 18).
    while (uLetu.size >= ISTOVREMENO) {
      await Promise.race(uLetu);
      proveri();
    }
    // `proveri()` je upravo prošao, pa `stop` još nije okinut: pretplata (sinhrona u `firstValueFrom`) ga ne propušta.
    const id = firstValueFrom(
      posaljiSliku(z.api, { bajtovi: c.bajtovi, imeFajla: `${naziv}.${EKSTENZIJA[c.mime]}`, mime: c.mime, ime: naziv }, z.cekaj)
        .pipe(takeUntil(fromEvent(stop.signal, 'abort'))),
    ).then((info) => info.id);
    idPoHesu.set(h, id);
    // Prva greška otkazuje i ostala slanja u toku. Otkazano slanje odbija sa `EmptyError`: tada je greška već zapamćena
    // ili je okinut `prekid`, koji `proveri` gleda pre greške.
    const slanje: Promise<void> = id.then(gotova, (e: unknown) => {
      greska ??= e;
      stop.abort();
    }).finally(() => uLetu.delete(slanje));
    uLetu.add(slanje);
  }
  await Promise.all(uLetu);
  proveri();
  const mapa = new Map<string, string>();
  for (const [h, p] of idPoHesu) mapa.set(h, await p);
  napredak({ faza: 'slajdovi' });
  const cmd = { posle: izbor.posle, slajdovi: slajdovi.map((s) => ({ ...s, platno: s.platno && zameniMedije(s.platno, mapa) })) };
  try {
    return await firstValueFrom(z.api.uvezi(prezentacijaId, cmd));
  } catch (e) {
    throw greskaUvozaSlajdova(e, (n) => (brojevi[n - 1] ? `Strana ${brojevi[n - 1]}` : null));
  }
}
