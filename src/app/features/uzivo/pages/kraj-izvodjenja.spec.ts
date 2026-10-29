import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { IzborPrezentacija, PrezentacijaZaIzbor, PrezentacijePredavanjaApi } from '../../../core/api/prezentacije-predavanja.api';
import { IzvodjenjaApi } from '../data-access/izvodjenja.api';
import { IzvodjenjeInfo } from '../data-access/uzivo.models';
import { brojUcesnika, KrajIzvodjenjaComponent, komandaNastavka, trajanje } from './kraj-izvodjenja.component';

const prez = (id: number, naziv: string, vezba: number | null, aktivno: number | null = null): PrezentacijaZaIzbor => ({
  id, naziv, brojSlajdova: 4, brojPitanja: 2, izmenjeno: '2026-10-20T10:00:00', aktivnoIzvodjenjeId: aktivno, vezba,
  vrsta: 'ZADACI', brojZadataka: 2, kreirano: '2026-10-01T10:00:00', poslednjePustanje: null,
});

const iz = (izmena: Partial<IzvodjenjeInfo> = {}): IzvodjenjeInfo => ({
  id: 7, prezentacija: { id: 3, naziv: 'Vežbe 3 – zadaci', predmetId: 4 }, kod: '123456', status: 'ZAVRSENO', cuvanje: true,
  grupa: { id: 9, naziv: 'GD-2025' } as IzvodjenjeInfo['grupa'], predavanje: { id: 40, rb: 5, datum: '2026-10-29', tema: null },
  pocetak: '2026-10-29T10:00:00', kraj: '2026-10-29T10:41:00', brojUcesnika: 23, brojPitanja: 6, ...izmena,
});

describe('završni ekran: čista logika', () => {
  it('broj učesnika i trajanje', () => {
    expect([brojUcesnika(1), brojUcesnika(21), brojUcesnika(11), brojUcesnika(23)]).toEqual(['1 učesnik', '21 učesnik', '11 učesnika', '23 učesnika']);
    expect(trajanje('2026-10-29T10:00:00', '2026-10-29T10:41:00')).toBe('41 min');
    expect(trajanje('2026-10-29T10:00:00', '2026-10-29T11:05:00')).toBe('1 h 05 min');
    expect(trajanje('2026-10-29T10:00:00', null)).toBeNull();
  });

  it('nastavak: sa predavanjem isto predavanje i čuvanje; bez njega grupa i čuvanje kao pre; nikad bodovano', () => {
    expect(komandaNastavka(iz({ boduje: true }))).toEqual({ cuvanje: true, grupaId: null, predavanjeId: 40, boduje: false });
    expect(komandaNastavka(iz({ predavanje: null, cuvanje: false }))).toEqual({ cuvanje: false, grupaId: 9, predavanjeId: null, boduje: false });
    expect(komandaNastavka(iz({ predavanje: null, grupa: null }))).toEqual({ cuvanje: true, grupaId: null, predavanjeId: null, boduje: false });
  });
});

