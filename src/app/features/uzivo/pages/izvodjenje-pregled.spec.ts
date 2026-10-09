import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { IzvodjenjeInfo, IzvodjenjeRezultati, PitanjeSnimak, RezultatPitanja } from '../data-access/uzivo.models';
import { IzvodjenjePregledPage, imaTakmicenje, oznakeRundi, procenatTacnihTekst } from './izvodjenje-pregled.page';

function snimak(pitanjeId: number, slajdId: number | null, tekst = 'Koliko je 2 + 2?'): PitanjeSnimak {
  return {
    pitanjeId, slajdId, tip: 'JEDAN_TACAN', tekst, slikaId: null, vremeSekunde: null,
    opcije: [{ id: 1, rb: 1, tekst: '3', tacna: false }, { id: 2, rb: 2, tekst: '4', tacna: true }],
    brojTacno: null, brojOdstupanje: null, odstupanjeTip: null, jedinica: null, tekstPrikaz: null,
    prihvatljiviOdgovori: null, skalaMinOznaka: null, skalaMaxOznaka: null,
  };
}

/** `redniBroj` je kao na serveru: broj runde unutar slajda (1 za prvo otvaranje, 2 za ponavljanje). */
function runda(rundaId: number, redniBroj: number, slajdId: number | null, izmene: Partial<RezultatPitanja> = {}): RezultatPitanja {
  return {
    rundaId, slajdId, rbSlajda: slajdId, redniBroj, pitanje: snimak(50 + (slajdId ?? 0), slajdId),
    rezultat: {
      tip: 'JEDAN_TACAN', ukupno: 4, brojevi: null, skala: null, tekstovi: null,
      opcije: [{ id: 1, tekst: '3', broj: 1, tacna: false }, { id: 2, tekst: '4', broj: 3, tacna: true }],
    },
    brojOdgovora: 4, procenatTacnih: 75, ...izmene,
  };
}

const INFO: IzvodjenjeInfo = {
  id: 5, prezentacija: { id: 3, naziv: 'Statika', predmetId: 7 }, kod: '123456', status: 'ZAVRSENO', cuvanje: true,
  grupa: { id: 2, naziv: 'GD-2025' }, predavanje: { id: 8, rb: 3, datum: '2026-10-07', tema: 'Greda' },
  pocetak: '2026-10-07T10:00:00', kraj: '2026-10-07T11:30:00', brojUcesnika: 4, brojPitanja: 3,
};

describe('procenatTacnihTekst', () => {
  it('broj odgovora i procenat tačnih', () => {
    expect(procenatTacnihTekst({ brojOdgovora: 23, procenatTacnih: 61 })).toBe('Odgovora 23 · tačnih 61 %');
  });

  it('nula procenata je i dalje procenat', () => {
    expect(procenatTacnihTekst({ brojOdgovora: 3, procenatTacnih: 0 })).toBe('Odgovora 3 · tačnih 0 %');
  });

  it('bez tačnog odgovora ili bez odgovora nema procenta', () => {
    expect(procenatTacnihTekst({ brojOdgovora: 12, procenatTacnih: null })).toBe('Odgovora 12');
    expect(procenatTacnihTekst({ brojOdgovora: 0, procenatTacnih: null })).toBe('Odgovora 0');
  });
});

describe('oznakeRundi', () => {
  it('slajd sa jednom rundom nema oznaku', () => {
    expect(oznakeRundi([runda(1, 1, 10), runda(2, 1, 11)])).toEqual([{ runda: 1, ukupno: 1 }, { runda: 1, ukupno: 1 }]);
  });

  it('ponovljeno pitanje: 1. i 2. runda, drugi slajd ostaje sam', () => {
    expect(oznakeRundi([runda(1, 1, 10), runda(2, 1, 11), runda(3, 2, 10)]))
      .toEqual([{ runda: 1, ukupno: 2 }, { runda: 1, ukupno: 1 }, { runda: 2, ukupno: 2 }]);
  });

  it('obrisan slajd: runde se spajaju po pitanju iz snimka', () => {
    const a = runda(1, 1, null, { pitanje: snimak(77, null) });
    const b = runda(2, 2, null, { pitanje: snimak(77, null) });
    const c = runda(3, 1, null, { pitanje: snimak(78, null) });
    expect(oznakeRundi([a, b, c])).toEqual([{ runda: 1, ukupno: 2 }, { runda: 2, ukupno: 2 }, { runda: 1, ukupno: 1 }]);
  });

  it('prazna lista', () => {
    expect(oznakeRundi([])).toEqual([]);
  });
});

