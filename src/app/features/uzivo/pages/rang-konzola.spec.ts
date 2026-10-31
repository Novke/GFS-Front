import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RangApi, RangTacnostiStavka } from '../../../core/api/rang.api';
import { stanje } from '../data-access/izvodjenje-podaci.testing';
import { NastavnickoStanje } from '../data-access/uzivo.models';
import { RangNaTabli } from '../data-access/rang-na-tabli';
import { RANG_OSVEZAVANJE_MS, RangKonzolaComponent } from './rang-konzola.component';

const red = (mesto: number, ime: string): RangTacnostiStavka => ({
  mesto, ucesnikId: mesto, studentId: null, ime, gost: false, tacnih: 1, dugovanih: 2, odgovorenih: 2, procenat: 50,
  prosekMs: 2500, zvezdice: 1, poeni: null, izvodjenja: 2, casova: null,
});

describe('RangKonzolaComponent', () => {
  let izvodjenje: ReturnType<typeof vi.fn>;
  let predavanje: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    izvodjenje = vi.fn(() => of([red(1, 'Ana')]));
    predavanje = vi.fn(() => of({ predavanjeId: 9, izvodjenja: [], rang: [red(1, 'Bojan')] }));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: RangApi, useValue: { izvodjenje, predavanje } },
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    });
  });

  afterEach(() => vi.useRealTimers());

  function napravi(s: NastavnickoStanje) {
    const f = TestBed.createComponent(RangKonzolaComponent);
    f.componentRef.setInput('stanje', s);
    f.detectChanges();
    return f;
  }

  /** Klik na tab: MatTabGroup javlja izbor posle mikrozadatka, pa se on pusti pre provere. */
  async function izaberiTab(f: ReturnType<typeof napravi>, i: number) {
    ((f.nativeElement as HTMLElement).querySelectorAll('[role="tab"]')[i] as HTMLElement).click();
    f.detectChanges();
    await vi.advanceTimersByTimeAsync(0);
    f.detectChanges();
  }

  const tabovi = (el: HTMLElement) => Array.from(el.querySelectorAll('[role="tab"]')).map(t => t.textContent?.trim());

  it('bez predavanja nema taba "Predavanje"; "Ovo pitanje" ne zove server', () => {
    const f = napravi(stanje());
    expect(tabovi(f.nativeElement)).toEqual(['Ovo pitanje', 'Prezentacija']);
    vi.advanceTimersByTime(RANG_OSVEZAVANJE_MS);
    expect(izvodjenje).not.toHaveBeenCalled();
  });

  it('tab Prezentacija učitava rang izvođenja, Predavanje rang predavanja; novi odgovori osvežavaju najviše jednom u 2 s', async () => {
    const s = stanje();
    const saPredavanjem: NastavnickoStanje = { ...s, izvodjenje: { ...s.izvodjenje, predavanje: { id: 9, rb: 4, datum: '2026-10-28', tema: 'Sile' } } };
    const f = napravi(saPredavanjem);
    const el = f.nativeElement as HTMLElement;
    expect(tabovi(el)).toEqual(['Ovo pitanje', 'Prezentacija', 'Predavanje']);

    await izaberiTab(f, 1);
    expect(izvodjenje).toHaveBeenCalledTimes(1);
    expect(izvodjenje).toHaveBeenCalledWith(saPredavanjem.izvodjenje.id);
    f.detectChanges();
    expect(el.querySelector('[data-rang="prezentacija"]')?.textContent).toContain('Ana');

    // dva nova odgovora odmah: jedan zahtev posle isteka prozora
    f.componentRef.setInput('stanje', { ...saPredavanjem, brojOdgovora: 1 });
    f.detectChanges();
    f.componentRef.setInput('stanje', { ...saPredavanjem, brojOdgovora: 2 });
    f.detectChanges();
    expect(izvodjenje).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(RANG_OSVEZAVANJE_MS);
    expect(izvodjenje).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(RANG_OSVEZAVANJE_MS);
    await izaberiTab(f, 2);
    expect(predavanje).toHaveBeenCalledWith(9);
    f.detectChanges();
    expect(el.querySelector('[data-rang="predavanje"]')?.textContent).toContain('Bojan');
  });

  describe('"Na tabli" (koliko redova ranga ide na projektor)', () => {
    beforeEach(() => localStorage.clear());

    it('šalje RANG_BROJ kad se postavka razlikuje od servera, jednom po verziji; stari backend (bez rangBroj) ništa', async () => {
      TestBed.inject(RangNaTabli).postavi(5);
      const f = napravi({ ...stanje(), rangBroj: null });
      const poslato: number[] = [];
      f.componentInstance.rangBroj.subscribe(b => poslato.push(b));
      f.componentRef.setInput('stanje', { ...stanje(), rangBroj: null, verzija: 2 });
      f.detectChanges();
      f.componentRef.setInput('stanje', { ...stanje(), rangBroj: null, verzija: 2, brojOdgovora: 1 });
      f.detectChanges();
      expect(poslato).toEqual([5]);
      f.componentRef.setInput('stanje', { ...stanje(), rangBroj: 5, verzija: 3 });
      f.detectChanges();
      expect(poslato).toEqual([5]);

      await izaberiTab(f, 1);
      const dugmad = [...(f.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.uz-kon-rang-tabla button')];
      expect(dugmad.map(b => b.textContent!.trim())).toEqual(['Svi', 'Prvih 10', 'Prvih 5']);
      expect(dugmad[2].getAttribute('aria-pressed')).toBe('true');
      dugmad[0].click();
      f.detectChanges();
      expect(poslato).toEqual([5, 0]);
      expect(TestBed.inject(RangNaTabli).broj()).toBe(0);

      const stari = napravi(stanje());
      const staroPoslato: number[] = [];
      stari.componentInstance.rangBroj.subscribe(b => staroPoslato.push(b));
      TestBed.inject(RangNaTabli).postavi(10);
      stari.detectChanges();
      expect(staroPoslato).toEqual([]);
    });
  });
});
