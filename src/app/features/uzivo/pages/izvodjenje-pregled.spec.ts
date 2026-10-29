import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RangTacnostiStavka } from '../../../core/api/rang.api';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { IzvodjenjeInfo, IzvodjenjeRezultati, PitanjeSnimak, PregledZadatka, RezultatPitanja } from '../data-access/uzivo.models';
import { IzvodjenjePregledPage, ishodUkupno, oznakeRundi, procenatTacnihTekst, unetoUcesnika } from './izvodjenje-pregled.page';

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
      tip: 'JEDAN_TACAN', ukupno: 4, brojevi: null, skala: null, tekstovi: null, tacnih: 3,
      opcije: [{ id: 1, tekst: '3', broj: 1, tacna: false }, { id: 2, tekst: '4', broj: 3, tacna: true }],
    },
    brojOdgovora: 4, procenatTacnih: 75, ...izmene,
  };
}

function pregledZadatka(slajdId: number): PregledZadatka {
  return {
    slajdId, grupaNaziv: '2 → 10', nivo: 3, nivoi: { '12': 3 }, putanja: [{ id: 1, naziv: 'Konverzije' }, { id: 3, naziv: '2 → 10' }],
    rezultat: {
      ukupno: 2, odgovoriPrikazani: true,
      varijante: [{
        varijantaId: 12, naziv: 'V1', svgId: 'svg-1', resenjeSvgId: 'res-1', dodeljeno: 2, odgovorilo: 2, tacnih: 1,
        polja: [{
          kljuc: 'a', oznaka: 'a)', tip: 'BROJ', jedinica: null, opcije: null, tacno: { broj: 45, prihvatljivi: null, tacna: null, tacne: null },
          vrednosti: [{ kljuc: '45.0', tekst: '45', broj: 1, sakriven: false, tacan: true }, { kljuc: '44.0', tekst: '44', broj: 1, sakriven: false, tacan: false }],
        }],
      }],
    },
    ucesnici: [
      { ucesnikId: 1, ime: 'Ana', varijantaId: 12, varijantaNaziv: 'V1', odgovorio: true, tacno: true, polja: { a: true }, uneto: { a: '45' } },
      { ucesnikId: 2, ime: 'Bojan', varijantaId: 12, varijantaNaziv: 'V1', odgovorio: true, tacno: false, polja: { a: false }, uneto: { a: '44' } },
    ],
  };
}

/** Runda Zadatak slajda: `pitanje` i `rezultat` su null, sve je u `zadatak`. */
function zadatakRunda(rundaId: number, slajdId: number | null, zadatakSlajdId: number): RezultatPitanja {
  return {
    rundaId, slajdId, rbSlajda: slajdId, redniBroj: 1, pitanje: null, rezultat: null, brojOdgovora: 2, procenatTacnih: 50,
    zadatak: pregledZadatka(zadatakSlajdId),
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

  it('obrisani zadatak slajdovi nad istom grupom ostaju zasebni, a id grupe se ne meša sa id-jem živog slajda', () => {
    // dva obrisana ZADATAK slajda (7 i 8): slajdId null, zadatak.slajdId iz snimka
    expect(oznakeRundi([zadatakRunda(1, null, 7), zadatakRunda(2, null, 8)])).toEqual([
      { runda: 1, ukupno: 1 }, { runda: 1, ukupno: 1 },
    ]);
    // obrisan zadatak slajd 9 (grupa id 3) i živ slajd 3: ne spajaju se
    expect(oznakeRundi([zadatakRunda(1, null, 9), runda(2, 1, 3)])).toEqual([{ runda: 1, ukupno: 1 }, { runda: 1, ukupno: 1 }]);
    // isti zadatak slajd ponovljen posle brisanja: runde se spajaju po slajdId iz snimka
    expect(oznakeRundi([zadatakRunda(1, null, 7), zadatakRunda(2, null, 7)])).toEqual([
      { runda: 1, ukupno: 2 }, { runda: 2, ukupno: 2 },
    ]);
  });

  it('prazna lista', () => {
    expect(oznakeRundi([])).toEqual([]);
  });
});

