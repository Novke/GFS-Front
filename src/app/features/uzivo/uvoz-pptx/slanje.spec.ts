import { HttpErrorResponse } from '@angular/common/http';
import { Observable, of, Subject, Subscription } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import type { FormulaSloj, Platno, Sloj } from '../data-access/platno.models';
import type { MedijInfo, PrezentacijaDetails, SlajdCmd, UvozSlajdovaCmd } from '../data-access/uzivo.models';
import { praznaStatistika } from './izvestaj';
import {
  ApiUvoza, GreskaSlanja, greskaUvozaSlajdova, MAX_SLIKA, MAX_TELO_UVOZA, Napredak, posaljiSliku, posaljiUvoz, sha256, velicinaTela,
  ZavisnostiSlanja, zameniMedije,
} from './slanje';
import type { MedijUvoza, RezultatUvoza, UvezenSlajd } from './uvoz';

// --- podaci -------------------------------------------------------------------------------------------------------

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff, 0xe0];
const png = (...rep: number[]) => new Uint8Array([...PNG, ...rep]);
/** Različite slike za lažni heš (dužina + prvih 8 bajtova): razlikuju se po dužini. */
const razlicit = (i: number) => png(...new Array<number>(i + 1).fill(i));

const osnova = (id: string) => ({ id, naziv: null, x: 0, y: 0, sirina: 100, visina: 50, rotacija: 0, providnost: 1, zakljucan: false, senka: null });
const slika = (id: string, medijId: string): Sloj => ({ ...osnova(id), tip: 'SLIKA', medijId, isecak: { levo: 0, gore: 0, desno: 0, dole: 0 } });
const crtez = (id: string, medijId: string): Sloj => ({ ...osnova(id), tip: 'CRTEZ', medijId, potezi: null });
const formula = (id: string, slikaIzvora: string | null): FormulaSloj => ({
  ...osnova(id), tip: 'FORMULA', latex: 'x', boja: '#000000', velicina: 20, poravnanje: 'LEVO', slikaIzvora,
});
const tekst = (id: string, t: string): Sloj => ({
  ...osnova(id), tip: 'TEKST', popuna: null, ivica: null,
  okvir: { unutraLevo: 7.2, unutraGore: 3.6, unutraDesno: 7.2, unutraDole: 3.6, sidro: 'VRH', prelom: true, skala: 1, skalaProreda: 1 },
  pasusi: [{
    poravnanje: 'LEVO', nivo: 0, lista: null, uvlacenje: { levo: 0, prviRed: 0 }, razmakPre: 0, razmakPosle: 0, proredProcenat: 100,
    tabulatori: [], delovi: [{ tekst: t, font: 'Carlito', velicina: 18, boja: '#000000', podebljano: false, kurziv: false, podvuceno: false, precrtano: false, polozaj: 'OBICAN' }],
  }],
});
const platno = (slojevi: Sloj[], pozadina: string | null = null): Platno =>
  ({ verzija: 1, pozadina: { boja: '#FFFFFF', medijId: pozadina }, slojevi, animacije: [] });

function slajd(indeks: number, slojevi: Sloj[], mediji: string[] = []): UvezenSlajd {
  const cmd: SlajdCmd = { tip: 'PLATNO', naslov: null, sadrzaj: null, slikaId: null, beleske: null, postepeno: false, pitanje: null, platno: platno(slojevi) };
  return { indeks, cmd, mediji, statistika: praznaStatistika() };
}