describe('imaTakmicenje', () => {
  it('rang-lista bez poena znači da takmičenja nije bilo', () => {
    expect(imaTakmicenje({ rangLista: [] })).toBe(false);
    expect(imaTakmicenje({ rangLista: [{ mesto: 1, ucesnikId: 1, ime: 'Ana', poeni: 0 }] })).toBe(false);
    expect(imaTakmicenje({ rangLista: [{ mesto: 1, ucesnikId: 1, ime: 'Ana', poeni: 940 }] })).toBe(true);
  });
});

describe('IzvodjenjePregledPage', () => {
  let http: HttpTestingController;

  function otvori(rezultati: IzvodjenjeRezultati): HTMLElement {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: new Map([['id', '5']]) } } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(IzvodjenjePregledPage);
    http.expectOne('api/izvodjenja/5/rezultati').flush(rezultati);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  afterEach(() => http.verify());

  it('zaglavlje, karte pitanja, oznake rundi i rang-lista', () => {
    const el = otvori({
      izvodjenje: INFO,
      pitanja: [runda(1, 1, 10), runda(2, 1, 11, { procenatTacnih: null, brojOdgovora: 2 }), runda(3, 2, 10, { procenatTacnih: 100 })],
      rangLista: [{ mesto: 1, ucesnikId: 1, ime: 'Ana', poeni: 940 }, { mesto: 2, ucesnikId: 2, ime: 'Bojan', poeni: 700 }],
    });
    expect(el.querySelector('h1')?.textContent).toContain('Statika');
    const meta = el.querySelector('.uz-pr-meta')?.textContent ?? '';
    expect(meta).toContain('7.10.2026. 10:00');
    expect(meta).toContain('GD-2025 · 3. predavanje (7.10.2026.) · Greda');
    expect(meta).toContain('Učesnika: 4');

    const karte = Array.from(el.querySelectorAll('.uz-pr-karta'));
    expect(karte.length).toBe(4);
    const naslovi = karte.map(k => k.querySelector('h2')?.textContent);
    expect(naslovi).toEqual(['Pitanje 1', 'Pitanje 2', 'Pitanje 3', 'Rang-lista']);
    expect(karte[0].textContent).toContain('1. runda');
    expect(karte[0].textContent).toContain('Odgovora 4 · tačnih 75 %');
    expect(karte[0].textContent).toContain('Za poene važi samo poslednja runda.');
    expect(karte[0].textContent).toContain('Koliko je 2 + 2?');
    expect(karte[0].textContent).toContain('✓ tačno');
    expect(karte[1].textContent).not.toContain('runda');
    expect(karte[1].textContent).toContain('Odgovora 2');
    expect(karte[1].textContent).not.toContain('tačnih');
    expect(karte[2].textContent).toContain('2. runda');
    expect(karte[2].textContent).not.toContain('Za poene važi');
    expect(karte[3].querySelector('h2')?.textContent).toBe('Rang-lista');
    expect(karte[3].textContent).toContain('Ana');
  });

  it('bez poena nema rang-liste', () => {
    const el = otvori({ izvodjenje: INFO, pitanja: [runda(1, 1, 10)], rangLista: [{ mesto: 1, ucesnikId: 1, ime: 'Ana', poeni: 0 }] });
    expect(el.querySelectorAll('.uz-pr-karta').length).toBe(1);
    expect(el.textContent).not.toContain('Rang-lista');
  });

  it('izvođenje bez čuvanja: prazno stanje', () => {
    const el = otvori({ izvodjenje: { ...INFO, cuvanje: false, brojPitanja: 0, brojUcesnika: 0 }, pitanja: [], rangLista: [] });
    expect(el.textContent).toContain('Rezultati ovog izvođenja nisu čuvani.');
    expect(el.querySelector('.uz-pr-karta')).toBeNull();
  });

  it('sačuvano izvođenje bez pitanja', () => {
    const el = otvori({ izvodjenje: INFO, pitanja: [], rangLista: [] });
    expect(el.textContent).toContain('U ovom izvođenju nije bilo pitanja.');
  });

  it('greška servera se prikazuje', () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: new Map([['id', '5']]) } } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(IzvodjenjePregledPage);
    http.expectOne('api/izvodjenja/5/rezultati').flush({ reason: 'Izvođenje nije pronađeno.' }, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role=alert]')?.textContent).toContain('Izvođenje nije pronađeno.');
  });
});
