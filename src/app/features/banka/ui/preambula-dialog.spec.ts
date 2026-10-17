import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { EMPTY, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BankaApi } from '../data-access/banka.api';
import { PreambulaInfo, RenderujSveInfo } from '../data-access/banka.models';
import { MAX_KRUGOVA_RENDERA, PreambulaDialog } from './preambula-dialog';

const PODRAZUMEVANA = '\\documentclass{article}\n\\usepackage{amsmath}';
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
    api.renderujSve.mockReturnValue(of({ renderovano: 0, preostalo: 0 }));
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
    const koraci: RenderujSveInfo[] = [{ renderovano: 10, preostalo: 15 }, { renderovano: 10, preostalo: 5 }, { renderovano: 5, preostalo: 0 }];
    api.renderujSve.mockImplementation(() => of(koraci.shift()));
    const el = await napravi();
    await sacuvaj(el);

    expect(api.postaviPreambulu).toHaveBeenCalledExactlyOnceWith(7, null, { tiho: true });
    expect(api.renderujSve).toHaveBeenCalledTimes(3);
    expect(api.renderujSve).toHaveBeenCalledWith(7, { tiho: true });
    expect(ref.close).toHaveBeenCalledExactlyOnceWith({ renderovano: 25, preostalo: 0 });
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
    api.renderujSve.mockReturnValue(of({ renderovano: 3, preostalo: 40 }));
    const el = await napravi();
    await sacuvaj(el);

    expect(api.renderujSve).toHaveBeenCalledTimes(MAX_KRUGOVA_RENDERA);
    expect(ref.close).not.toHaveBeenCalled();
    expect(el.querySelector('[role=status]')!.textContent).toContain('Renderovano 30, preostalo 40');
    const nastavi = el.querySelector<HTMLButtonElement>('[data-nastavi]')!;
    api.renderujSve.mockReturnValue(of({ renderovano: 40, preostalo: 0 }));
    nastavi.click();
    await f.whenStable();
    expect(ref.close).toHaveBeenCalledExactlyOnceWith({ renderovano: 70, preostalo: 0 });
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
    api.renderujSve.mockReturnValueOnce(of({ renderovano: 10, preostalo: 2 }))
      .mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 503, error: { reason: 'Render servis nije dostupan.' } })));
    const el = await napravi();
    await sacuvaj(el);

    expect(el.querySelector('[role=alert]')!.textContent).toContain('Sistemska greška');
    expect(el.querySelector('[role=status]')!.textContent).toContain('Renderovano 10, preostalo 2');
    expect(el.querySelector('[data-nastavi]')).not.toBeNull();
    el.querySelector<HTMLButtonElement>('[data-zatvori]')!.click();
    expect(ref.close).toHaveBeenCalledExactlyOnceWith({ renderovano: 10, preostalo: 2 });
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
