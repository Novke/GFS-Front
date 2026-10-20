import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { of } from 'rxjs';
import { LOCAL_ERRORS } from '../../../core/api/api-error';
import type { CvorIzbora } from '../../../core/api/banka-izbor.api';
import { IzborGrupeDialog, IzborGrupePodaci, otvoriIzborGrupe } from './izbor-grupe.dialog';

const STABLO = 'api/banka/stablo';

/** Čvor kako ga šalje `GET banka/stablo` (`GrupaCvor`; izbor čita samo svoja polja). */
const cvor = (id: number, naziv: string, deca: unknown[], izmene: Record<string, unknown> = {}) => ({
  id, naziv, rb: 1, tezina: null, list: deca.length === 0, brojVarijanti: 3, brojAktivnih: 1, brojNacrta: 1, brojGresaka: 0, deca,
  izvor: 'RUCNO', brojClaudeNacrta: 0, iskljucena: false, iskljucenjeId: null, ...izmene,
});

/** Stablo kao `e2e/fixtures/banka.json` (izmišljeno): koren sa tri lista, jedan isključen i bez aktivnih. */
const stablo = () => [
  cvor(1, 'Konverzije brojeva', [
    cvor(2, '2 → 10', []),
    cvor(3, '16 → 2', [], { brojAktivnih: 2 }),
    cvor(5, 'Razlomljeni brojevi (demo)', [], { brojAktivnih: 0, iskljucena: true, iskljucenjeId: 1 }),
  ], { brojAktivnih: 3 }),
];

