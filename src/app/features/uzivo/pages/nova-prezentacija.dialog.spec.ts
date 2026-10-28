import { provideHttpClient } from '@angular/common/http';
import { ErrorHandler } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogState } from '@angular/material/dialog';
import { of } from 'rxjs';
import { PrezentacijeApi } from '../data-access/prezentacije.api';
import { PRIHVACENI_FAJLOVI } from '../uvoz-pptx/ime-fajla';
import { NovaPrezentacijaDialog, PORUKA_UVOZ_NIJE_UCITAN } from './nova-prezentacija.dialog';
import { UvozPptxOtvarac } from './uvoz-pptx-otvarac';

describe('NovaPrezentacijaDialog (Iz PowerPointa)', () => {
  let kreiraj: ReturnType<typeof vi.fn>;
  let zatvori: ReturnType<typeof vi.fn>;
  let pripremi: ReturnType<typeof vi.fn>;
  let handleError: ReturnType<typeof vi.fn>;
  let stanje: MatDialogState;

  function otvori(chunkUvoza: () => Promise<void> = () => Promise.resolve()) {
    kreiraj = vi.fn(() => of({ id: 9, naziv: 'x' }));
    zatvori = vi.fn();
    pripremi = vi.fn(chunkUvoza);
    handleError = vi.fn();
    stanje = MatDialogState.OPEN;
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        { provide: PrezentacijeApi, useValue: { kreiraj } },
        { provide: UvozPptxOtvarac, useValue: { pripremi } },
        { provide: ErrorHandler, useValue: { handleError } },
        { provide: MAT_DIALOG_DATA, useValue: { predmeti: [{ id: 7, naziv: 'Statika' }], predmetId: 7 } },
        { provide: MatDialogRef, useValue: { close: zatvori, getState: () => stanje } },
      ],
    });
    const f = TestBed.createComponent(NovaPrezentacijaDialog);
    f.detectChanges();
    return f;
  }

  const el = (f: { nativeElement: HTMLElement }) => f.nativeElement;
  const naziv = (f: { nativeElement: HTMLElement }) => el(f).querySelector<HTMLInputElement>('input[formcontrolname="naziv"]')!;

  async function pptx(f: ReturnType<typeof otvori>) {
    el(f).querySelectorAll<HTMLElement>('mat-radio-button input')[1].click();
    f.detectChanges();
    await f.whenStable();
    f.detectChanges();
  }

  function izaberi(f: ReturnType<typeof otvori>, ime: string) {
    const ulaz = el(f).querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(ulaz, 'files', { configurable: true, value: [new File(['x'], ime)] });
    ulaz.dispatchEvent(new Event('change'));
    f.detectChanges();
  }

  const napravi = (f: ReturnType<typeof otvori>) => {
    el(f).querySelector('form')!.dispatchEvent(new Event('submit'));
    f.detectChanges();
  };

  it('izbor Predavanje 3.pptx popunjava naziv imenom bez ekstenzije', async () => {
    const f = otvori();
    await pptx(f);
    izaberi(f, 'Predavanje 3.pptx');
    expect(naziv(f).value).toBe('Predavanje 3');
    expect(el(f).textContent).toContain('Izabrano: Predavanje 3.pptx');
    izaberi(f, 'Predavanje 4.pptx');
    expect(naziv(f).value).toBe('Predavanje 4');
  });

  it('izbor fajla prima iste formate kao dijalog uvoza (.pptx, .ppsx, .potx)', async () => {
    const f = otvori();
    await pptx(f);
    const accept = el(f).querySelector<HTMLInputElement>('input[type="file"]')!.accept;
    expect(accept).toBe(PRIHVACENI_FAJLOVI);
    expect(accept.split(',')).toEqual(expect.arrayContaining(['.pptx', '.ppsx', '.potx']));
  });

  it('ručno upisan naziv se ne menja pri izboru drugog fajla', async () => {
    const f = otvori();
    await pptx(f);
    naziv(f).value = 'Moj naziv';
    naziv(f).dispatchEvent(new Event('input'));
    izaberi(f, 'Predavanje 3.pptx');
    expect(naziv(f).value).toBe('Moj naziv');
  });

  it('stari.ppt daje poruku i ne šalje', async () => {
    const f = otvori();
    await pptx(f);
    izaberi(f, 'stari.ppt');
    expect(el(f).querySelector('[role="alert"]')?.textContent).toContain('.ppt');
    napravi(f);
    expect(kreiraj).not.toHaveBeenCalled();
  });

  it('slanje sa fajlom: tema BELA i ishod sa fajlom', async () => {
    const f = otvori();
    await pptx(f);
    izaberi(f, 'Predavanje 3.pptx');
    napravi(f);
    await f.whenStable();
    expect(pripremi).toHaveBeenCalledTimes(1);
    expect(kreiraj).toHaveBeenCalledWith({ predmetId: 7, naziv: 'Predavanje 3', opis: null, tema: 'BELA' });
    const ishod = zatvori.mock.calls[0][0];
    expect(ishod.prezentacija.id).toBe(9);
    expect(ishod.fajl.name).toBe('Predavanje 3.pptx');
  });

  it('bez fajla: tema null i fajl null', () => {
    const f = otvori();
    naziv(f).value = 'Prazna';
    naziv(f).dispatchEvent(new Event('input'));
    napravi(f);
    expect(kreiraj).toHaveBeenCalledWith({ predmetId: 7, naziv: 'Prazna', opis: null, tema: null });
    expect(zatvori.mock.calls[0][0].fajl).toBeNull();
    expect(pripremi).not.toHaveBeenCalled();
  });

  it('chunk uvoza se učitava pre POST-a: dok ne stigne, prezentacija se ne pravi', async () => {
    let pusti!: () => void;
    const f = otvori(() => new Promise<void>(r => (pusti = r)));
    await pptx(f);
    izaberi(f, 'Predavanje 3.pptx');
    napravi(f);
    expect(pripremi).toHaveBeenCalledTimes(1);
    expect(kreiraj).not.toHaveBeenCalled();
    pusti();
    await f.whenStable();
    expect(kreiraj).toHaveBeenCalledTimes(1);
  });

  it('chunk uvoza se ne učita (zastarela kartica): bez POST-a, poruka u dijalogu, greška u ErrorHandler', async () => {
    const greska = new TypeError('Failed to fetch dynamically imported module: https://gfs.trif.rs/chunk-Bc1bQlpj.js');
    const f = otvori(() => Promise.reject(greska));
    await pptx(f);
    izaberi(f, 'Predavanje 3.pptx');
    napravi(f);
    await f.whenStable();
    f.detectChanges();
    expect(kreiraj).not.toHaveBeenCalled();
    expect(zatvori).not.toHaveBeenCalled();
    expect(handleError).toHaveBeenCalledWith(greska);
    expect(el(f).querySelector('[role="alert"]')?.textContent).toContain(PORUKA_UVOZ_NIJE_UCITAN);
    expect(el(f).querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false);
  });

  it('dijalog zatvoren dok se chunk učitava: prezentacija se ne pravi ni kasnije', async () => {
    let pusti!: () => void;
    const f = otvori(() => new Promise<void>(r => (pusti = r)));
    await pptx(f);
    izaberi(f, 'Predavanje 3.pptx');
    napravi(f);
    stanje = MatDialogState.CLOSED;
    pusti();
    await f.whenStable();
    expect(kreiraj).not.toHaveBeenCalled();
  });
});
