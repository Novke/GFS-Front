import { OverlayContainer } from '@angular/cdk/overlay';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { StudentInfo, StudentPregledDetails } from '../../../core/api/studenti.api';
import { IKONE } from '../../../core/layout/icons';
import { NotificationStore, Poruka } from '../../../core/state/notification.store';
import { StudentIzmenaDialog } from './student-izmena-dialog';

const ana: StudentPregledDetails = {
  id: 5, ime: 'Ana', prezime: 'Radić', godina: 2025, indeks: 'GD12', brojTelefona: '064 123 456', email: 'ana@gf.uns.ac.rs',
  datumRodjenja: '2006-03-04', opstina: 'Subotica', grupa: 'GD-2025', grupaId: 4, aktivnosti: [], uradjeniDomaci: [], polaganja: [],
};
const odgovor = (s: StudentPregledDetails): StudentInfo => ({
  id: s.id, ime: s.ime ?? '', prezime: s.prezime ?? '', godina: s.godina, indeks: s.indeks ?? '', brojTelefona: s.brojTelefona, email: s.email,
  datumRodjenja: s.datumRodjenja, opstina: s.opstina,
});

describe('StudentIzmenaDialog', () => {
  let http: HttpTestingController;
  let dialog: MatDialog;
  let poruke: Poruka[];
  let rezultat: Mock<(v: boolean | undefined) => void>;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    dialog = TestBed.inject(MatDialog);
    poruke = [];
    TestBed.inject(NotificationStore).poruke$.subscribe(p => poruke.push(p));
    rezultat = vi.fn<(v: boolean | undefined) => void>();
    const registry = TestBed.inject(MatIconRegistry);
    const sanitizer = TestBed.inject(DomSanitizer);
    for (const ime of IKONE) {
      registry.addSvgIconLiteral(ime, sanitizer.bypassSecurityTrustHtml('<svg></svg>'));
    }
  });

  afterEach(() => {
    dialog.closeAll();
    http.verify();
  });

  const overlay = () => TestBed.inject(OverlayContainer).getContainerElement();
  const tick = () => new Promise(r => setTimeout(r));

  async function otvori(nacin: 'izmena' | 'premesti', ucitan: StudentPregledDetails = ana) {
    StudentIzmenaDialog.otvori(dialog, { id: 5, nacin, grupaId: 4 }).subscribe(rezultat);
    await tick();
    http.expectOne(r => r.url === 'api/grupe').flush([
      { id: 4, naziv: 'GD-2025', godinaUpisa: 2025, brojStudenata: 38 },
      { id: 6, naziv: 'GD-2026', godinaUpisa: 2026, brojStudenata: 10 },
    ]);
    http.expectOne(r => r.url === 'api/predmeti').flush([]);
    http.expectOne('api/studenti/5').flush(ucitan);
    await tick();
    TestBed.tick();
  }

  const polje = (ime: string) => overlay().querySelector<HTMLInputElement>(`[data-${ime}]`)!;
  const upisi = (ime: string, vrednost: string) => {
    const p = polje(ime);
    p.value = vrednost;
    p.dispatchEvent(new Event('input'));
  };
  const sacuvaj = async () => {
    overlay().querySelector<HTMLButtonElement>('[data-sacuvaj]')!.click();
    await tick();
  };

  it('izmena: popunjava polja iz GET studenti/{id} i šalje pun zapis, sa datumom rođenja i opštinom koje profil ne zna', async () => {
    await otvori('izmena');
    expect(polje('ime').value).toBe('Ana');
    expect(polje('datum').value).toBe('2006-03-04');
    upisi('prezime', 'Radić-Kovač');
    upisi('telefon', '');
    await sacuvaj();
    const z = http.expectOne('api/studenti/5');
    expect(z.request.method).toBe('PUT');
    expect(z.request.body).toEqual({
      grupaId: 4, ime: 'Ana', prezime: 'Radić-Kovač', indeks: 'GD12', godina: 2025, email: 'ana@gf.uns.ac.rs', brojTelefona: null,
      datumRodjenja: '2006-03-04', opstina: 'Subotica',
    });
    z.flush({ ...odgovor(ana), prezime: 'Radić-Kovač' });
    await vi.waitFor(() => expect(rezultat).toHaveBeenCalledWith(true));
    expect(poruke.map(p => p.tekst)).toContain('Podaci studenta su sačuvani.');
  });

  it('premeštanje šalje novu grupu, a ostale podatke nepromenjene', async () => {
    await otvori('premesti');
    expect(overlay().querySelector('[data-ime]')).toBeNull();
    const izbor = overlay().querySelector<HTMLElement>('[data-grupa]')!;
    izbor.click();
    await tick();
    TestBed.tick();
    [...document.querySelectorAll<HTMLElement>('mat-option')].find(o => o.textContent!.includes('GD-2026'))!.click();
    await tick();
    await sacuvaj();
    const z = http.expectOne('api/studenti/5');
    expect(z.request.body).toMatchObject({ grupaId: 6, ime: 'Ana', prezime: 'Radić', indeks: 'GD12', godina: 2025, opstina: 'Subotica', datumRodjenja: '2006-03-04' });
    z.flush(odgovor(ana));
    await vi.waitFor(() => expect(rezultat).toHaveBeenCalledWith(true));
    expect(poruke.map(p => p.tekst)).toContain('Student je premešten u grupu GD-2026.');
  });

  it('neispravna polja (prazno ime, email) se ne šalju', async () => {
    await otvori('izmena');
    upisi('ime', '');
    upisi('email', 'nije-email');
    await sacuvaj();
    http.expectNone('api/studenti/5');
    TestBed.tick();
    expect(overlay().textContent).toContain('Ime je obavezno.');
    expect(overlay().textContent).toContain('Email nije ispravan.');
  });

  it('greška servera (duplikat indeksa) ide u traku, dijalog ostaje otvoren', async () => {
    await otvori('izmena');
    await sacuvaj();
    http.expectOne('api/studenti/5').flush({ reason: 'Student sa indeksom GD12/2025 već postoji.' }, { status: 400, statusText: 'Bad Request' });
    await tick();
    TestBed.tick();
    expect(overlay().querySelector('[role="alert"]')!.textContent).toContain('već postoji');
    expect(rezultat).not.toHaveBeenCalled();
  });

  it('premeštanje studenta sa neispravnim nevidljivim poljem (nema godine upisa): poruka da se prvo ide na "Izmeni podatke", ništa se ne šalje', async () => {
    await otvori('premesti', { ...ana, godina: null });
    overlay().querySelector<HTMLElement>('[data-grupa]')!.click();
    await tick();
    TestBed.tick();
    [...document.querySelectorAll<HTMLElement>('mat-option')].find(o => o.textContent!.includes('GD-2026'))!.click();
    await tick();
    await sacuvaj();
    http.expectNone('api/studenti/5');
    TestBed.tick();
    expect(overlay().querySelector('[role="alert"]')!.textContent).toContain('Izmeni podatke');
    expect(rezultat).not.toHaveBeenCalled();
  });

  it('greška učitavanja studenta: panel sa "Pokušaj ponovo", čuvanje je onemogućeno', async () => {
    StudentIzmenaDialog.otvori(dialog, { id: 5, nacin: 'izmena', grupaId: 4 }).subscribe(rezultat);
    await tick();
    http.expectOne(r => r.url === 'api/grupe').flush([]);
    http.expectOne(r => r.url === 'api/predmeti').flush([]);
    http.expectOne('api/studenti/5').flush({ reason: 'Student ne postoji! ID = 5' }, { status: 404, statusText: 'Not Found' });
    await tick();
    TestBed.tick();
    expect(overlay().textContent).toContain('Student ne postoji! ID = 5');
    expect(overlay().querySelector<HTMLButtonElement>('[data-sacuvaj]')!.disabled).toBe(true);
  });
});
