import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { EMPTY, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BankaApi } from '../data-access/banka.api';
import { PreambulaInfo, RenderujSveInfo } from '../data-access/banka.models';
import { MAX_KRUGOVA_RENDERA, PreambulaDialog } from './preambula-dialog';

const PODRAZUMEVANA = '\\usepackage[T1]{fontenc}\n\\usepackage{amsmath}';
const info = (preambula: string | null): PreambulaInfo => ({ preambula, podrazumevana: preambula === null, podrazumevanaPreambula: PODRAZUMEVANA });

describe('PreambulaDialog', () => {
  let f: ComponentFixture<PreambulaDialog>;
  const ref = { close: vi.fn(), keydownEvents: () => EMPTY };
  const api = { preambula: vi.fn(), postaviPreambulu: vi.fn(), renderujSve: vi.fn() };

  beforeEach(() => {
    ref.close.mockReset();
    for (const fn of Object.values(api)) {
      fn.mockReset();
    }
    api.preambula.mockReturnValue(of(info(null)));
    api.postaviPreambulu.mockImplementation((_id: number, tekst: string | null) => of(info(tekst)));
    api.renderujSve.mockReturnValue(of({ renderovano: 0, neuspelo: 0, preostalo: 0 }));
  });

  async function napravi(): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { predmetId: 7, predmet: 'Statika' } },
        { provide: MatDialogRef, useValue: ref },
        { provide: BankaApi, useValue: api },
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    });
    f = TestBed.createComponent(PreambulaDialog);
    await f.whenStable();
    return f.nativeElement as HTMLElement;
  }

  const polje = (el: HTMLElement) => el.querySelector<HTMLTextAreaElement>('textarea')!;
  async function unesi(el: HTMLElement, tekst: string): Promise<void> {
    polje(el).value = tekst;
    polje(el).dispatchEvent(new Event('input'));
    await f.whenStable();
  }
  async function sacuvaj(el: HTMLElement): Promise<void> {
    el.querySelector<HTMLButtonElement>('[data-sacuvaj]')!.click();
    await f.whenStable();
  }

  it('učitava preambulu predmeta (tiho); podrazumevana je upisana u polje i označena', async () => {
    const el = await napravi();
    expect(api.preambula).toHaveBeenCalledWith(7, { tiho: true });
    expect(polje(el).value).toBe(PODRAZUMEVANA);
    expect(el.textContent).toContain('podrazumevanu preambulu');
    expect(el.textContent).toContain('\\usepackage');
    expect(el.textContent).toContain('\\write18');
  });

  it('nepromenjena podrazumevana šalje null (ostaje podrazumevana), pa renderuje sve i zatvara sa zbirom', async () => {
    const koraci: RenderujSveInfo[] = [
      { renderovano: 10, neuspelo: 0, preostalo: 15 }, { renderovano: 10, neuspelo: 0, preostalo: 5 }, { renderovano: 5, neuspelo: 0, preostalo: 0 },
    ];
    api.renderujSve.mockImplementation(() => of(koraci.shift()));
    const el = await napravi();
    await sacuvaj(el);

    expect(api.postaviPreambulu).toHaveBeenCalledExactlyOnceWith(7, null, { tiho: true });
    expect(api.renderujSve).toHaveBeenCalledTimes(3);
    expect(api.renderujSve).toHaveBeenCalledWith(7, { tiho: true });
    expect(ref.close).toHaveBeenCalledExactlyOnceWith({ renderovano: 25, neuspelo: 0, preostalo: 0 });
  });

  it('izmenjen tekst se šalje kakav jeste; prazno polje vraća podrazumevanu (null)', async () => {
    const el = await napravi();
    await unesi(el, '\\usepackage{tikz}');
    await sacuvaj(el);
    expect(api.postaviPreambulu).toHaveBeenLastCalledWith(7, '\\usepackage{tikz}', { tiho: true });

    ref.close.mockReset();
    TestBed.resetTestingModule();
    const drugi = await napravi();
    await unesi(drugi, '   ');
    await sacuvaj(drugi);
    expect(api.postaviPreambulu).toHaveBeenLastCalledWith(7, null, { tiho: true });
  });

  it(`najviše ${MAX_KRUGOVA_RENDERA} krugova renderovanja: posle toga prikazuje napredak i nudi nastavak`, async () => {
    api.renderujSve.mockReturnValue(of({ renderovano: 3, neuspelo: 0, preostalo: 40 }));
    const el = await napravi();
    await sacuvaj(el);

    expect(api.renderujSve).toHaveBeenCalledTimes(MAX_KRUGOVA_RENDERA);
    expect(ref.close).not.toHaveBeenCalled();
    expect(el.querySelector('[role=status]')!.textContent).toContain('Renderovano 30, preostalo 40');
    const nastavi = el.querySelector<HTMLButtonElement>('[data-nastavi]')!;
    api.renderujSve.mockReturnValue(of({ renderovano: 40, neuspelo: 0, preostalo: 0 }));
    nastavi.click();
    await f.whenStable();
    expect(ref.close).toHaveBeenCalledExactlyOnceWith({ renderovano: 70, neuspelo: 0, preostalo: 0 });
  });

  it('greška pri čuvanju: razlog servera u traci, dijalog ostaje, render se ne pokreće', async () => {
    api.postaviPreambulu.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 400, error: { reason: 'Komanda \\input nije dozvoljena u preambuli.' } })));
    const el = await napravi();
    await unesi(el, '\\input{x}');
    await sacuvaj(el);

    expect(el.querySelector('[role=alert]')!.textContent).toContain('Komanda \\input nije dozvoljena u preambuli.');
    expect(api.renderujSve).not.toHaveBeenCalled();
    expect(ref.close).not.toHaveBeenCalled();
    expect(el.querySelector<HTMLButtonElement>('[data-sacuvaj]')!.disabled).toBe(false);
  });

  it('greška renderovanja posle čuvanja: poruka, napredak ostaje i može se nastaviti', async () => {
    api.renderujSve.mockReturnValueOnce(of({ renderovano: 10, neuspelo: 0, preostalo: 2 }))
      .mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 503, error: { reason: 'Render servis nije dostupan.' } })));
    const el = await napravi();
    await sacuvaj(el);

    expect(el.querySelector('[role=alert]')!.textContent).toContain('Render servis nije dostupan.');
    expect(el.querySelector('[role=status]')!.textContent).toContain('Renderovano 10, preostalo 2');
    expect(el.querySelector('[data-nastavi]')).not.toBeNull();
    el.querySelector<HTMLButtonElement>('[data-zatvori]')!.click();
    expect(ref.close).toHaveBeenCalledExactlyOnceWith({ renderovano: 10, neuspelo: 0, preostalo: 2 });
  });

  it('neuspeli renderi se sabiraju kroz krugove: dijalog ostaje otvoren sa upozorenjem, bez "Nastavi renderovanje"', async () => {
    api.renderujSve.mockReturnValueOnce(of({ renderovano: 2, neuspelo: 8, preostalo: 5 }))
      .mockReturnValueOnce(of({ renderovano: 1, neuspelo: 4, preostalo: 0 }));
    const el = await napravi();
    await unesi(el, '\\usepackage{tikz}\n\\foo');
    await sacuvaj(el);

    expect(api.renderujSve).toHaveBeenCalledTimes(2);
    expect(ref.close).not.toHaveBeenCalled();
    const upozorenje = el.querySelector('[data-neuspelo]')!;
    expect(upozorenje.getAttribute('role')).toBe('alert');
    expect(upozorenje.textContent!.replace(/\s+/g, ' ').trim()).toBe('12 varijanti nije renderovano (greška u preambuli?). Status varijanti je '
      + 'sačuvan, pregled na telefonu koristi poslednji uspeo render dok se ne ispravi.');
    expect(el.querySelector('[role=status]')!.textContent).toContain('Renderovano 3, preostalo 0');
    // ponovni krug bi isti neuspeh brojao još jednom: ispravka ide kroz Sačuvaj
    expect(el.querySelector('[data-nastavi]')).toBeNull();
    el.querySelector<HTMLButtonElement>('[data-zatvori]')!.click();
    expect(ref.close).toHaveBeenCalledExactlyOnceWith({ renderovano: 3, neuspelo: 12, preostalo: 0 });
  });

  it('jedna neuspela varijanta: jednina u upozorenju', async () => {
    api.renderujSve.mockReturnValue(of({ renderovano: 3, neuspelo: 1, preostalo: 0 }));
    const el = await napravi();
    await sacuvaj(el);
    expect(el.querySelector('[data-neuspelo]')!.textContent).toContain('1 varijanta nije renderovana (greška u preambuli?)');
  });

  it('posle čuvanja: Sačuvaj čeka novu izmenu teksta; ispravljena preambula se čuva ponovo i brojanje kreće iz početka', async () => {
    api.renderujSve.mockReturnValueOnce(of({ renderovano: 0, neuspelo: 4, preostalo: 0 }))
      .mockReturnValueOnce(of({ renderovano: 4, neuspelo: 0, preostalo: 0 }));
    const el = await napravi();
    await unesi(el, '\\foo');
    await sacuvaj(el);
    const dugme = el.querySelector<HTMLButtonElement>('[data-sacuvaj]')!;
    expect(dugme.disabled).toBe(true);
    expect(polje(el).readOnly).toBe(false);

    await unesi(el, '\\usepackage{tikz}');
    expect(dugme.disabled).toBe(false);
    await sacuvaj(el);
    expect(api.postaviPreambulu).toHaveBeenLastCalledWith(7, '\\usepackage{tikz}', { tiho: true });
    expect(ref.close).toHaveBeenCalledExactlyOnceWith({ renderovano: 4, neuspelo: 0, preostalo: 0 });
  });

  it('učitavanje nije uspelo: poruka i ponovni pokušaj', async () => {
    api.preambula.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 404, error: { reason: 'Predmet nije pronađen.' } })));
    const el = await napravi();
    expect(el.querySelector('[role=alert]')!.textContent).toContain('Predmet nije pronađen.');
    expect(el.querySelector('textarea')).toBeNull();
    el.querySelector<HTMLButtonElement>('[data-ponovo]')!.click();
    await f.whenStable();
    expect(polje(el).value).toBe(PODRAZUMEVANA);
  });

  it('"Vrati podrazumevanu" upisuje podrazumevanu u polje', async () => {
    api.preambula.mockReturnValue(of(info('\\usepackage{tikz}')));
    const el = await napravi();
    expect(polje(el).value).toBe('\\usepackage{tikz}');
    el.querySelector<HTMLButtonElement>('[data-podrazumevana]')!.click();
    await f.whenStable();
    expect(polje(el).value).toBe(PODRAZUMEVANA);
  });
});
