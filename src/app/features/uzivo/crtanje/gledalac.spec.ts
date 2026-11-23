import { Subject } from 'rxjs';
import { ElementCrteza, KljucStrane, StranaCrteza } from './crtanje.models';
import { Gledalac } from './gledalac';
import { LazniKanal } from './kanal.testing';
import { PULS_ISTEKAO_MS } from './kanal-crtanja';

const e = (x: number): ElementCrteza => ({ tip: 'LINIJA', boja: '#121A2A', debljina: 3, tacke: [x, 0, x + 10, 10] });
const S1: KljucStrane = { slajdId: 1, pozadina: 'SLAJD' };
const B1: KljucStrane = { slajdId: 1, pozadina: 'BELA' };
const KANAL = 'gfs-crtanje-7';

describe('Gledalac (publika: kanal ili server)', () => {
  let zahtevi: { k: KljucStrane; posle: number; odgovor: Subject<StranaCrteza | null> }[];
  let g: Gledalac;
  let konzola: LazniKanal;
  let primljeno: unknown[];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('BroadcastChannel', LazniKanal);
    zahtevi = [];
    konzola = new LazniKanal(KANAL);
    primljeno = [];
    konzola.addEventListener('message', m => primljeno.push(m.data));
    g = new Gledalac({ ucitaj: (k, posle) => { const odgovor = new Subject<StranaCrteza | null>(); zahtevi.push({ k, posle, odgovor }); return odgovor; } }, KANAL);
  });
  afterEach(() => {
    g.unisti();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    LazniKanal.otvoreni = [];
  });

  it('pri otvaranju traži trenutnu stranu od konzole', () => {
    expect(primljeno).toEqual([{ tip: 'trazi' }]);
  });

  it('bez pulsa: strana sa servera kad je verzija veća od poznate; strana bez verzije se ne traži', () => {
    g.postavi(S1, 0);
    expect(zahtevi.length).toBe(0);
    expect(g.elementi()).toEqual([]);
    g.postavi(S1, 2);
    expect(zahtevi.length).toBe(1);
    zahtevi[0].odgovor.next({ elementi: [e(1)], verzija: 2 });
    expect(g.elementi()).toEqual([e(1)]);
    g.postavi(S1, 2);
    expect(zahtevi.length).toBe(1);
  });

  it('sa pulsom: samo kanal; odgovor servera koji stigne posle pulsa se odbacuje', () => {
    g.postavi(S1, 3);
    expect(zahtevi.length).toBe(1);
    konzola.postMessage({ tip: 'puls' });
    konzola.postMessage({ tip: 'strana', kljuc: 'SLAJD:1', elementi: [e(1), e(2)], verzija: 3 });
    zahtevi[0].odgovor.next({ elementi: [e(1)], verzija: 3 });
    expect(g.elementi()).toEqual([e(1), e(2)]);
    // novi snimak sa većom verzijom: i dalje kanal (PUT konzole je na putu), bez zahteva
    g.postavi(S1, 4);
    expect(zahtevi.length).toBe(1);
  });

  it('puls istekne posle 5 s: server, ali samo ako je verzija veća od one iz kanala', () => {
    konzola.postMessage({ tip: 'strana', kljuc: 'SLAJD:1', elementi: [e(1)], verzija: 4 });
    g.postavi(S1, 4);
    vi.advanceTimersByTime(PULS_ISTEKAO_MS);
    expect(g.kanalZiv()).toBe(false);
    expect(zahtevi.length).toBe(0);
    g.postavi(S1, 5);
    expect(zahtevi.length).toBe(1);
  });

  it('nikad unazad: odgovor servera sa manjom verzijom od poznate se odbacuje', () => {
    g.postavi(S1, 6);
    konzola.postMessage({ tip: 'strana', kljuc: 'SLAJD:1', elementi: [e(1), e(2)], verzija: 6 });
    vi.advanceTimersByTime(PULS_ISTEKAO_MS);
    g.osvezi();
    const z = zahtevi.at(-1)!;
    z.odgovor.next({ elementi: [e(1)], verzija: 5 });
    expect(g.elementi()).toEqual([e(1), e(2)]);
  });

  it('element u nastajanju samo za trenutnu stranu; nova strana bez poruke -> "trazi"', () => {
    g.postavi(S1, 0);
    konzola.postMessage({ tip: 'puls' });
    konzola.postMessage({ tip: 'uToku', kljuc: 'SLAJD:1', element: e(3) });
    expect(g.uToku()).toEqual(e(3));
    primljeno.length = 0;
    g.postavi(B1, 0);
    expect(g.uToku()).toBeNull();
    expect(primljeno).toEqual([{ tip: 'trazi' }]);
  });

  it('alati: samo dok konzola crta, nastavnik je uključio oko i puls je živ', () => {
    konzola.postMessage({ tip: 'alati', ukljuceno: true, alat: 'KRUG', boja: '#2456A6', publikaVidi: false });
    expect(g.alati()).toBeNull();
    konzola.postMessage({ tip: 'alati', ukljuceno: true, alat: 'KRUG', boja: '#2456A6', publikaVidi: true });
    expect(g.alati()).toEqual({ ukljuceno: true, alat: 'KRUG', boja: '#2456A6', publikaVidi: true });
    vi.advanceTimersByTime(PULS_ISTEKAO_MS);
    expect(g.alati()).toBeNull();
  });

  it('osvezi (povezivanje, povratak iz sna, tabla na 3 s) šalje poznatu verziju kao "posle"; null = bez promene', () => {
    g.postavi(S1, 2);
    zahtevi[0].odgovor.next({ elementi: [e(1)], verzija: 2 });
    g.osvezi();
    expect(zahtevi[1].posle).toBe(2);
    zahtevi[1].odgovor.next(null);
    expect(g.elementi()).toEqual([e(1)]);
  });
});
