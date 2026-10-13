import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';
import { PrezentacijeApi } from '../data-access/prezentacije.api';
import { PRIHVACENI_FAJLOVI } from '../uvoz-pptx/ime-fajla';
import { NovaPrezentacijaDialog } from './nova-prezentacija.dialog';

describe('NovaPrezentacijaDialog (Iz PowerPointa)', () => {
  let kreiraj: ReturnType<typeof vi.fn>;
  let zatvori: ReturnType<typeof vi.fn>;

  function otvori() {
    kreiraj = vi.fn(() => of({ id: 9, naziv: 'x' }));
    zatvori = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(), provideNoopAnimations(),
        { provide: PrezentacijeApi, useValue: { kreiraj } },
        { provide: MAT_DIALOG_DATA, useValue: { predmeti: [{ id: 7, naziv: 'Statika' }], predmetId: 7 } },
        { provide: MatDialogRef, useValue: { close: zatvori } },
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
  });
});
