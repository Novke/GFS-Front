import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { IzvodjenjeNaPredavanju, PrezentacijePredavanjaApi } from '../../../core/api/prezentacije-predavanja.api';
import { PrezentacijePredavanjaStore } from './prezentacije-predavanja.store';

const izv = (id: number, status: 'AKTIVNO' | 'ZAVRSENO'): IzvodjenjeNaPredavanju => ({
  id, prezentacija: { id: 1, naziv: 'Konverzije' }, status, pocetak: '2026-10-27T10:00:00', kraj: null, brojUcesnika: 0, brojPitanja: 0, cuvanje: true,
});

function postavi(izvodjenja: (id: number) => unknown) {
  TestBed.configureTestingModule({
    providers: [PrezentacijePredavanjaStore, { provide: PrezentacijePredavanjaApi, useValue: { izvodjenja: vi.fn(izvodjenja) } }],
  });
  return TestBed.inject(PrezentacijePredavanjaStore);
}

describe('PrezentacijePredavanjaStore', () => {
  it('učitava listu i izdvaja izvođenja u toku', () => {
    const s = postavi(() => of([izv(2, 'AKTIVNO'), izv(1, 'ZAVRSENO')]));
    s.ucitaj(40);
    expect(s.ucitano()).toBe(true);
    expect(s.izvodjenja().map(i => i.id)).toEqual([2, 1]);
    expect(s.uToku().map(i => i.id)).toEqual([2]);
    expect(s.greska()).toBeNull();
  });

  it('greška daje razlog servera i čuva staru listu pri osvežavanju', () => {
    let poziv = 0;
    const s = postavi(() => (++poziv === 1 ? of([izv(1, 'ZAVRSENO')]) : throwError(() => new HttpErrorResponse({ status: 409, error: { reason: 'Nešto.', time: 't' } }))));
    s.ucitaj(40);
    s.ucitaj(40);
    expect(s.greska()).toBe('Nešto.');
    expect(s.izvodjenja().map(i => i.id)).toEqual([1]);
  });

  it('spor odgovor starog poziva ne prepisuje noviji (ni listu drugog predavanja)', () => {
    const prvi = new Subject<IzvodjenjeNaPredavanju[]>();
    const drugi = new Subject<IzvodjenjeNaPredavanju[]>();
    const odgovori = [prvi, drugi];
    const s = postavi(() => odgovori.shift());
    s.ucitaj(40);
    s.resetuj();
    s.ucitaj(41);
    drugi.next([izv(9, 'AKTIVNO')]);
    prvi.next([izv(1, 'ZAVRSENO')]);
    expect(s.izvodjenja().map(i => i.id)).toEqual([9]);
  });

  it('resetuj briše listu i stanje učitanosti', () => {
    const s = postavi(() => of([izv(1, 'ZAVRSENO')]));
    s.ucitaj(40);
    s.resetuj();
    expect(s.izvodjenja()).toEqual([]);
    expect(s.ucitano()).toBe(false);
  });
});
