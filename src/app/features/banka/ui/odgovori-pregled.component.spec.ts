import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { OdgovorPolja, Polje } from '../data-access/banka.models';
import { OdgovoriPregledComponent, tacanOdgovor } from './odgovori-pregled.component';

function polje(kljuc: string, tip: Polje['tip'], izmena: Partial<Polje> = {}): Polje {
  return {
    kljuc, oznaka: `Polje ${kljuc}`, tip, odstupanje: null, odstupanjeTip: null, jedinica: null, zanemariVelicinu: null,
    zanemariRazmake: null, opcije: null, ...izmena,
  };
}

const odgovor = (o: Partial<OdgovorPolja>): OdgovorPolja => ({ broj: null, prihvatljivi: null, tacna: null, tacne: null, ...o });

const OPCIJE = [{ id: 1, tekst: '4' }, { id: 2, tekst: '8' }, { id: 3, tekst: '$12$' }];

describe('tacanOdgovor', () => {
  it('BROJ: decimalni zarez, odstupanje apsolutno ili u procentima, jedinica', () => {
    expect(tacanOdgovor(polje('a', 'BROJ', { odstupanje: 0.1, odstupanjeTip: 'APSOLUTNO' }), odgovor({ broj: 45 }))).toEqual(['45 ± 0,1']);
    expect(tacanOdgovor(polje('a', 'BROJ', { odstupanje: 10, odstupanjeTip: 'PROCENAT', jedinica: 'kN' }), odgovor({ broj: 45 })))
      .toEqual(['45 kN ± 10 %']);
    expect(tacanOdgovor(polje('a', 'BROJ', { odstupanje: 0.01, odstupanjeTip: 'APSOLUTNO', jedinica: 'm' }), odgovor({ broj: 2.5 })))
      .toEqual(['2,5 ± 0,01 m']);
    expect(tacanOdgovor(polje('a', 'BROJ', { odstupanje: 0, odstupanjeTip: 'APSOLUTNO', jedinica: 'kN' }), odgovor({ broj: -3 }))).toEqual(['-3 kN']);
    expect(tacanOdgovor(polje('a', 'BROJ'), odgovor({ broj: 11 }))).toEqual(['11']);
  });

  it('TEKST: svi prihvatljivi redom', () => {
    expect(tacanOdgovor(polje('a', 'TEKST'), odgovor({ prihvatljivi: ['1111', '001111'] }))).toEqual(['1111', '001111']);
  });

  it('JEDAN_TACAN: tekst izabrane opcije', () => {
    expect(tacanOdgovor(polje('b', 'JEDAN_TACAN', { opcije: OPCIJE }), odgovor({ tacna: 2 }))).toEqual(['8']);
  });

  it('VISE_TACNIH: tekstovi opcija redom polja', () => {
    expect(tacanOdgovor(polje('c', 'VISE_TACNIH', { opcije: OPCIJE }), odgovor({ tacne: [3, 1] }))).toEqual(['4', '$12$']);
  });

  it('nema odgovora ili pokazuje na nepostojeću opciju: prazno', () => {
    expect(tacanOdgovor(polje('a', 'BROJ'), undefined)).toEqual([]);
    expect(tacanOdgovor(polje('a', 'BROJ'), odgovor({ broj: Number.NaN }))).toEqual([]);
    expect(tacanOdgovor(polje('a', 'TEKST'), odgovor({ prihvatljivi: [] }))).toEqual([]);
    expect(tacanOdgovor(polje('b', 'JEDAN_TACAN', { opcije: OPCIJE }), odgovor({ tacna: 9 }))).toEqual([]);
    expect(tacanOdgovor(polje('c', 'VISE_TACNIH', { opcije: OPCIJE }), odgovor({ tacne: [9] }))).toEqual([]);
  });
});

describe('OdgovoriPregledComponent', () => {
  function napravi(polja: Polje[], odgovori: Record<string, OdgovorPolja>): HTMLElement {
    const f = TestBed.createComponent(OdgovoriPregledComponent);
    f.componentRef.setInput('polja', polja);
    f.componentRef.setInput('odgovori', odgovori);
    f.detectChanges();
    return f.nativeElement as HTMLElement;
  }

  /** `[oznaka, tip, tačno]` po redu polja. */
  const redovi = (el: HTMLElement) => [...el.querySelectorAll('[data-polje]')].map(r => [
    r.querySelector('.bk-op-oznaka')?.textContent?.trim(),
    r.querySelector('.bk-op-tip')?.textContent?.trim(),
    [...r.querySelectorAll('dd li')].map(li => li.textContent?.trim()).join(' | ') || r.querySelector('dd')?.textContent?.trim(),
  ]);

  it('sva četiri tipa: oznaka, tip i tačan odgovor', () => {
    const el = napravi([
      polje('a', 'BROJ', { oznaka: 'Sila', odstupanje: 10, odstupanjeTip: 'PROCENAT', jedinica: 'kN' }),
      polje('b', 'TEKST', { oznaka: 'Zapis' }),
      polje('c', 'JEDAN_TACAN', { oznaka: 'Broj cifara', opcije: OPCIJE }),
      polje('d', 'VISE_TACNIH', { oznaka: 'Parni', opcije: OPCIJE }),
    ], {
      a: odgovor({ broj: 45 }),
      b: odgovor({ prihvatljivi: ['1111', '001111'] }),
      c: odgovor({ tacna: 3 }),
      d: odgovor({ tacne: [1, 2] }),
    });

    expect(redovi(el)).toEqual([
      ['Sila', 'Broj', '45 kN ± 10 %'],
      ['Zapis', 'Tekst', '1111 | 001111'],
      ['Broj cifara', 'Jedan tačan', '$12$'],
      ['Parni', 'Više tačnih', '4 | 8'],
    ]);
  });

  it('polje bez odgovora: "nedostaje"', () => {
    const el = napravi([polje('a', 'BROJ', { oznaka: 'Vrednost' })], {});
    expect(redovi(el)).toEqual([['Vrednost', 'Broj', 'Nedostaje']]);
  });

  it('grupa bez polja: objašnjenje umesto liste', () => {
    const el = napravi([], {});
    expect(el.querySelector('dl')).toBeNull();
    expect(el.textContent).toContain('Grupa nema polja odgovora');
  });
});
