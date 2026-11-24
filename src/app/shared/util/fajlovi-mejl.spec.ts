import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { DestroyRef } from '@angular/core';
import { Subject } from 'rxjs';
import { describe, expect, it } from 'vitest';

import type { FajlKratko, MejlFajlaOdgovor } from './fajlovi';
import { MejlFajlova, porukaGreskeMejla } from './fajlovi-mejl';

const F: FajlKratko = { id: 5, naziv: 'a.pdf', vrsta: 'PDF', velicina: 1 };

function napravi(prijavaNa401 = false) {
  const odgovor = new Subject<MejlFajlaOdgovor>();
  let poziva = 0;
  const m = TestBed.runInInjectionContext(
    () => new MejlFajlova(() => { poziva++; return odgovor; }, TestBed.inject(DestroyRef), prijavaNa401),
  );
  return { m, odgovor, poziva: () => poziva };
}

const greska = (status: number, reason?: string) =>
  new HttpErrorResponse({ status, error: reason === undefined ? null : { reason } });

describe('MejlFajlova', () => {
  it('šalje, pa „Poslato na ...”; dvostruki klik dok se šalje ne zove server', () => {
    const { m, odgovor, poziva } = napravi();
    m.posalji(F);
    m.posalji(F);
    expect(poziva()).toBe(1);
    expect(m.poruke()[5]).toEqual({ vrsta: 'salje', tekst: 'Šaljem…' });
    odgovor.next({ poslatoNa: 'n•••@gmail.com' });
    expect(m.poruke()[5]).toEqual({ vrsta: 'poslato', tekst: 'Poslato na n•••@gmail.com.' });
  });

  it('greška: reason servera doslovno (409, 429, 503)', () => {
    const { m, odgovor } = napravi();
    m.posalji(F);
    odgovor.error(greska(429, 'Već si poslao dosta fajlova. Pokušaj ponovo za sat.'));
    expect(m.poruke()[5]).toEqual({ vrsta: 'greska', tekst: 'Već si poslao dosta fajlova. Pokušaj ponovo za sat.' });
  });

  it('401 i 403 sa prijavaNa401: nema poruke, trebaPrijava; bez njega obična greška', () => {
    const a = napravi(true);
    a.m.posalji(F);
    a.odgovor.error(greska(401, 'Potrebna je prijava.'));
    expect(a.m.trebaPrijava()).toBe(true);
    expect(a.m.poruke()[5]).toBeUndefined();

    const b = napravi(false);
    b.m.posalji(F);
    b.odgovor.error(greska(401, 'Potrebna je prijava.'));
    expect(b.m.trebaPrijava()).toBe(false);
    expect(b.m.poruke()[5]?.tekst).toBe('Potrebna je prijava.');
  });

  it('porukaGreskeMejla: mreža i telo bez reason', () => {
    expect(porukaGreskeMejla(greska(0))).toBe('Nema veze sa serverom.');
    expect(porukaGreskeMejla(greska(500))).toBe('Slanje nije uspelo. Pokušaj ponovo.');
    expect(porukaGreskeMejla('x')).toBe('Slanje nije uspelo. Pokušaj ponovo.');
  });
});