describe('IzborGrupeDialog', () => {
  let fixture: ComponentFixture<IzborGrupeDialog>;
  let http: HttpTestingController;
  let zatvori: ReturnType<typeof vi.fn>;

  function napravi(podaci: IzborGrupePodaci = { predmetId: 1, grupaId: null }): HTMLElement {
    zatvori = vi.fn();
    TestBed.configureTestingModule({
      imports: [IzborGrupeDialog],
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
        { provide: MAT_DIALOG_DATA, useValue: podaci },
        { provide: MatDialogRef, useValue: { close: zatvori } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(IzborGrupeDialog);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const osvezi = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
  };
  const dugme = (el: HTMLElement, tekst: string) => [...el.querySelectorAll('button')].find(b => b.textContent?.trim() === tekst)!;
  const radio = (el: HTMLElement, id: number) => el.querySelector<HTMLInputElement>(`[data-grupa="${id}"] input[type=radio]`)!;

  afterEach(() => http.verify());

  it('stablo predmeta (namena PREDAVANJE, tiho): uvlaka po nivou, "aktivnih: N", čip Isključeno i "Nema aktivnih varijanti"', async () => {
    const el = napravi();
    const req = http.expectOne(r => r.url === STABLO);
    expect(req.request.urlWithParams).toBe(`${STABLO}?predmetId=1&namena=PREDAVANJE`);
    // greška ide u traku dijaloga, ne u globalni snackbar
    expect(req.request.context.get(LOCAL_ERRORS)).toBe(true);
    req.flush(stablo());
    await osvezi();

    const redovi = [...el.querySelectorAll<HTMLElement>('[data-grupa]')];
    expect(redovi.map(r => r.dataset['grupa'])).toEqual(['1', '2', '3', '5']);
    expect(redovi.map(r => r.dataset['nivo'])).toEqual(['0', '1', '1', '1']);
    expect(redovi[0].textContent).toContain('aktivnih: 3');
    expect(redovi[2].textContent).toContain('aktivnih: 2');
    expect(redovi[3].textContent).toContain('Nema aktivnih varijanti');
    expect(redovi[3].textContent).not.toContain('aktivnih: 0');
    expect(redovi[3].querySelector('.uz-cip')?.textContent?.trim()).toBe('Isključeno');
    expect(redovi.slice(0, 3).some(r => r.textContent?.includes('Isključeno'))).toBe(false);
    // uvlaka kroz CSSOM (vezivanje stila, ne `style` atribut u HTML-u: CSP ga ne bi pustio)
    expect(redovi.map(r => r.style.paddingLeft)).toEqual(['0rem', '1.5rem', '1.5rem', '1.5rem']);
  });

  it('"Izaberi" je onemogućeno dok ništa nije izabrano; izbor čvora bez aktivnih je dozvoljen i zatvara dijalog sa čvorom', async () => {
    const el = napravi();
    http.expectOne(r => r.url === STABLO).flush(stablo());
    await osvezi();
    expect(dugme(el, 'Izaberi').disabled).toBe(true);
    radio(el, 5).click();
    await osvezi();
    expect(dugme(el, 'Izaberi').disabled).toBe(false);
    dugme(el, 'Izaberi').click();
    const ocekivano: CvorIzbora = { id: 5, naziv: 'Razlomljeni brojevi (demo)', list: true, brojAktivnih: 0, iskljucena: true, deca: [] };
    expect(zatvori).toHaveBeenCalledWith(ocekivano);
  });

  it('trenutna grupa slajda je izabrana unapred; drugi izbor zatvara sa tim čvorom', async () => {
    const el = napravi({ predmetId: 1, grupaId: 2 });
    http.expectOne(r => r.url === STABLO).flush(stablo());
    await osvezi();
    expect(radio(el, 2).checked).toBe(true);
    expect(dugme(el, 'Izaberi').disabled).toBe(false);
    radio(el, 1).click();
    await osvezi();
    dugme(el, 'Izaberi').click();
    expect(zatvori).toHaveBeenCalledWith(expect.objectContaining({ id: 1, naziv: 'Konverzije brojeva', list: false }));
  });

  it('greška učitavanja: razlog servera u traci dijaloga (role=alert), "Pokušaj ponovo" čita ponovo', async () => {
    const el = napravi();
    http.expectOne(r => r.url === STABLO).flush({ reason: 'Predmet nije pronađen.' }, { status: 404, statusText: 'Not Found' });
    await osvezi();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Predmet nije pronađen.');
    expect(dugme(el, 'Izaberi').disabled).toBe(true);
    dugme(el, 'Pokušaj ponovo').click();
    http.expectOne(r => r.url === STABLO).flush(stablo());
    await osvezi();
    expect(el.querySelector('[role="alert"]')).toBeNull();
    expect(el.querySelectorAll('[data-grupa]').length).toBe(4);
  });

  it('"Otkaži" zatvara bez čvora (undefined, ne prazan string atributa)', async () => {
    const el = napravi({ predmetId: 1, grupaId: 2 });
    http.expectOne(r => r.url === STABLO).flush(stablo());
    await osvezi();
    dugme(el, 'Otkaži').click();
    expect(zatvori).toHaveBeenCalledTimes(1);
    expect(zatvori.mock.calls[0]).toEqual([undefined]);
  });

  it('prazna banka: napomena umesto stabla', async () => {
    const el = napravi();
    http.expectOne(r => r.url === STABLO).flush([]);
    await osvezi();
    expect(el.textContent).toContain('Banka ovog predmeta još nema grupa za predavanja.');
    expect(el.querySelector('mat-radio-group')).toBeNull();
  });
});

describe('otvoriIzborGrupe', () => {
  it('otvara dijalog sa podacima i vraća izabran čvor (afterClosed)', () => {
    const c: CvorIzbora = { id: 2, naziv: '2 → 10', list: true, brojAktivnih: 1, iskljucena: false, deca: [] };
    const open = vi.fn(() => ({ afterClosed: () => of(c) }));
    const rez = vi.fn();
    otvoriIzborGrupe({ open, openDialogs: [] } as unknown as MatDialog, { predmetId: 1, grupaId: null }).subscribe(rez);
    expect(open).toHaveBeenCalledWith(IzborGrupeDialog, expect.objectContaining({ data: { predmetId: 1, grupaId: null } }));
    expect(rez).toHaveBeenCalledWith(c);
  });

  it('dok je izbor već otvoren, drugi ne otvara ništa i završava se bez čvora', () => {
    const open = vi.fn();
    const rez = vi.fn();
    const otvoren = { componentInstance: Object.create(IzborGrupeDialog.prototype) };
    otvoriIzborGrupe({ open, openDialogs: [otvoren] } as unknown as MatDialog, { predmetId: 1, grupaId: null }).subscribe(rez);
    expect(open).not.toHaveBeenCalled();
    expect(rez).toHaveBeenCalledWith(undefined);
  });
});
