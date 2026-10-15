import { HttpErrorResponse } from '@angular/common/http';
import { Observable, of, Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import type { SlikaSloj } from '../data-access/platno.models';
import type { MedijInfo, PrezentacijaDetails, UvozSlajdovaCmd } from '../data-access/uzivo.models';
import { TEME } from '../ui/teme';
import { GreskaSlanja, type ApiUvoza } from '../uvoz-pptx/slanje';
import { OTKAZANO_PDF, uveziPdf, type CrtacPdf, type CrtezStrane, type NapredakPdf, type ZavisnostiPdf } from './slanje-pdf';
import { MAX_SLIKA_STRANE, type IzborStrana } from './strane';

// --- lažni saradnici -------------------------------------------------------------------------------------------------

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const DETALJI = { id: 7, slajdovi: [] } as unknown as PrezentacijaDetails;
const medij = (id: string): MedijInfo => ({ id, naziv: 'x', mime: 'image/png', velicina: 1 });
const greska = (status: number, reason?: string) =>
  new HttpErrorResponse({ status, error: reason === undefined ? '<html>' : { reason, time: '' } });

/** Lažni API: svaki `upload` i `uvezi` dobija svoj `Subject`, test odlučuje kad odgovara. */
class LazniApi implements ApiUvoza {
  readonly uploadi: { fajl: File; odgovor: Subject<MedijInfo> }[] = [];
  readonly uvozi: { id: number; cmd: UvozSlajdovaCmd; odgovor: Subject<PrezentacijaDetails> }[] = [];
  upload(fajl: File): Observable<MedijInfo> {
    const odgovor = new Subject<MedijInfo>();
    this.uploadi.push({ fajl, odgovor });
    return odgovor;
  }
  uvezi(id: number, cmd: UvozSlajdovaCmd): Observable<PrezentacijaDetails> {
    const odgovor = new Subject<PrezentacijaDetails>();
    this.uvozi.push({ id, cmd, odgovor });
    return odgovor;
  }
  odgovoriUpload(i: number, id: string) {
    this.uploadi[i].odgovor.next(medij(id));
    this.uploadi[i].odgovor.complete();
  }
  /** Slanja koja još neko čeka (nisu ni završena ni otkazana). */
  get slusanih(): number {
    return this.uploadi.filter((u) => u.odgovor.observed).length;
  }
}

/** Lažni crtač: strana N je PNG sa bajtom N (ili zadati bajtovi), 960 x 540 pt; broji pozive. */
class LazniCrtac implements CrtacPdf {
  readonly pozvane: number[] = [];
  zatvoren = 0;
  constructor(readonly brojStrana: number, private readonly posebne: Record<number, Partial<CrtezStrane>> = {},
              private readonly posle?: (broj: number) => void) {}
  async nacrtaj(broj: number): Promise<CrtezStrane> {
    this.pozvane.push(broj);
    const c: CrtezStrane = { bajtovi: new Uint8Array([...PNG, broj]), mime: 'image/png', sirina: 960, visina: 540, ...this.posebne[broj] };
    this.posle?.(broj);
    return c;
  }
  async zatvori(): Promise<void> {
    this.zatvoren++;
  }
}

/** Lažni heš: bajtovi kao tekst. */
const lazniHes = async (b: Uint8Array) => Array.from(b).join(',');

/** Pusti tajmere i obećanja da teku (crtanje, heš i slanje su asinhroni). */
const odmor = async (puta = 5) => {
  for (let i = 0; i < puta; i++) await new Promise<void>((r) => setTimeout(r, 0));
};

/** Neobrađena odbijanja obećanja (Node `unhandledRejection`) dok test traje. */
function pratiNeobradjena() {
  const proces = (globalThis as unknown as { process: { on(d: string, f: (e: unknown) => void): void; off(d: string, f: (e: unknown) => void): void } }).process;
  const lista: unknown[] = [];
  const slusalac = (e: unknown) => lista.push(e);
  proces.on('unhandledRejection', slusalac);
  return { lista, prestani: () => proces.off('unhandledRejection', slusalac) };
}

type Ishod = { vrednost: PrezentacijaDetails } | { greska: unknown };

function pokreni(crtac: CrtacPdf, izbor: IzborStrana, deo: Partial<ZavisnostiPdf> = {}, prekid = new AbortController()) {
  const api = (deo.api as LazniApi | undefined) ?? new LazniApi();
  const napredak: NapredakPdf[] = [];
  const z: ZavisnostiPdf = { api, tema: 'PAPIR', imeFajla: 'Predavanje.pdf', hes: lazniHes, cekaj: () => of(0), ...deo };
  // Ishod se hvata odmah: odbijanje pre `await`-a u testu nije neobrađeno.
  const ishod: Promise<Ishod> = uveziPdf(42, crtac, izbor, z, (n) => napredak.push(n), prekid.signal)
    .then((vrednost) => ({ vrednost }), (e: unknown) => ({ greska: e }));
  return { api, napredak, ishod, prekid };
}

async function greskaIshoda(ishod: Promise<Ishod>): Promise<GreskaSlanja> {
  const i = await ishod;
  expect('greska' in i).toBe(true);
  const e = (i as { greska: unknown }).greska;
  expect(e).toBeInstanceOf(GreskaSlanja);
  return e as GreskaSlanja;
}

/** Odgovara na slanja redom kako stižu (`m1`, `m2`, …) dok ih ne bude `n`. */
async function odgovaraj(api: LazniApi, n: number) {
  for (let i = 0; i < n; i++) {
    await vi.waitFor(() => expect(api.uploadi.length).toBeGreaterThan(i));
    api.odgovoriUpload(i, `m${i + 1}`);
  }
}

const medijSlajda = (cmd: UvozSlajdovaCmd, i: number) => (cmd.slajdovi[i].platno!.slojevi[0] as SlikaSloj).medijId;

// --- testovi -----------------------------------------------------------------------------------------------------------

describe('uveziPdf', () => {
  it('5 različitih strana -> 5 slanja, jedan uvoz sa 5 slajdova redom i id-jevima servera', async () => {
    const crtac = new LazniCrtac(5);
    const { api, napredak, ishod } = pokreni(crtac, { od: 1, do: 5, posle: 11 });
    await odgovaraj(api, 5);
    await vi.waitFor(() => expect(api.uvozi).toHaveLength(1));
    expect(api.uploadi).toHaveLength(5);
    const { id, cmd } = api.uvozi[0];
    expect(id).toBe(42);
    expect(cmd.posle).toBe(11);
    expect(cmd.slajdovi).toHaveLength(5);
    expect([0, 1, 2, 3, 4].map((i) => medijSlajda(cmd, i))).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
    expect(cmd.slajdovi.map((s) => s.platno!.slojevi[0].naziv)).toEqual([1, 2, 3, 4, 5].map((n) => `Predavanje - str. ${n}`));
    expect(cmd.slajdovi[0].platno!.pozadina.boja).toBe(TEME.PAPIR.pozadina);
    expect(api.uploadi[0].fajl.name).toBe('Predavanje - str. 1.png');
    expect(api.uploadi[0].fajl.type).toBe('image/png');
    expect(crtac.pozvane).toEqual([1, 2, 3, 4, 5]);
    api.uvozi[0].odgovor.next(DETALJI);
    api.uvozi[0].odgovor.complete();
    expect(await ishod).toEqual({ vrednost: DETALJI });
    expect(napredak[0]).toEqual({ faza: 'strane', uradjeno: 0, ukupno: 5 });
    expect(napredak.at(-2)).toEqual({ faza: 'strane', uradjeno: 5, ukupno: 5 });
    expect(napredak.at(-1)).toEqual({ faza: 'slajdovi' });
    // Crtač zatvara pozivalac (dijalog), ne `uveziPdf`.
    expect(crtac.zatvoren).toBe(0);
  });

  it('strane 2 i 3 iste -> 4 slanja, slajdovi 2 i 3 imaju isti medijId', async () => {
    const isti = { bajtovi: new Uint8Array([...PNG, 99]) };
    const { api, ishod } = pokreni(new LazniCrtac(5, { 2: isti, 3: isti }), { od: 1, do: 5, posle: null });
    await odgovaraj(api, 4);
    await vi.waitFor(() => expect(api.uvozi).toHaveLength(1));
    expect(api.uploadi).toHaveLength(4);
    const cmd = api.uvozi[0].cmd;
    expect(cmd.posle).toBeNull();
    expect([0, 1, 2, 3, 4].map((i) => medijSlajda(cmd, i))).toEqual(['m1', 'm2', 'm2', 'm3', 'm4']);
    api.uvozi[0].odgovor.next(DETALJI);
    api.uvozi[0].odgovor.complete();
    expect(await ishod).toEqual({ vrednost: DETALJI });
  });

  it('memorija: dok nijedno slanje ne završi, 4 crtanja i 3 slanja (najviše 4 slike), pa ništa dalje', async () => {
    const crtac = new LazniCrtac(6);
    const { api } = pokreni(crtac, { od: 1, do: 6, posle: null });
    await vi.waitFor(() => expect(api.uploadi).toHaveLength(3));
    await odmor(10);
    expect(crtac.pozvane).toEqual([1, 2, 3, 4]);
    expect(api.uploadi).toHaveLength(3);
    api.odgovoriUpload(1, 'm2');
    await vi.waitFor(() => expect(api.uploadi).toHaveLength(4));
    await odmor(10);
    expect(crtac.pozvane).toEqual([1, 2, 3, 4, 5]);
    expect(api.uploadi[3].fajl.name).toBe('Predavanje - str. 4.png');
    expect(api.uploadi).toHaveLength(4);
  });

  it('slanje padne i posle ponavljanja -> greška sa brojem strane, crtanje stalo, ostala slanja otkazana, nema uvoza', async () => {
    const crtac = new LazniCrtac(6);
    const cekaj = vi.fn<(ms: number) => Observable<unknown>>(() => of(0));
    const { api, ishod } = pokreni(crtac, { od: 1, do: 6, posle: null }, { cekaj });
    await vi.waitFor(() => expect(api.uploadi).toHaveLength(3));
    api.uploadi[0].odgovor.error(greska(503));
    api.uploadi.at(-1)!.odgovor.error(greska(503));
    api.uploadi.at(-1)!.odgovor.error(greska(503));
    const e = await greskaIshoda(ishod);
    expect(e.message).toBe('Strana 1 nije poslata: server je odgovorio greškom 503.');
    expect(cekaj.mock.calls.map((c) => c[0])).toEqual([1000, 3000]);
    expect(api.uploadi.filter((u) => u.fajl.name === 'Predavanje - str. 1.png')).toHaveLength(3);
    expect(api.uvozi).toHaveLength(0);
    expect(crtac.pozvane.length).toBeLessThan(6);
    expect(api.slusanih).toBe(0);
    await odmor();
    expect(api.uvozi).toHaveLength(0);
  });

  it('greška slanja posle poslednje strane -> odbijeno odmah, bez čekanja ostalih slanja (koja se otkazuju)', async () => {
    const { api, ishod } = pokreni(new LazniCrtac(2), { od: 1, do: 2, posle: null });
    await vi.waitFor(() => expect(api.uploadi).toHaveLength(2));
    api.uploadi[0].odgovor.error(greska(400, 'Dozvoljene su samo slike.'));
    const e = await greskaIshoda(ishod);
    expect(e.message).toBe('Strana 1 nije poslata: Dozvoljene su samo slike.');
    expect(api.slusanih).toBe(0);
    expect(api.uvozi).toHaveLength(0);
  });

  it('"Otkaži" posle druge strane -> OTKAZANO_PDF, bez uvoza i bez slanja koja još teku', async () => {
    const prekid = new AbortController();
    const crtac = new LazniCrtac(5, {}, (broj) => broj === 2 && prekid.abort());
    const { api, ishod } = pokreni(crtac, { od: 1, do: 5, posle: null }, {}, prekid);
    const e = await greskaIshoda(ishod);
    expect(e.message).toBe(OTKAZANO_PDF);
    expect(e.nepoznatIshod).toBe(false);
    expect(crtac.pozvane).toEqual([1, 2]);
    expect(api.uploadi).toHaveLength(1);
    expect(api.slusanih).toBe(0);
    expect(api.uvozi).toHaveLength(0);
  });

  it('"Otkaži" dok strana čeka slobodno mesto -> OTKAZANO_PDF odmah, sva slanja otkazana', async () => {
    const crtac = new LazniCrtac(6);
    const { api, ishod, prekid } = pokreni(crtac, { od: 1, do: 6, posle: null });
    await vi.waitFor(() => expect(api.uploadi).toHaveLength(3));
    await odmor();
    prekid.abort();
    const e = await greskaIshoda(ishod);
    expect(e.message).toBe(OTKAZANO_PDF);
    expect(api.slusanih).toBe(0);
    expect(api.uploadi).toHaveLength(3);
    expect(api.uvozi).toHaveLength(0);
  });

  it('"Otkaži" dok se strana crta (crtanje nikad ne završi) -> odmah OTKAZANO_PDF, bez neobrađenog odbijanja', async () => {
    const neobradjena = pratiNeobradjena();
    try {
      const crtac = new LazniCrtac(3);
      let odbijCrtanje: (e: unknown) => void = () => undefined;
      crtac.nacrtaj = vi.fn((broj: number) => {
        crtac.pozvane.push(broj);
        return broj === 1
          ? Promise.resolve({ bajtovi: new Uint8Array([...PNG, 1]), mime: 'image/png' as const, sirina: 960, visina: 540 })
          : new Promise<CrtezStrane>((_, odbij) => (odbijCrtanje = odbij));
      });
      const { api, ishod, prekid } = pokreni(crtac, { od: 1, do: 3, posle: null });
      await vi.waitFor(() => expect(crtac.pozvane).toEqual([1, 2]));
      prekid.abort();
      const e = await greskaIshoda(ishod);
      expect(e.message).toBe(OTKAZANO_PDF);
      expect(api.slusanih).toBe(0);
      expect(api.uvozi).toHaveLength(0);
      // Napušteno crtanje odbije kasnije (F14 `zatvori()` gasi pdf.js usred crtanja): to ne sme biti neobrađeno odbijanje.
      odbijCrtanje(new Error('Worker was destroyed'));
      await odmor();
      expect(neobradjena.lista).toEqual([]);
    } finally {
      neobradjena.prestani();
    }
  });

  it('greška slanja dok se strana crta -> odmah ta greška, ne čeka se crtanje', async () => {
    const crtac = new LazniCrtac(3);
    crtac.nacrtaj = vi.fn((broj: number) => {
      crtac.pozvane.push(broj);
      return broj === 1
        ? Promise.resolve({ bajtovi: new Uint8Array([...PNG, 1]), mime: 'image/png' as const, sirina: 960, visina: 540 })
        : new Promise<CrtezStrane>(() => undefined);
    });
    const { api, ishod } = pokreni(crtac, { od: 1, do: 3, posle: null });
    await vi.waitFor(() => expect(crtac.pozvane).toEqual([1, 2]));
    api.uploadi[0].odgovor.error(greska(400, 'Dozvoljene su samo slike.'));
    expect((await greskaIshoda(ishod)).message).toBe('Strana 1 nije poslata: Dozvoljene su samo slike.');
  });

  it('slanja završe van redosleda -> slajdovi ostaju po stranama, svaki sa svojim id-jem', async () => {
    const { api, napredak, ishod } = pokreni(new LazniCrtac(3), { od: 1, do: 3, posle: null });
    await vi.waitFor(() => expect(api.uploadi).toHaveLength(3));
    api.odgovoriUpload(2, 'treca');
    api.odgovoriUpload(0, 'prva');
    api.odgovoriUpload(1, 'druga');
    await vi.waitFor(() => expect(api.uvozi).toHaveLength(1));
    const cmd = api.uvozi[0].cmd;
    expect([0, 1, 2].map((i) => medijSlajda(cmd, i))).toEqual(['prva', 'druga', 'treca']);
    expect(cmd.slajdovi.map((s) => s.platno!.slojevi[0].naziv)).toEqual([1, 2, 3].map((n) => `Predavanje - str. ${n}`));
    expect(napredak.filter((n) => n.faza === 'strane').map((n) => (n as { uradjeno: number }).uradjeno)).toEqual([0, 1, 2, 3]);
    api.uvozi[0].odgovor.next(DETALJI);
    api.uvozi[0].odgovor.complete();
    expect(await ishod).toEqual({ vrednost: DETALJI });
  });

  it('"Otkaži" pre početka -> OTKAZANO_PDF bez ijednog crtanja', async () => {
    const prekid = new AbortController();
    prekid.abort();
    const crtac = new LazniCrtac(3);
    const { api, ishod } = pokreni(crtac, { od: 1, do: 3, posle: null }, {}, prekid);
    expect((await greskaIshoda(ishod)).message).toBe(OTKAZANO_PDF);
    expect(crtac.pozvane).toEqual([]);
    expect(api.uploadi).toHaveLength(0);
  });

  it('"Otkaži" dok se heš računa -> slika te strane se ne šalje', async () => {
    const prekid = new AbortController();
    const hes = vi.fn(async (b: Uint8Array) => {
      if (b.at(-1) === 2) prekid.abort();
      return lazniHes(b);
    });
    const { api, ishod } = pokreni(new LazniCrtac(3), { od: 1, do: 3, posle: null }, { hes }, prekid);
    expect((await greskaIshoda(ishod)).message).toBe(OTKAZANO_PDF);
    expect(api.uploadi.map((u) => u.fajl.name)).toEqual(['Predavanje - str. 1.png']);
    expect(api.slusanih).toBe(0);
  });

  it('strana veća od 10 MB i posle sažimanja -> greška te strane, bez uvoza', async () => {
    const velika = new Uint8Array(MAX_SLIKA_STRANE + 1);
    velika.set(PNG);
    const { api, ishod } = pokreni(new LazniCrtac(5, { 3: { bajtovi: velika } }), { od: 1, do: 5, posle: null });
    const e = await greskaIshoda(ishod);
    expect(e.message).toBe('Strana 3 je i posle sažimanja veća od 10 MB.');
    expect(api.uvozi).toHaveLength(0);
    expect(api.slusanih).toBe(0);
  });

  it('strana od tačno 10 MB prolazi', async () => {
    const granicna = new Uint8Array(MAX_SLIKA_STRANE);
    granicna.set(PNG);
    const { api, ishod } = pokreni(new LazniCrtac(1, { 1: { bajtovi: granicna } }), { od: 1, do: 1, posle: null });
    await odgovaraj(api, 1);
    await vi.waitFor(() => expect(api.uvozi).toHaveLength(1));
    api.uvozi[0].odgovor.next(DETALJI);
    api.uvozi[0].odgovor.complete();
    expect(await ishod).toEqual({ vrednost: DETALJI });
  });

  it('opseg 5-7, uvoz odbijen sa `Slajd 2: …` -> `Strana 6: …`', async () => {
    const crtac = new LazniCrtac(10);
    const { api, napredak, ishod } = pokreni(crtac, { od: 5, do: 7, posle: null });
    await odgovaraj(api, 3);
    await vi.waitFor(() => expect(api.uvozi).toHaveLength(1));
    expect(crtac.pozvane).toEqual([5, 6, 7]);
    expect(napredak[0]).toEqual({ faza: 'strane', uradjeno: 0, ukupno: 3 });
    expect(api.uvozi[0].cmd.slajdovi.map((s) => s.platno!.slojevi[0].naziv)).toEqual(
      ['Predavanje - str. 5', 'Predavanje - str. 6', 'Predavanje - str. 7']);
    api.uvozi[0].odgovor.error(greska(400, 'Slajd 2: Slika nije pronađena.'));
    const e = await greskaIshoda(ishod);
    expect(e.message).toBe('Strana 6: Slika nije pronađena.');
    expect(e.nepoznatIshod).toBe(false);
  });

  it('uvoz bez odgovora servera (status 0) -> nepoznat ishod', async () => {
    const { api, ishod } = pokreni(new LazniCrtac(2), { od: 1, do: 2, posle: null });
    await odgovaraj(api, 2);
    await vi.waitFor(() => expect(api.uvozi).toHaveLength(1));
    api.uvozi[0].odgovor.error(greska(0));
    const e = await greskaIshoda(ishod);
    expect(e.nepoznatIshod).toBe(true);
  });

  it('greška crtanja prolazi kakva jeste i zaustavlja uvoz', async () => {
    const crtac = new LazniCrtac(3);
    crtac.nacrtaj = vi.fn(async (broj: number) => {
      if (broj === 2) throw new Error('Strana 2 nije nacrtana.');
      return { bajtovi: new Uint8Array([...PNG, broj]), mime: 'image/png' as const, sirina: 960, visina: 540 };
    });
    const { api, ishod } = pokreni(crtac, { od: 1, do: 3, posle: null });
    const i = await ishod;
    expect((i as { greska: Error }).greska.message).toBe('Strana 2 nije nacrtana.');
    expect(api.slusanih).toBe(0);
    expect(api.uvozi).toHaveLength(0);
  });

  it('heš koji ne uspe -> poruka za korisnika sa brojem strane; GreskaSlanja heša prolazi', async () => {
    const pukao = pokreni(new LazniCrtac(2), { od: 1, do: 2, posle: null }, { hes: async () => Promise.reject(new Error('x')) });
    expect((await greskaIshoda(pukao.ishod)).message).toBe('Strana 1 nije mogla da se pripremi.');
    const nebezbedno = new GreskaSlanja('Nebezbedna veza.');
    const http = pokreni(new LazniCrtac(2), { od: 1, do: 2, posle: null }, { hes: async () => Promise.reject(nebezbedno) });
    expect(await greskaIshoda(http.ishod)).toBe(nebezbedno);
  });

  it('nevažeći opseg -> GreskaSlanja pre ijednog crtanja', async () => {
    for (const izbor of [{ od: 0, do: 2 }, { od: 3, do: 2 }, { od: 1, do: 4 }]) {
      const crtac = new LazniCrtac(3);
      const { ishod } = pokreni(crtac, { ...izbor, posle: null });
      expect((await greskaIshoda(ishod)).message).toBe('Izaberi strane od 1 do 3.');
      expect(crtac.pozvane).toEqual([]);
    }
    const crtac = new LazniCrtac(250);
    const { ishod } = pokreni(crtac, { od: 1, do: 201, posle: null });
    expect((await greskaIshoda(ishod)).message).toBe('Najviše 200 strana odjednom. Izaberi manji opseg.');
    expect(crtac.pozvane).toEqual([]);
  });

  it('WebP i JPEG strane dobijaju odgovarajuću ekstenziju i tip', async () => {
    const webp = { bajtovi: new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]), mime: 'image/webp' as const };
    const jpeg = { bajtovi: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), mime: 'image/jpeg' as const };
    const { api } = pokreni(new LazniCrtac(2, { 1: webp, 2: jpeg }), { od: 1, do: 2, posle: null });
    await vi.waitFor(() => expect(api.uploadi).toHaveLength(2));
    expect(api.uploadi.map((u) => [u.fajl.name, u.fajl.type])).toEqual([
      ['Predavanje - str. 1.webp', 'image/webp'], ['Predavanje - str. 2.jpg', 'image/jpeg'],
    ]);
  });
});