describe('KrajIzvodjenjaComponent', () => {
  let izborApi: ReturnType<typeof vi.fn>;
  let pokreni: ReturnType<typeof vi.fn>;
  let navigate: ReturnType<typeof vi.spyOn>;

  function otvori(info: IzvodjenjeInfo, odgovor: IzborPrezentacija | 'greska'): ComponentFixture<KrajIzvodjenjaComponent> {
    izborApi = vi.fn(() => (odgovor === 'greska' ? throwError(() => new HttpErrorResponse({ status: 0 })) : of(odgovor)));
    pokreni = vi.fn(() => of({ ...info, id: 8, status: 'AKTIVNO' }));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: PrezentacijePredavanjaApi, useValue: { izbor: izborApi } },
        { provide: IzvodjenjaApi, useValue: { pokreni } },
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const f = TestBed.createComponent(KrajIzvodjenjaComponent);
    f.componentRef.setInput('izvodjenje', info);
    f.detectChanges();
    return f;
  }

  const el = (f: ComponentFixture<unknown>) => f.nativeElement as HTMLElement;
  const lista = [prez(3, 'Vežbe 3 – zadaci', 3), prez(4, 'Vežbe 4', 4), prez(5, 'Vežbe 4 – zadaci', 4), prez(6, 'Vežbe 5', 5)];
  const izbor: IzborPrezentacija = { stavke: lista.map(p => ({ prezentacija: p, pustenoGrupi: null })), predlog: [4, 5, 6] };

  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('rezime, predlog za grupu (samo predlog, bez liste) i "Rezultati" kad se čuva', () => {
    const f = otvori(iz(), izbor);
    expect(izborApi).toHaveBeenCalledWith(4, 9, null);
    expect(el(f).textContent).toContain('23 učesnika · 41 min');
    expect(el(f).querySelector('[data-predlog] h3')?.textContent).toContain('Sledeće za GD-2025');
    expect(Array.from(el(f).querySelectorAll('[data-predlog-stavka]')).map(x => x.getAttribute('data-predlog-stavka'))).toEqual(['4', '5', '6']);
    expect(el(f).querySelector('[data-prezentacija]')).toBeNull();
    expect(el(f).querySelector('[data-rezultati]')).not.toBeNull();
    expect(el(f).querySelector('[data-nazad-predavanje]')).not.toBeNull();
  });

  it('bez grupe: "Sledeće po redu" posle ove prezentacije; bez predavanja nazad na prezentacije; bez čuvanja nema rezultata', () => {
    const f = otvori(iz({ grupa: null, predavanje: null, cuvanje: false }), izbor);
    expect(izborApi).toHaveBeenCalledWith(4, null, 3);
    expect(el(f).querySelector('[data-predlog] h3')?.textContent).toContain('Sledeće po redu');
    expect(el(f).querySelector('[data-nazad-prezentacije]')).not.toBeNull();
    expect(el(f).querySelector('[data-rezultati]')).toBeNull();
  });

  it('prazan predlog kaže zašto', () => {
    const f = otvori(iz(), { ...izbor, predlog: [] });
    expect(el(f).querySelector('[data-bez-predloga]')?.textContent).toContain('puštene ovoj grupi');
  });

  it('"Pokreni" pokreće u istoj kartici, javlja projektoru i prelazi na novu konzolu', () => {
    const poslato = vi.fn();
    vi.stubGlobal('BroadcastChannel', class { postMessage = poslato; close(): void { /* lažni kanal */ } });
    const f = otvori(iz(), izbor);
    el(f).querySelector<HTMLButtonElement>('[data-predlog-stavka="4"] [data-pokreni]')!.click();
    expect(pokreni).toHaveBeenCalledWith(4, { cuvanje: true, grupaId: null, predavanjeId: 40, boduje: false });
    expect(poslato).toHaveBeenCalledWith({ tip: 'novo-izvodjenje', staro: 7, novo: 8 });
    expect(navigate).toHaveBeenCalledWith(['/izvodjenja/8/konzola']);
  });

  it('greška pokretanja ostaje na ekranu sa razlogom', () => {
    const f = otvori(iz(), izbor);
    pokreni.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409, error: { reason: 'Prezentacija je već u toku.', time: 't' } })));
    el(f).querySelector<HTMLButtonElement>('[data-predlog-stavka="4"] [data-pokreni]')!.click();
    f.detectChanges();
    expect(el(f).querySelector('[data-greska]')?.textContent).toContain('Prezentacija je već u toku.');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('"Vidi sve prezentacije" otvara iskačući prozor sa celom listom; izbor iz njega pokreće', () => {
    const f = otvori(iz(), izbor);
    const dialog = TestBed.inject(MatDialog);
    const open = vi.spyOn(dialog, 'open').mockReturnValue({ afterClosed: () => of(lista[3]) } as never);
    el(f).querySelector<HTMLButtonElement>('[data-vidi-sve]')!.click();
    expect(open).toHaveBeenCalledTimes(1);
    const cfg = open.mock.calls[0][1] as { data: { redovi: { p: PrezentacijaZaIzbor }[] } };
    expect(cfg.data.redovi.map(r => r.p.id)).toEqual([3, 4, 5, 6]);
    expect(pokreni).toHaveBeenCalledWith(6, expect.objectContaining({ predavanjeId: 40 }));
  });

  it('neuspelo učitavanje: poruka, "Vidi sve" je onemogućeno, povratak radi', () => {
    const f = otvori(iz(), 'greska');
    expect(el(f).querySelector('[data-greska]')).not.toBeNull();
    expect(el(f).querySelector<HTMLButtonElement>('[data-vidi-sve]')!.disabled).toBe(true);
    expect(el(f).querySelector('[data-bez-predloga]')).toBeNull();
  });

  it('"Nazad na predavanje" zatvara karticu; ako pregledač ne da, prelazi na predavanje', () => {
    vi.useFakeTimers();
    try {
      const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
      const f = otvori(iz(), izbor);
      el(f).querySelector<HTMLButtonElement>('[data-nazad-predavanje]')!.click();
      expect(close).toHaveBeenCalled();
      vi.advanceTimersByTime(300);
      expect(navigate).toHaveBeenCalledWith(['/predavanja', 40]);
    } finally {
      vi.useRealTimers();
    }
  });
});