function rezultat(slajdovi: UvezenSlajd[], bajtovi: Record<string, Uint8Array | null> = {}): RezultatUvoza {
  const mediji = new Map<string, MedijUvoza>();
  for (const [kljuc, b] of Object.entries(bajtovi)) {
    mediji.set(kljuc, { kljuc, ime: kljuc.replace(/^.*\//, ''), bajtovi: () => b });
  }
  return { imeFajla: 'p.pptx', ukupnoSlajdova: Math.max(0, ...slajdovi.map((s) => s.indeks)), slajdovi, greske: [], upozorenja: [], mediji };
}

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
  odgovoriUvoz(i = 0) {
    this.uvozi[i].odgovor.next(DETALJI);
    this.uvozi[i].odgovor.complete();
  }
}

/** Heš za testove: dužina + prvih 8 bajtova, hex. */
const lazniHes = async (b: Uint8Array) => [b.length, ...b.slice(0, 8)].map((x) => x.toString(16).padStart(2, '0')).join('');

function zavisnosti(api: LazniApi, deo: Partial<ZavisnostiSlanja> = {}) {
  const cekaj = vi.fn<(ms: number) => Observable<unknown>>(() => of(null));
  const smanji = vi.fn(async (_b: Uint8Array, ime: string) => ({ bajtovi: png(1, 2, 3), ime: ime.replace(/\.[^.]*$/, '.png') }));
  const z: ZavisnostiSlanja = { api, hes: lazniHes, cekaj, smanji, ...deo };
  return { z, cekaj, smanji };
}

/** Pokreće slanje i beleži sve što izađe. */
function pokreni(r: RezultatUvoza, izbor: { od: number; do: number; posle: number | null }, z: ZavisnostiSlanja) {
  const napredak: Napredak[] = [];
  const ishod: { vrednost?: { prezentacija: PrezentacijaDetails; upozorenja: { kod: string; slajd: number | null }[] }; greska?: unknown } = {};
  const pretplata: Subscription = posaljiUvoz(7, r, izbor, z, (n) => napredak.push(n)).subscribe({
    next: (v) => (ishod.vrednost = v),
    error: (e) => (ishod.greska = e),
  });
  return { napredak, ishod, pretplata };
}

/** Pušta obećanja (heš, smanjivanje) da se završe. */
const tik = () => new Promise((r) => setTimeout(r));

// --- testovi ------------------------------------------------------------------------------------------------------

describe('posaljiUvoz', () => {
  it('deduplikacija: dva ključa sa istim bajtovima -> jedan upload, oba ključa dobijaju isti id', async () => {
    const api = new LazniApi();
    const r = rezultat(
      [slajd(1, [slika('s1', 'pptx:ppt/media/image1.png')], ['pptx:ppt/media/image1.png']),
        slajd(2, [slika('s1', 'gen:1')], ['gen:1'])],
      { 'pptx:ppt/media/image1.png': png(9, 9), 'gen:1': png(9, 9) },
    );
    const { ishod } = pokreni(r, { od: 1, do: 2, posle: null }, zavisnosti(api).z);
    await tik();
    expect(api.uploadi).toHaveLength(1);
    expect(api.uploadi[0].fajl.name).toBe('image1.png');
    expect(api.uploadi[0].fajl.type).toBe('image/png');
    api.odgovoriUpload(0, 'uuid-a');
    expect(api.uvozi).toHaveLength(1);
    const ids = api.uvozi[0].cmd.slajdovi.map((s) => (s.platno!.slojevi[0] as { medijId: string }).medijId);
    expect(ids).toEqual(['uuid-a', 'uuid-a']);
    api.odgovoriUvoz();
    expect(ishod.vrednost).toEqual({ prezentacija: DETALJI, upozorenja: [] });
  });

  it('najviseTriIstovremeno: 5 medija, odgovori zadržani -> 3 aktivna, posle prvog odgovora kreće 4.', async () => {
    const api = new LazniApi();
    const kljucevi = [1, 2, 3, 4, 5].map((i) => `gen:${i}`);
    const r = rezultat([slajd(1, kljucevi.map((k, i) => slika(`s${i}`, k)), kljucevi)],
      Object.fromEntries(kljucevi.map((k, i) => [k, razlicit(i)])));
    pokreni(r, { od: 1, do: 1, posle: null }, zavisnosti(api).z);
    await tik();
    expect(api.uploadi).toHaveLength(3);
    api.odgovoriUpload(1, 'b');
    expect(api.uploadi).toHaveLength(4);
    expect(api.uvozi).toHaveLength(0);
  });

  it('ponavljanje: 503, 503, pa uspeh -> 3 poziva, čeka 1000 pa 3000 ms', async () => {
    let poziva = 0;
    const api = new LazniApi();
    api.upload = vi.fn<(f: File) => Observable<MedijInfo>>(() => {
      poziva++;
      return poziva < 3 ? new Observable<MedijInfo>((s) => s.error(greska(503))) : of(medij('ok'));
    });
    const { z, cekaj } = zavisnosti(api);
    const r = rezultat([slajd(1, [slika('s1', 'gen:1')], ['gen:1'])], { 'gen:1': png(1) });
    pokreni(r, { od: 1, do: 1, posle: null }, z);
    await tik();
    expect(poziva).toBe(3);
    expect(cekaj.mock.calls.map((c) => c[0])).toEqual([1000, 3000]);
    expect(api.uvozi).toHaveLength(1);
  });

  it('ponavljanje: status 0, 408 i 429 su privremeni; 400 je odmah greška sa porukom servera', async () => {
    for (const status of [0, 408, 429]) {
      let poziva = 0;
      const api = new LazniApi();
      api.upload = vi.fn(() => (poziva++ === 0 ? new Observable<MedijInfo>((s) => s.error(greska(status))) : of(medij('ok'))));
      pokreni(rezultat([slajd(1, [slika('s1', 'gen:1')], ['gen:1'])], { 'gen:1': png(1) }), { od: 1, do: 1, posle: null }, zavisnosti(api).z);
      await tik();
      expect(poziva).toBe(2);
    }
    const api = new LazniApi();
    let poziva = 0;
    api.upload = vi.fn(() => {
      poziva++;
      return new Observable<MedijInfo>((s) => s.error(greska(400, 'Dozvoljene su samo slike PNG, JPEG, GIF i WebP.')));
    });
    const { z, cekaj } = zavisnosti(api);
    const r = rezultat([slajd(1, [slika('s1', 'pptx:ppt/media/image4.png')], ['pptx:ppt/media/image4.png'])], { 'pptx:ppt/media/image4.png': png(1) });
    const { ishod } = pokreni(r, { od: 1, do: 1, posle: null }, z);
    await tik();
    expect(poziva).toBe(1);
    expect(cekaj).not.toHaveBeenCalled();
    expect(ishod.greska).toBeInstanceOf(GreskaSlanja);
    expect((ishod.greska as Error).message).toBe('Slika image4.png nije poslata: Dozvoljene su samo slike PNG, JPEG, GIF i WebP.');
    expect(api.uvozi).toHaveLength(0);
  });

  it('ponavljanje: tri privremene greške -> GreskaSlanja (veza)', async () => {
    const api = new LazniApi();
    api.upload = vi.fn(() => new Observable<MedijInfo>((s) => s.error(greska(0))));
    const { ishod } = pokreni(rezultat([slajd(1, [slika('s1', 'gen:1')], ['gen:1'])], { 'gen:1': png(1) }), { od: 1, do: 1, posle: null }, zavisnosti(api).z);
    await tik();
    expect(api.upload).toHaveBeenCalledTimes(3);
    expect((ishod.greska as Error).message).toBe('Slika gen:1 nije poslata: Server nije dostupan. Proveri vezu i pokušaj ponovo.');
  });

  it('prevelikaSlika: 11 MB -> smanji pozvan, šalje se smanjena kopija, SLIKA_SMANJENA u upozorenjima', async () => {
    const api = new LazniApi();
    const velika = new Uint8Array(11 * 1024 * 1024);
    velika.set(JPEG);
    const { z, smanji } = zavisnosti(api);
    const r = rezultat([slajd(1, [tekst('s1', 'a')]), slajd(2, [slika('s1', 'pptx:ppt/media/image2.jpeg')], ['pptx:ppt/media/image2.jpeg'])],
      { 'pptx:ppt/media/image2.jpeg': velika });
    const { ishod } = pokreni(r, { od: 1, do: 2, posle: null }, z);
    await tik();
    expect(smanji).toHaveBeenCalledTimes(1);
    expect(smanji.mock.calls[0][0]).toBe(velika); // toBe: duboko poređenje 11 MB je sporo
    expect(smanji.mock.calls[0][1]).toBe('image2.jpeg');
    expect(api.uploadi[0].fajl.name).toBe('image2.png');
    expect(api.uploadi[0].fajl.size).toBe(PNG.length + 3);
    api.odgovoriUpload(0, 'u');
    api.odgovoriUvoz();
    expect(ishod.vrednost!.upozorenja).toEqual([expect.objectContaining({ slajd: 2, kod: 'SLIKA_SMANJENA' })]);
  });

  // Do slanja stižu samo slike koje `slikaZaSlanje` prima (format servera ili BMP): SVG, PDF i prazan deo preskače već
  // pretvaranje (`slika.spec.ts`, `uvoz.spec.ts`). Greška ovde je samo stvarna greška slanja (pregledač bez canvas-a,
  // smanjivanje koje ne uspe).
  it('BMP (server ga ne prima) se pretvara; stvaran neuspeh pretvaranja u pregledaču je GreskaSlanja', async () => {
    const api = new LazniApi();
    const bmp = new Uint8Array([0x42, 0x4d, 1, 2, 3]);
    const { z, smanji } = zavisnosti(api);
    pokreni(rezultat([slajd(1, [slika('s1', 'gen:1')], ['gen:1'])], { 'gen:1': bmp }), { od: 1, do: 1, posle: null }, z);
    await tik();
    expect(smanji).toHaveBeenCalledTimes(1);
    expect(api.uploadi).toHaveLength(1);

    const api2 = new LazniApi();
    const { z: z2 } = zavisnosti(api2, { smanji: async () => { throw new Error('nema canvas-a'); } });
    const { ishod } = pokreni(rezultat([slajd(1, [slika('s1', 'pptx:ppt/media/a.bmp')], ['pptx:ppt/media/a.bmp'])], { 'pptx:ppt/media/a.bmp': bmp }),
      { od: 1, do: 1, posle: null }, z2);
    await tik();
    expect((ishod.greska as Error).message).toBe('Slika a.bmp nije mogla da se pripremi.');
    expect(api2.uploadi).toHaveLength(0);

    // smanjivanje koje ne spusti sliku ispod 10 MB je takođe neuspeh
    const api3 = new LazniApi();
    const prevelika = new Uint8Array(MAX_SLIKA + 1);
    prevelika.set(PNG);
    const { z: z3 } = zavisnosti(api3, { smanji: async (b, ime) => ({ bajtovi: prevelika, ime }) });
    const r3 = pokreni(rezultat([slajd(1, [slika('s1', 'pptx:ppt/media/b.png')], ['pptx:ppt/media/b.png'])], { 'pptx:ppt/media/b.png': prevelika }),
      { od: 1, do: 1, posle: null }, z3);
    await tik();
    expect((r3.ishod.greska as Error).message).toBe('Slika b.png nije mogla da se pripremi.');
  });

  it('heš koji baci -> GreskaSlanja "nije mogla da se pripremi", nijedan upload', async () => {
    const api = new LazniApi();
    const { z } = zavisnosti(api, { hes: async () => { throw new Error('digest'); } });
    const { ishod } = pokreni(rezultat([slajd(1, [slika('s1', 'pptx:ppt/media/image1.png')], ['pptx:ppt/media/image1.png'])], { 'pptx:ppt/media/image1.png': png(1) }),
      { od: 1, do: 1, posle: null }, z);
    await tik();
    expect(ishod.greska).toBeInstanceOf(GreskaSlanja);
    expect((ishod.greska as Error).message).toBe('Slika image1.png nije mogla da se pripremi.');
    expect(api.uploadi).toHaveLength(0);
  });

  it('podrazumevani heš bez crypto.subtle (http, nebezbedna veza) -> jasna GreskaSlanja', async () => {
    vi.stubGlobal('crypto', {});
    try {
      const api = new LazniApi();
      const { z } = zavisnosti(api, { hes: undefined });
      const { ishod } = pokreni(rezultat([slajd(1, [slika('s1', 'gen:1')], ['gen:1'])], { 'gen:1': png(1) }), { od: 1, do: 1, posle: null }, z);
      await tik();
      expect(ishod.greska).toBeInstanceOf(GreskaSlanja);
      expect((ishod.greska as Error).message)
        .toBe('Pregledač ne dozvoljava proveru slika na nebezbednoj vezi (http). Otvori aplikaciju preko https i pokušaj ponovo.');
      expect(api.uploadi).toHaveLength(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('podrazumevani heš je SHA-256 (hex): iste slike -> jedan upload', async () => {
    const api = new LazniApi();
    const { z } = zavisnosti(api, { hes: undefined });
    pokreni(rezultat([slajd(1, [slika('s1', 'gen:1'), slika('s2', 'gen:2'), slika('s3', 'gen:3')], ['gen:1', 'gen:2', 'gen:3'])],
      { 'gen:1': png(1), 'gen:2': png(1), 'gen:3': png(2) }), { od: 1, do: 1, posle: null }, z);
    await vi.waitFor(() => expect(api.uploadi).toHaveLength(2));
  });

  it('slika bez bajtova u fajlu -> GreskaSlanja pre ijednog upload-a', async () => {
    const api = new LazniApi();
    const r = rezultat([slajd(1, [slika('s1', 'gen:1'), slika('s2', 'pptx:ppt/media/image9.png')], ['gen:1', 'pptx:ppt/media/image9.png'])],
      { 'gen:1': png(1), 'pptx:ppt/media/image9.png': null });
    const { ishod } = pokreni(r, { od: 1, do: 1, posle: null }, zavisnosti(api).z);
    await tik();
    expect(ishod.greska).toBeInstanceOf(GreskaSlanja);
    expect((ishod.greska as Error).message).toBe('Slika image9.png nije pronađena u fajlu.');
    expect(api.uploadi).toHaveLength(0);
  });

  it('teloPreko10MB: slajdovi sa ukupno 10,5 MB teksta -> GreskaSlanja iz pravila 1, 0 upload poziva', async () => {
    const api = new LazniApi();
    const pola = 'a'.repeat(512 * 1024);
    const slajdovi = Array.from({ length: 21 }, (_, i) => slajd(i + 1, [tekst('s1', pola), slika('s2', 'gen:1')], ['gen:1']));
    const r = rezultat(slajdovi, { 'gen:1': png(1) });
    const telo = velicinaTela(slajdovi, null);
    expect(telo).toBeGreaterThan(MAX_TELO_UVOZA);
    const { ishod } = pokreni(r, { od: 1, do: 21, posle: null }, zavisnosti(api).z);
    await tik();
    expect(ishod.greska).toBeInstanceOf(GreskaSlanja);
    expect((ishod.greska as Error).message)
      .toBe('Izabrani slajdovi su preveliki za jedan uvoz (10,6 MB, najviše 10 MB). Izaberi manji opseg.');
    expect(api.uploadi).toHaveLength(0);
    expect(api.uvozi).toHaveLength(0);
  });

  it('prazan opseg -> GreskaSlanja', async () => {
    const api = new LazniApi();
    const { ishod } = pokreni(rezultat([slajd(1, [tekst('s1', 'a')])]), { od: 2, do: 3, posle: null }, zavisnosti(api).z);
    await tik();
    expect((ishod.greska as Error).message).toBe('Izabrani opseg nema nijedan slajd.');
  });

  it('samoOpseg: slajdovi 1, 2, 4 (3 je skriven), izbor 2..4 -> uvezi dobija 2 slajda i posle', async () => {
    const api = new LazniApi();
    const r = rezultat([slajd(1, [tekst('s1', 'jedan')]), slajd(2, [tekst('s1', 'dva')]), slajd(4, [tekst('s1', 'četiri')])]);
    pokreni(r, { od: 2, do: 4, posle: 41 }, zavisnosti(api).z);
    await tik();
    expect(api.uvozi).toHaveLength(1);
    expect(api.uvozi[0].id).toBe(7);
    expect(api.uvozi[0].cmd.posle).toBe(41);
    expect(api.uvozi[0].cmd.slajdovi).toEqual([r.slajdovi[1].cmd, r.slajdovi[2].cmd]);
  });

  it('porukaServera: 400 "Slajd 2: …" sa izborom 2..4 -> "PowerPoint slajd 4: …"', async () => {
    const api = new LazniApi();
    const r = rezultat([slajd(1, [tekst('s1', 'a')]), slajd(2, [tekst('s1', 'b')]), slajd(4, [tekst('s1', 'c')])]);
    const { ishod } = pokreni(r, { od: 2, do: 4, posle: null }, zavisnosti(api).z);
    await tik();
    api.uvozi[0].odgovor.error(greska(400, 'Slajd 2: Font nije podržan: X.'));
    expect(ishod.greska).toBeInstanceOf(GreskaSlanja);
    expect((ishod.greska as Error).message).toBe('PowerPoint slajd 4: Font nije podržan: X.');
  });

  it('greške uvoza bez broja slajda: poruka servera, 413 po statusu (nginx HTML), prekid veze je nejasan ishod', async () => {
    const slucajevi: [HttpErrorResponse, string][] = [
      [greska(400, 'Prezentacija može imati najviše 200 slajdova (ima 190, uvozi se 20).'), 'Prezentacija može imati najviše 200 slajdova (ima 190, uvozi se 20).'],
      [greska(413), 'Uvoz je prevelik (najviše 10 MB). Izaberi manji opseg slajdova.'],
      [greska(413, 'Uvoz je prevelik (najviše 10 MB). Uvezi deo po deo (opseg slajdova).'), 'Uvoz je prevelik (najviše 10 MB). Uvezi deo po deo (opseg slajdova).'],
      [greska(0), 'Server nije potvrdio uvoz (veza je prekinuta). Slajdovi su možda ipak dodati; prezentacija se ponovo učitava kad zatvoriš ovaj prozor.'],
      [greska(504), 'Server nije potvrdio uvoz (veza je prekinuta). Slajdovi su možda ipak dodati; prezentacija se ponovo učitava kad zatvoriš ovaj prozor.'],
      [greska(500, 'Sistemska greška.'), 'Slajdovi nisu uvezeni: Sistemska greška.'],
      [greska(429), 'Server trenutno prima previše zahteva: pokušaj ponovo za trenutak.'],
      [greska(429, 'Previše zahteva.'), 'Server trenutno prima previše zahteva: pokušaj ponovo za trenutak.'],
      // 201 čiji odgovor nije pročitan (HttpClient: greška parsiranja sa statusom 2xx): uvoz je verovatno upisan
      [new HttpErrorResponse({ status: 201, error: { error: new SyntaxError('JSON'), text: '<html>' } }),
        'Odgovor servera nije pročitan. Slajdovi su možda ipak dodati; prezentacija se ponovo učitava kad zatvoriš ovaj prozor.'],
      // "Slajd N:" se preslikava po poruci, bez obzira na status
      [greska(422, 'Slajd 1: Font nije podržan: Y.'), 'PowerPoint slajd 1: Font nije podržan: Y.'],
      // broj slajda van izbora: poruka servera ostaje
      [greska(400, 'Slajd 9: Font nije podržan: Y.'), 'Slajd 9: Font nije podržan: Y.'],
    ];
    for (const [e, poruka] of slucajevi) {
      const api = new LazniApi();
      const { ishod } = pokreni(rezultat([slajd(1, [tekst('s1', 'a')])]), { od: 1, do: 1, posle: null }, zavisnosti(api).z);
      await tik();
      api.uvozi[0].odgovor.error(e);
      expect((ishod.greska as Error).message).toBe(poruka);
      expect(api.uvozi).toHaveLength(1); // uvoz se nikad ne ponavlja sam (nije idempotentan)
    }
  });

  it('nepoznatIshod: samo kad server možda jeste upisao uvoz (veza, 5xx bez razloga, nepročitan 2xx)', async () => {
    const slucajevi: [unknown, boolean][] = [
      [greska(0), true],
      [greska(502), true],
      [greska(504), true],
      [new HttpErrorResponse({ status: 201, error: { error: new SyntaxError('JSON'), text: '<html>' } }), true],
      [greska(500, 'Sistemska greška.'), false],
      [greska(400, 'Slajd 1: Font nije podržan: Y.'), false],
      [greska(413), false],
      [greska(429), false],
      [new TypeError('x'), false],
    ];
    for (const [e, nepoznat] of slucajevi) {
      const api = new LazniApi();
      const { ishod } = pokreni(rezultat([slajd(1, [tekst('s1', 'a')])]), { od: 1, do: 1, posle: null }, zavisnosti(api).z);
      await tik();
      api.uvozi[0].odgovor.error(e);
      expect(ishod.greska).toBeInstanceOf(GreskaSlanja);
      expect((ishod.greska as GreskaSlanja).nepoznatIshod, String(e)).toBe(nepoznat);
    }
  });

  it('napredak: slike 0/2, 1/2, 2/2, pa slajdovi', async () => {
    const api = new LazniApi();
    const r = rezultat([slajd(1, [slika('s1', 'gen:1'), crtez('s2', 'gen:2')], ['gen:1', 'gen:2'])], { 'gen:1': razlicit(1), 'gen:2': razlicit(2) });
    const { napredak } = pokreni(r, { od: 1, do: 1, posle: null }, zavisnosti(api).z);
    await tik();
    api.odgovoriUpload(1, 'b');
    api.odgovoriUpload(0, 'a');
    expect(napredak).toEqual([
      { faza: 'slike', poslato: 0, ukupno: 2 }, { faza: 'slike', poslato: 1, ukupno: 2 }, { faza: 'slike', poslato: 2, ukupno: 2 }, { faza: 'slajdovi' },
    ]);
  });

  it('otkazivanje: 5 medija, 3 paralelno; odjava posle prvog odgovora -> broj započetih ne raste, uvezi nije pozvan', async () => {
    const api = new LazniApi();
    const kljucevi = [1, 2, 3, 4, 5].map((i) => `gen:${i}`);
    const r = rezultat([slajd(1, kljucevi.map((k, i) => slika(`s${i}`, k)), kljucevi)], Object.fromEntries(kljucevi.map((k, i) => [k, razlicit(i)])));
    const { pretplata } = pokreni(r, { od: 1, do: 1, posle: null }, zavisnosti(api).z);
    await tik();
    expect(api.uploadi).toHaveLength(3);
    api.odgovoriUpload(0, 'a');
    expect(api.uploadi).toHaveLength(4);
    pretplata.unsubscribe();
    expect(api.uploadi.slice(1).every((u) => !u.odgovor.observed)).toBe(true);
    // odgovori koji stignu posle odjave ne pokreću 5. upload
    api.odgovoriUpload(1, 'b');
    api.odgovoriUpload(2, 'c');
    await tik();
    expect(api.uploadi).toHaveLength(4);
    expect(api.uvozi).toHaveLength(0);
  });

  it('otkazivanje tokom pripreme (heš u toku) -> nijedan upload', async () => {
    const api = new LazniApi();
    const r = rezultat([slajd(1, [slika('s1', 'gen:1')], ['gen:1'])], { 'gen:1': png(1) });
    const { pretplata } = pokreni(r, { od: 1, do: 1, posle: null }, zavisnosti(api).z);
    pretplata.unsubscribe();
    await tik();
    expect(api.uploadi).toHaveLength(0);
  });
});

describe('velicinaTela', () => {
  it('UTF-8 bajtovi tela kakvo HttpClient šalje, sa ključevima medija kao 36-znakovnim id-jem', () => {
    const s = [slajd(1, [tekst('s1', 'šđ'), slika('s2', 'gen:1')], ['gen:1'])];
    const uuid = '0b1e5c2a-9d4f-4c55-8a6e-3f2d1c0b9a87';
    const telo: UvozSlajdovaCmd = { posle: 41, slajdovi: [{ ...s[0].cmd, platno: zameniMedije(s[0].cmd.platno!, new Map([['gen:1', uuid]])) }] };
    expect(velicinaTela(s, 41)).toBe(new TextEncoder().encode(JSON.stringify(telo)).length);
    expect(velicinaTela(s, null)).toBe(velicinaTela(s, 41) - 2 + 4);
  });
});

describe('zameniMedije', () => {
  it('menja pozadinu, SLIKA, CRTEZ i FORMULA.slikaIzvora; nepoznat ključ ostaje; ulaz se ne menja', () => {
    const p = platno([slika('a', 'gen:1'), crtez('b', 'pptx:ppt/media/image1.png'), formula('c', 'gen:2'), formula('d', null), tekst('e', 'x'), slika('f', 'nepoznat')],
      'pptx:ppt/media/image1.png');
    const kopija = structuredClone(p);
    const mapa = new Map([['gen:1', 'id-1'], ['gen:2', 'id-2'], ['pptx:ppt/media/image1.png', 'id-3']]);
    const z = zameniMedije(p, mapa);
    expect(z).not.toBe(p);
    expect(p).toEqual(kopija);
    expect(z.pozadina.medijId).toBe('id-3');
    expect((z.slojevi[0] as { medijId: string }).medijId).toBe('id-1');
    expect((z.slojevi[1] as { medijId: string }).medijId).toBe('id-3');
    expect((z.slojevi[2] as FormulaSloj).slikaIzvora).toBe('id-2');
    expect((z.slojevi[3] as FormulaSloj).slikaIzvora).toBeNull();
    expect(z.slojevi[4]).toBe(p.slojevi[4]);
    expect((z.slojevi[5] as { medijId: string }).medijId).toBe('nepoznat');
  });
});

describe('posaljiSliku', () => {
  // `ime` (u poruci) i `imeFajla` (na uploadu) se razlikuju, da test uhvati zamenu jednog drugim
  const ulaz = { bajtovi: png(1), imeFajla: 'a.png', mime: 'image/png', ime: 'Slika A' };

  it('dva puta 503 pa uspeh -> jedan MedijInfo, 3 poziva, čeka 1000 pa 3000 ms', async () => {
    let poziva = 0;
    const api = new LazniApi();
    api.upload = vi.fn<(f: File) => Observable<MedijInfo>>(() => {
      poziva++;
      return poziva < 3 ? new Observable<MedijInfo>((s) => s.error(greska(503))) : of(medij('ok'));
    });
    const cekaj = vi.fn<(ms: number) => Observable<unknown>>(() => of(0));
    const izlaz: MedijInfo[] = [];
    posaljiSliku(api, ulaz, cekaj).subscribe((m) => izlaz.push(m));
    await tik();
    expect(izlaz).toEqual([medij('ok')]);
    expect(poziva).toBe(3);
    expect(cekaj.mock.calls.map((c) => c[0])).toEqual([1000, 3000]);
  });

  it('šalje fajl sa imenom i tipom iz ulaza', async () => {
    const api = new LazniApi();
    posaljiSliku(api, ulaz, () => of(0)).subscribe();
    await tik();
    expect(api.uploadi[0].fajl.name).toBe('a.png');
    expect(api.uploadi[0].fajl.type).toBe('image/png');
  });

  it('400 -> odmah GreskaSlanja sa imenom slike i razlogom servera', async () => {
    let poziva = 0;
    const api = new LazniApi();
    api.upload = vi.fn(() => {
      poziva++;
      return new Observable<MedijInfo>((s) => s.error(greska(400, 'Dozvoljene su samo slike.')));
    });
    const cekaj = vi.fn<(ms: number) => Observable<unknown>>(() => of(0));
    let e: unknown;
    posaljiSliku(api, ulaz, cekaj).subscribe({ error: (x) => (e = x) });
    await tik();
    expect(poziva).toBe(1);
    expect(cekaj).not.toHaveBeenCalled();
    expect(e).toBeInstanceOf(GreskaSlanja);
    expect((e as GreskaSlanja).message).toBe('Slika Slika A nije poslata: Dozvoljene su samo slike.');
  });
});

describe('greskaUvozaSlajdova', () => {
  it('400 `Slajd 2: Loše.` -> oznaka(2): Loše.', () => {
    const e = greskaUvozaSlajdova(greska(400, 'Slajd 2: Loše.'), (n) => `Strana ${n + 4}`);
    expect(e).toBeInstanceOf(GreskaSlanja);
    expect(e.message).toBe('Strana 6: Loše.');
    expect(e.nepoznatIshod).toBe(false);
  });

  it('oznaka koja vrati null -> poruka servera bez preslikavanja', () => {
    expect(greskaUvozaSlajdova(greska(400, 'Slajd 9: Loše.'), () => null).message).toBe('Slajd 9: Loše.');
  });

  it('status 0 -> nepoznatIshod', () => {
    const e = greskaUvozaSlajdova(greska(0), () => null);
    expect(e.nepoznatIshod).toBe(true);
  });
});

describe('sha256', () => {
  it('hex SHA-256 poznatog ulaza', async () => {
    expect(await sha256(new TextEncoder().encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