describe('IzvodjenjePregledPage', () => {
  let http: HttpTestingController;

  function otvori(rezultati: IzvodjenjeRezultati, rang: RangTacnostiStavka[] = []): HTMLElement {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: new Map([['id', '5']]) } } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(IzvodjenjePregledPage);
    http.expectOne('api/izvodjenja/5/rezultati').flush(rezultati);
    http.expectOne('api/izvodjenja/5/rang').flush(rang);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  afterEach(() => http.verify());

  it('zaglavlje, karte pitanja, oznake rundi i rang-lista', () => {
    const el = otvori({
      izvodjenje: INFO, takmicenje: true,
      pitanja: [runda(1, 1, 10), runda(2, 1, 11, { procenatTacnih: null, brojOdgovora: 2 }), runda(3, 2, 10, { procenatTacnih: 100 })],
      rangLista: [{ mesto: 1, ucesnikId: 1, ime: 'Ana', poeni: 940 }, { mesto: 2, ucesnikId: 2, ime: 'Bojan', poeni: 700 }],
    });
    expect(el.querySelector('h1')?.textContent).toContain('Statika');
    const meta = el.querySelector('.uz-pr-meta')?.textContent ?? '';
    expect(meta).toContain('7.10.2026. 10:00');
    expect(meta).toContain('GD-2025 · 3. predavanje (7.10.2026.) · Greda');
    expect(meta).toContain('Učesnika: 4');

    const karte = Array.from(el.querySelectorAll('.uz-pr-karta:not([data-rang-tacnosti])'));
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

  it('tekst pitanja je app-tekst-formule (Markdown sa formulom), klase uz-md i uz-pr-tekst', () => {
    const r = runda(1, 1, 10);
    r.pitanje = snimak(60, 10, 'Koliko je **tačno** $1011_2$?');
    const el = otvori({ izvodjenje: INFO, takmicenje: false, pitanja: [r], rangLista: [] });
    const tekst = el.querySelector<HTMLElement>('app-tekst-formule.uz-pr-tekst')!;
    expect(tekst).not.toBeNull();
    expect(tekst.classList).toContain('uz-md');
    expect(tekst.querySelector('strong')?.textContent).toBe('tačno');
    expect(tekst.querySelector('span.uz-formula')?.textContent).toBe('$1011_2$');
  });

  it('zadatak runda i pitanje runda: obe kartice, putanja, rezultat po varijanti i tabela učesnika', () => {
    const el = otvori({ izvodjenje: INFO, takmicenje: false, pitanja: [zadatakRunda(1, 20, 20), runda(2, 1, 10)], rangLista: [] });
    const karte = Array.from(el.querySelectorAll('.uz-pr-karta:not([data-rang-tacnosti])'));
    expect(karte.length).toBe(2);
    expect(karte[0].querySelector('h2')?.textContent).toBe('Zadatak 1');
    expect(karte[1].querySelector('h2')?.textContent).toBe('Pitanje 2');
    expect(karte[0].textContent).toContain('Konverzije › 2 → 10');
    expect(karte[0].querySelector('app-zadatak-rezultat')).not.toBeNull();
    expect(karte[0].textContent).toContain('V1');
    expect(karte[0].textContent).toContain('Odgovora 2 · tačnih 50 %');
    const redovi = Array.from(karte[0].querySelectorAll('tbody tr')).map(tr => tr.textContent?.replace(/\s+/g, ' ').trim());
    expect(redovi[0]).toContain('Ana');
    expect(redovi[0]).toContain('45 ✓');
    expect(redovi[0]).not.toContain('a)');
    expect(redovi[0]).toContain('tačno');
    expect(redovi[1]).toContain('netačno');
    expect(karte[1].textContent).toContain('Koliko je 2 + 2?');
  });

  it('nivo runde i nivo varijante uz učesnika; runda od pre nivoa ih nema', () => {
    const nova = zadatakRunda(1, 20, 20);
    const stara = zadatakRunda(2, 21, 21);
    nova.zadatak = { ...nova.zadatak!, nivo: 3, nivoi: { '12': 3 } };
    stara.zadatak = { ...stara.zadatak!, nivo: null, nivoi: {} };
    const el = otvori({ izvodjenje: INFO, takmicenje: false, pitanja: [nova, stara], rangLista: [] });
    const karte = Array.from(el.querySelectorAll('.uz-pr-karta:not([data-rang-tacnosti])'));
    expect(karte[0].querySelector('[data-nivo-runde] [data-nivo-prikaz]')!.getAttribute('aria-label')).toBe('Nivo 3 od 3 (teži)');
    expect(karte[0].querySelector('tbody tr [data-nivo-varijante] [data-nivo-prikaz]')!.getAttribute('aria-label')).toBe('Nivo 3 od 3 (teži)');
    expect(karte[1].querySelector('[data-nivo-runde]')).toBeNull();
    expect(karte[1].querySelector('[data-nivo-varijante]')).toBeNull();
  });

  it('runda sa svim nivoima: "Svi nivoi" uz runde, nivoi varijanti po id-ju', () => {
    const r = zadatakRunda(1, 20, 20);
    r.zadatak = { ...r.zadatak!, nivo: null, nivoi: { '12': 2 } };
    const el = otvori({ izvodjenje: INFO, takmicenje: false, pitanja: [r], rangLista: [] });
    expect(el.querySelector('[data-nivo-runde] [data-nivo-prikaz]')!.getAttribute('aria-label')).toBe('Svi nivoi');
    expect(el.querySelector('tbody tr [data-nivo-varijante] [data-nivo-prikaz]')!.getAttribute('aria-label')).toBe('Nivo 2 od 3 (srednji)');
  });

  it('uneto po polju i ukupno: jedno polje bez oznake, više polja sa oznakom, redom šeme', () => {
    const z = pregledZadatka(7);
    expect(unetoUcesnika(z, z.ucesnici[0])).toEqual([{ kljuc: 'a', oznaka: null, vrednost: '45', tacno: true, formula: false }]);
    expect(unetoUcesnika(z, { ...z.ucesnici[0], polja: null, uneto: null })).toEqual([]);
    expect(unetoUcesnika(z, { ...z.ucesnici[1], uneto: null })[0].vrednost).toBe('—');
    expect(ishodUkupno({ ...z.ucesnici[0], odgovorio: false, tacno: null, polja: null, uneto: null })).toBe('bez odgovora');
    expect(ishodUkupno(z.ucesnici[1])).toBe('netačno');

    const polje = z.rezultat.varijante[0].polja[0];
    z.rezultat.varijante[0].polja = [
      { ...polje, oznaka: 'Dekadno' },
      { ...polje, kljuc: 'b', oznaka: 'Paran?', tip: 'JEDAN_TACAN', vrednosti: null, opcije: [{ id: 1, tekst: 'da', broj: 1, tacna: false }] },
    ];
    const u = { ...z.ucesnici[1], polja: { b: true, a: false }, uneto: { b: 'da', a: '44' } };
    expect(unetoUcesnika(z, u)).toEqual([
      { kljuc: 'a', oznaka: 'Dekadno', vrednost: '44', tacno: false, formula: false },
      { kljuc: 'b', oznaka: 'Paran?', vrednost: 'da', tacno: true, formula: true },
    ]);
  });

  it('kolona "Uneto": vrednost uz ✓/✗ i klasu tačno/netačno, bez oznake jedinog polja', () => {
    const el = otvori({ izvodjenje: INFO, takmicenje: false, pitanja: [zadatakRunda(1, 20, 20)], rangLista: [] });
    expect([...el.querySelectorAll('thead th')].map(th => th.textContent?.trim())).toContain('Uneto');
    const redovi = el.querySelectorAll('tbody tr');
    const prvi = redovi[0].querySelector('[data-uneto="a"]')!;
    expect(prvi.classList).toContain('uz-pr-uneto--tacno');
    expect(prvi.textContent!.replace(/\s+/g, ' ').trim()).toBe('45 ✓tačno');
    expect(prvi.querySelector('.uz-pr-uneto-oznaka')).toBeNull();
    const drugi = redovi[1].querySelector('[data-uneto="a"]')!;
    expect(drugi.classList).toContain('uz-pr-uneto--netacno');
    expect(drugi.textContent!.replace(/\s+/g, ' ').trim()).toBe('44 ✗netačno');
  });

  it('bez takmičenja nema rang-liste, ni kad server šalje učesnike', () => {
    const el = otvori({
      izvodjenje: INFO, takmicenje: false, pitanja: [runda(1, 1, 10)],
      rangLista: [{ mesto: 1, ucesnikId: 1, ime: 'Ana', poeni: 0 }],
    });
    expect(el.querySelectorAll('.uz-pr-karta:not([data-rang-tacnosti])').length).toBe(1);
    expect(el.textContent).not.toContain('Rang-lista');
    expect(el.textContent).not.toContain('Za poene važi');
  });

  it('takmičenje u kome niko nije dobio poene i dalje prikazuje rang-listu', () => {
    const el = otvori({
      izvodjenje: INFO, takmicenje: true, pitanja: [runda(1, 1, 10)],
      rangLista: [{ mesto: 1, ucesnikId: 1, ime: 'Ana', poeni: 0 }, { mesto: 2, ucesnikId: 2, ime: 'Bojan', poeni: 0 }],
    });
    const karte = Array.from(el.querySelectorAll('.uz-pr-karta:not([data-rang-tacnosti])'));
    expect(karte.length).toBe(2);
    expect(karte[1].querySelector('h2')?.textContent).toBe('Rang-lista');
    expect(karte[1].textContent).toContain('Ana');
    expect(karte[1].textContent).toContain('Bojan');
  });

  it('takmičenje bez učesnika: prazno stanje rang-liste', () => {
    const el = otvori({ izvodjenje: INFO, takmicenje: true, pitanja: [runda(1, 1, 10)], rangLista: [] });
    const karte = Array.from(el.querySelectorAll('.uz-pr-karta:not([data-rang-tacnosti])'));
    expect(karte[1].textContent).toContain('Još nema poena.');
  });

  it('izvođenje bez čuvanja: prazno stanje', () => {
    const el = otvori({ izvodjenje: { ...INFO, cuvanje: false, brojPitanja: 0, brojUcesnika: 0 }, takmicenje: false, pitanja: [], rangLista: [] });
    expect(el.textContent).toContain('Rezultati ovog izvođenja nisu čuvani.');
    expect(el.querySelector('.uz-pr-karta')).toBeNull();
  });

  it('rang tačnosti na vrhu: mesto, procenat i x/y, prosek, ★, link na studenta, gost', () => {
    const el = otvori({ izvodjenje: INFO, takmicenje: false, pitanja: [], rangLista: [] }, [
      { mesto: 1, ucesnikId: 1, studentId: 7, ime: 'Ana', gost: false, tacnih: 3, dugovanih: 3, odgovorenih: 3, procenat: 100,
        prosekMs: 3240, zvezdice: 5, poeni: null, izvodjenja: null, casova: null },
      { mesto: 2, ucesnikId: 2, studentId: null, ime: 'Mile', gost: true, tacnih: 1, dugovanih: 3, odgovorenih: 2, procenat: 33,
        prosekMs: null, zvezdice: 1, poeni: null, izvodjenja: null, casova: null },
    ]);
    const redovi = [...el.querySelectorAll('[data-rang-tacnosti] tbody tr')]
      .map(r => [...r.querySelectorAll('td')].map(td => td.textContent!.replace(/\s+/g, ' ').trim()).join(' | '));
    expect(redovi).toEqual(['1 | Ana | 100%3/3 | 3,2 s | 5', '2 | Mile gost | 33%1/3 | — | 1']);
    expect(el.querySelector('[data-rang-tacnosti] a')?.getAttribute('href')).toBe('/studenti/7');
  });

  it('sačuvano izvođenje bez pitanja', () => {
    const el = otvori({ izvodjenje: INFO, takmicenje: false, pitanja: [], rangLista: [] });
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
    http.expectOne('api/izvodjenja/5/rang').flush({ reason: 'Izvođenje nije pronađeno.' }, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role=alert]')?.textContent).toContain('Izvođenje nije pronađeno.');
  });
});
