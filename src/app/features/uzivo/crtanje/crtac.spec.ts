import { HttpErrorResponse } from '@angular/common/http';
import { Subject, of, throwError } from 'rxjs';
import { ElementCrteza, KljucStrane, StranaCrteza } from './crtanje.models';
import { Crtac, PONOVI_UCITAVANJE_MS } from './crtac';
import { LazniKanal, prisluskuj } from './kanal.testing';
import { PULS_MS } from './kanal-crtanja';

const e = (x: number): ElementCrteza => ({ tip: 'LINIJA', boja: '#121A2A', debljina: 3, tacke: [x, 0, x + 10, 10] });
const S1: KljucStrane = { slajdId: 1, pozadina: 'SLAJD' };
const S2: KljucStrane = { slajdId: 2, pozadina: 'SLAJD' };
const KANAL = 'gfs-crtanje-7';

describe('Crtac (konzola crta)', () => {
  let ucitavanja: { k: KljucStrane; odgovor: Subject<StranaCrteza> }[];
  let upisi: { k: KljucStrane; elementi: readonly ElementCrteza[]; odgovor: Subject<{ verzija: number }> }[];
  let c: Crtac;
  let kanal: unknown[];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('BroadcastChannel', LazniKanal);
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => setTimeout(cb, 16));
    ucitavanja = [];
    upisi = [];
    kanal = prisluskuj(KANAL);
    c = new Crtac({
      ucitaj: k => { const odgovor = new Subject<StranaCrteza>(); ucitavanja.push({ k, odgovor }); return odgovor; },
      upisi: (k, elementi) => { const odgovor = new Subject<{ verzija: number }>(); upisi.push({ k, elementi, odgovor }); return odgovor; },
    }, KANAL);
  });
  afterEach(() => {
    c.unisti();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    LazniKanal.otvoreni = [];
  });

  const ucitano = (i: number, s: StranaCrteza) => { ucitavanja[i].odgovor.next(s); ucitavanja[i].odgovor.complete(); };
  const poslednjaStrana = () => kanal.filter((p): p is { tip: 'strana' } & Record<string, unknown> => (p as { tip: string }).tip === 'strana').at(-1);

  it('nova strana se učitava jednom; dok ne stigne, ne crta se', () => {
    c.postavi(S1, 3);
    c.postavi(S1, 3);
    expect(ucitavanja.length).toBe(1);
    expect(c.spremno()).toBe(false);
    c.dodaj(e(1));
    expect(upisi.length).toBe(0);
    ucitano(0, { elementi: [e(5)], verzija: 3 });
    expect(c.spremno()).toBe(true);
    expect(c.elementi()).toEqual([e(5)]);
    expect(poslednjaStrana()).toMatchObject({ kljuc: 'SLAJD:1', verzija: 3 });
  });

  it('potez: PUT cele strane i cela strana na kanal; poništi je takođe izmena', () => {
    c.postavi(S1, 0);
    ucitano(0, { elementi: [], verzija: 0 });
    c.dodaj(e(1));
    expect(upisi.length).toBe(1);
    expect(upisi[0].elementi).toEqual([e(1)]);
    expect(poslednjaStrana()).toMatchObject({ elementi: [e(1)], verzija: 0 });
    upisi[0].odgovor.next({ verzija: 1 });
    expect(poslednjaStrana()).toMatchObject({ elementi: [e(1)], verzija: 1 });
    c.ponisti();
    expect(c.elementi()).toEqual([]);
    expect(upisi[1].elementi).toEqual([]);
  });

  it('premali oblik se ne upisuje', () => {
    c.postavi(S1, 0);
    ucitano(0, { elementi: [], verzija: 0 });
    c.dodaj({ tip: 'PRAVOUGAONIK', boja: '#121A2A', debljina: 3, tacke: [0, 0, 1, 1] });
    expect(upisi.length).toBe(0);
  });

  it('veća verzija u snimku bez upisa ove konzole: strana se učitava ponovo (druga konzola je crtala)', () => {
    c.postavi(S1, 2);
    ucitano(0, { elementi: [e(1)], verzija: 2 });
    c.postavi(S1, 2);
    expect(ucitavanja.length).toBe(1);
    c.postavi(S1, 5);
    expect(ucitavanja.length).toBe(2);
    ucitano(1, { elementi: [e(1), e(9)], verzija: 5 });
    expect(c.elementi()).toEqual([e(1), e(9)]);
  });

  it('dok je upis na putu, verzija iz snimka se ne preuzima (nema vraćanja unazad)', () => {
    c.postavi(S1, 0);
    ucitano(0, { elementi: [], verzija: 0 });
    c.dodaj(e(1));
    c.postavi(S1, 1);
    expect(ucitavanja.length).toBe(1);
    upisi[0].odgovor.next({ verzija: 1 });
    c.postavi(S1, 1);
    expect(ucitavanja.length).toBe(1);
  });

  it('učitavanje koje je krenulo pre izmene se odbacuje', () => {
    c.postavi(S1, 1);
    ucitano(0, { elementi: [e(1)], verzija: 1 });
    c.postavi(S1, 2);
    c.dodaj(e(2));
    upisi[0].odgovor.next({ verzija: 3 });
    ucitano(1, { elementi: [e(7)], verzija: 2 });
    expect(c.elementi()).toEqual([e(1), e(2)]);
  });

  it('promena strane: svoja istorija po strani, povratak na stranu je odmah tu (bez novog zahteva)', () => {
    c.postavi(S1, 0);
    ucitano(0, { elementi: [], verzija: 0 });
    c.dodaj(e(1));
    c.postavi(S2, 0);
    expect(c.mozePonisti()).toBe(false);
    ucitano(1, { elementi: [], verzija: 0 });
    c.postavi(S1, 0);
    expect(ucitavanja.length).toBe(2);
    expect(c.elementi()).toEqual([e(1)]);
    expect(c.mozePonisti()).toBe(true);
    expect(poslednjaStrana()).toMatchObject({ kljuc: 'SLAJD:1' });
  });

  it('greška učitavanja: ponovo posle pauze, dok je strana još trenutna', () => {
    const c2 = new Crtac({
      ucitaj: vi.fn().mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 500 }))).mockReturnValue(of({ elementi: [e(4)], verzija: 1 })),
      upisi: () => of({ verzija: 1 }),
    }, 'gfs-crtanje-8');
    c2.postavi(S1, 1);
    expect(c2.spremno()).toBe(false);
    vi.advanceTimersByTime(PONOVI_UCITAVANJE_MS);
    expect(c2.elementi()).toEqual([e(4)]);
    c2.unisti();
  });

  it('kanal: puls na 2 s, element u nastajanju najviše jednom po kadru, odgovor na "trazi"', () => {
    c.postavi(S1, 0);
    ucitano(0, { elementi: [e(1)], verzija: 0 });
    const pulsevi = () => kanal.filter(p => (p as { tip: string }).tip === 'puls').length;
    const pre = pulsevi();
    vi.advanceTimersByTime(PULS_MS * 2);
    expect(pulsevi()).toBe(pre + 2);

    c.uTokuJe({ ...e(2), tacke: [0, 0, 1, 1] });
    c.uTokuJe({ ...e(2), tacke: [0, 0, 2, 2] });
    c.uTokuJe({ ...e(2), tacke: [0, 0, 3, 3] });
    const uToku = () => kanal.filter(p => (p as { tip: string }).tip === 'uToku');
    expect(uToku().length).toBe(0);
    vi.advanceTimersByTime(16);
    expect(uToku()).toEqual([{ tip: 'uToku', kljuc: 'SLAJD:1', element: { ...e(2), tacke: [0, 0, 3, 3] } }]);

    kanal.length = 0;
    new LazniKanal(KANAL).postMessage({ tip: 'trazi' });
    expect(kanal.map(p => (p as { tip: string }).tip)).toEqual(['trazi', 'puls', 'strana', 'alati', 'uToku']);
  });

  it('alati: promena ide na kanal; publika ih vidi samo kad je crtanje uključeno i oko upaljeno', () => {
    c.ukljuci(true);
    expect(c.alatiZaPubliku()).toBeNull();
    c.prebaciPublikaVidi();
    c.izaberiAlat('STRELICA');
    expect(c.alatiZaPubliku()).toEqual({ ukljuceno: true, alat: 'STRELICA', boja: '#C62828', publikaVidi: true });
    expect(kanal.at(-1)).toEqual({ tip: 'alati', ukljuceno: true, alat: 'STRELICA', boja: '#C62828', publikaVidi: true });
    c.unisti();
    expect(kanal.at(-1)).toMatchObject({ tip: 'alati', ukljuceno: false });
  });
});
