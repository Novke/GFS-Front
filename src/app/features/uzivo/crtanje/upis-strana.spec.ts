import { HttpErrorResponse } from '@angular/common/http';
import { Subject } from 'rxjs';
import { ElementCrteza, KljucStrane } from './crtanje.models';
import { PONOVI_UPIS_MS, UpisStrana } from './upis-strana';

const e = (x: number): ElementCrteza => ({ tip: 'LINIJA', boja: '#121A2A', debljina: 3, tacke: [x, 0, x + 10, 10] });
const S1: KljucStrane = { slajdId: 1, pozadina: 'SLAJD' };
const B1: KljucStrane = { slajdId: 1, pozadina: 'BELA' };

describe('UpisStrana (jedan po jedan, samo najnoviji)', () => {
  let zahtevi: { kljuc: KljucStrane; elementi: readonly ElementCrteza[]; odgovor: Subject<{ verzija: number }> }[];
  let uspesi: [string, number][];
  let upis: UpisStrana;

  beforeEach(() => {
    vi.useFakeTimers();
    zahtevi = [];
    uspesi = [];
    upis = new UpisStrana((kljuc, elementi) => {
      const odgovor = new Subject<{ verzija: number }>();
      zahtevi.push({ kljuc, elementi, odgovor });
      return odgovor;
    }, (k, v) => uspesi.push([k, v]));
  });
  afterEach(() => vi.useRealTimers());

  const odgovori = (i: number, verzija: number) => { zahtevi[i].odgovor.next({ verzija }); zahtevi[i].odgovor.complete(); };

  it('dok jedan traje, za stranu čeka samo najnoviji sadržaj; ostale strane posle, redom', () => {
    upis.posalji(S1, [e(1)]);
    upis.posalji(S1, [e(1), e(2)]);
    upis.posalji(B1, [e(9)]);
    upis.posalji(S1, [e(1), e(2), e(3)]);
    expect(zahtevi.length).toBe(1);
    expect(upis.imaUpis('SLAJD:1')).toBe(true);
    odgovori(0, 1);
    // B1 je sada prvi koji čeka (S1 je ponovo stao u red posle B1)
    expect(zahtevi.length).toBe(2);
    expect(zahtevi[1].kljuc).toEqual(B1);
    odgovori(1, 1);
    expect(zahtevi[2].elementi).toEqual([e(1), e(2), e(3)]);
    odgovori(2, 2);
    expect(zahtevi.length).toBe(3);
    expect(uspesi).toEqual([['SLAJD:1', 1], ['BELA:1', 1], ['SLAJD:1', 2]]);
    expect(upis.imaUpis('SLAJD:1')).toBe(false);
  });

  it('greška mreže: "nije sačuvano", pa isti sadržaj ponovo posle pauze; uspeh skida znak', () => {
    upis.posalji(S1, [e(1)]);
    zahtevi[0].odgovor.error(new HttpErrorResponse({ status: 0 }));
    expect(upis.nesacuvano()).toBe(true);
    expect(zahtevi.length).toBe(1);
    vi.advanceTimersByTime(PONOVI_UPIS_MS - 1);
    expect(zahtevi.length).toBe(1);
    vi.advanceTimersByTime(1);
    expect(zahtevi.length).toBe(2);
    expect(zahtevi[1].elementi).toEqual([e(1)]);
    odgovori(1, 4);
    expect(upis.nesacuvano()).toBe(false);
  });

  it('posle greške ide najnoviji sadržaj (stari se ne ponavlja)', () => {
    upis.posalji(S1, [e(1)]);
    upis.posalji(S1, [e(1), e(2)]);
    zahtevi[0].odgovor.error(new HttpErrorResponse({ status: 503 }));
    vi.advanceTimersByTime(PONOVI_UPIS_MS);
    expect(zahtevi.length).toBe(2);
    expect(zahtevi[1].elementi).toEqual([e(1), e(2)]);
  });

  it('400, 404 i 410 se ne ponavljaju, znak ostaje do sledećeg uspešnog upisa te strane', () => {
    upis.posalji(S1, [e(1)]);
    zahtevi[0].odgovor.error(new HttpErrorResponse({ status: 410 }));
    vi.advanceTimersByTime(PONOVI_UPIS_MS * 3);
    expect(zahtevi.length).toBe(1);
    expect(upis.nesacuvano()).toBe(true);
    upis.posalji(S1, [e(2)]);
    odgovori(1, 2);
    expect(upis.nesacuvano()).toBe(false);
  });
});
