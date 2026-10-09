import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { KoeficijentiInfo, SaveKoeficijentiCmd } from '../../../core/api/ocene.models';
import { KoeficijentiForma } from './koeficijenti-forma';

const KOEF: KoeficijentiInfo = {
  id: 1,
  predmetId: 3,
  koefPrisustvo: 1,
  koefZadatak: 2,
  koefZvezdica: 4,
  domaciFlat: 4,
  domaciVarijansa: 6,
  koristiMaxRezultat: true,
  prikaziZbirno: false,
  maxAktivnost: null,
  maxDomaci: 20,
  koeficijentiTipova: [
    { tipTestaId: 7, tipTestaNaziv: 'Kolokvijum 1', maxPoena: 30 },
    { tipTestaId: 8, tipTestaNaziv: 'Kolokvijum 2', maxPoena: null },
  ],
};

describe('KoeficijentiForma', () => {
  let fixture: ComponentFixture<KoeficijentiForma>;
  let http: HttpTestingController;

  const el = () => fixture.nativeElement as HTMLElement;
  const polje = (ime: string) => el().querySelector<HTMLInputElement>(`[data-polje="${ime}"]`)!;
  const upisi = (ime: string, v: string) => {
    const i = polje(ime);
    i.value = v;
    i.dispatchEvent(new Event('input'));
    i.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
  };
  const sacuvaj = () => {
    el().querySelector<HTMLButtonElement>('[data-sacuvaj]')!.click();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(KoeficijentiForma);
    fixture.componentRef.setInput('predmetId', 3);
    fixture.componentRef.setInput('koeficijenti', KOEF);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  it('popunjava polja iz koeficijenata, sa poljem po tipu testa', () => {
    expect(polje('koefZadatak').value).toBe('2');
    expect(polje('maxDomaci').value).toBe('20');
    expect(polje('maxAktivnost').value).toBe('');
    expect(polje('tip-7').value).toBe('30');
    expect(polje('tip-8').value).toBe('');
    expect(fixture.componentInstance.imaNesacuvanihIzmena()).toBe(false);
  });

  it('negativna vrednost se ne šalje: poruka "Najmanje 0." i nema zahteva', () => {
    upisi('koefZvezdica', '-1');
    upisi('tip-7', '-5');
    expect(fixture.componentInstance.imaNesacuvanihIzmena()).toBe(true);
    sacuvaj();
    http.expectNone(() => true);
    expect(el().textContent).toContain('Najmanje 0.');
  });

  it('obavezan koeficijent ne sme biti prazan; prazan maksimum je "bez normalizacije" (null)', () => {
    upisi('koefPrisustvo', '');
    sacuvaj();
    http.expectNone(() => true);
    expect(el().textContent).toContain('je obavezno.');

    upisi('koefPrisustvo', '1.5');
    upisi('maxDomaci', '');
    sacuvaj();
    const req = http.expectOne('api/ocenjivanje/predmet/3/koeficijenti');
    expect(req.request.method).toBe('POST');
    const body = req.request.body as SaveKoeficijentiCmd;
    expect(body.koefPrisustvo).toBe(1.5);
    expect(body.maxDomaci).toBeNull();
    expect(body.maxAktivnost).toBeNull();
    expect(body.koeficijentiTipova).toEqual([
      { tipTestaId: 7, maxPoena: 30 },
      { tipTestaId: 8, maxPoena: null },
    ]);
    req.flush({ ...KOEF, koefPrisustvo: 1.5, maxDomaci: null });
    fixture.detectChanges();
    expect(fixture.componentInstance.imaNesacuvanihIzmena()).toBe(false);
    expect(el().textContent).toContain('Sačuvano');
  });

  it('nula je dozvoljena', () => {
    upisi('koefZvezdica', '0');
    sacuvaj();
    const req = http.expectOne('api/ocenjivanje/predmet/3/koeficijenti');
    expect((req.request.body as SaveKoeficijentiCmd).koefZvezdica).toBe(0);
    req.flush(KOEF);
  });

  it('greška servera: poruka iznad forme, izmene ostaju nesačuvane', () => {
    upisi('koefZadatak', '3');
    sacuvaj();
    http.expectOne('api/ocenjivanje/predmet/3/koeficijenti').flush({ reason: 'Predmet ne postoji! ID = 3' }, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    expect(el().textContent).toContain('Predmet ne postoji! ID = 3');
    expect(fixture.componentInstance.imaNesacuvanihIzmena()).toBe(true);
  });

  it('nov tip testa dobija prazno polje, a postojeće izmene ostaju', () => {
    upisi('koefZadatak', '3');
    fixture.componentRef.setInput('tipovi', [
      { id: 7, naziv: 'Kolokvijum I', aktivan: true },
      { id: 8, naziv: 'Kolokvijum 2', aktivan: true },
      { id: 9, naziv: 'Popravni', aktivan: true },
    ]);
    fixture.detectChanges();
    expect(polje('koefZadatak').value).toBe('3');
    expect(polje('tip-9').value).toBe('');
    expect(el().textContent).toContain('Kolokvijum I');
  });
});
