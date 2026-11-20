import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { JavnoPitanje, JavnoStanje, LicnoStanje } from '../data-access/uzivo.models';
import { IshodPitanja, StudentStore, TacanOdgovor } from './student.store';
import { naslovUdela, opisUdela, stanjaOpcija } from './ishod-vise-tacnih';
import { IshodViseTacnihComponent } from './ishod-vise-tacnih.component';

/** Četiri opcije A-D (id 1-4); tačne su A i B. */
const OPCIJE = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
const TACNE = [1, 2];

describe('stanjaOpcija', () => {
  it.each([
    [[1], ['pogodjena', 'propustena', 'ostala', 'ostala']],
    [[1, 3], ['pogodjena', 'propustena', 'pogresna', 'ostala']],
    [[1, 2], ['pogodjena', 'pogodjena', 'ostala', 'ostala']],
    [[4], ['propustena', 'propustena', 'ostala', 'pogresna']],
    [[], ['propustena', 'propustena', 'ostala', 'ostala']],
  ] as const)('izabrane %j -> %j', (izabrane, ocekivano) => {
    expect(stanjaOpcija(OPCIJE, TACNE, izabrane)).toEqual(ocekivano);
  });
});

describe('naslovUdela', () => {
  it.each([
    [1, 'Tačno!'], [0.5, 'Delimično tačno'], [0.33, 'Delimično tačno'], [0, 'Netačno'],
  ] as const)('%d -> %s', (udeo, ocekivano) => {
    expect(naslovUdela(udeo)).toBe(ocekivano);
  });
});

describe('opisUdela', () => {
  it('četiri teksta: svi tačni, deo tačnih, deo tačnih uz pogrešan, nijedan tačan', () => {
    expect(opisUdela(TACNE, [1, 2])).toBe('Svi tačni odgovori.');
    expect(opisUdela(TACNE, [2])).toBe('Pogodio si 1 od 2 tačna.');
    expect(opisUdela(TACNE, [1, 3])).toBe('Pogodio si 1 od 2 tačna, ali pogrešan izbor poništava jedan tačan.');
    expect(opisUdela(TACNE, [3])).toBe('Nisi pogodio nijedan tačan.');
  });

  it('oba tačna uz pogrešan: deo tačnih uz pogrešan; više pogrešnih i oblik reči uz broj tačnih', () => {
    expect(opisUdela(TACNE, [1, 2, 3])).toBe('Pogodio si 2 od 2 tačna, ali pogrešan izbor poništava jedan tačan.');
    expect(opisUdela([1, 2, 3], [1, 4, 5])).toBe('Pogodio si 1 od 3 tačna, ali svaki pogrešan izbor poništava jedan tačan.');
    expect(opisUdela([1, 2, 3, 4, 5], [1])).toBe('Pogodio si 1 od 5 tačnih.');
  });
});

describe('IshodViseTacnihComponent', () => {
  function pitanje(izmene: Partial<JavnoPitanje> = {}): JavnoPitanje {
    return {
      tip: 'VISE_TACNIH', faza: 'ZATVORENO', rundaId: 9, brojOpcija: 4,
      opcije: [
        { id: 1, tekst: 'Enter' }, { id: 2, tekst: 'Ctrl + Enter' }, { id: 3, tekst: 'Razmak' }, { id: 4, tekst: '$x^2$' },
      ],
      tekst: null, slikaId: null, jedinica: null, skalaMinOznaka: null, skalaMaxOznaka: null, rokMs: null, preostaloMs: null,
      tacneOpcije: [2, 4], tacanBroj: null, prihvatljiviOdgovori: null,
      ...izmene,
    };
  }

  function napravi(
    p: JavnoPitanje, ishod: IshodPitanja | null, takmicenje = false, tacan: TacanOdgovor | null = null, mesto: number | null = null,
  ): HTMLElement {
    const lazni = {
      pitanje: signal(p), ishod: signal(ishod), javno: signal({ takmicenje } as JavnoStanje),
      licno: signal<LicnoStanje | null>(mesto ? { mesto, poeni: 1250 } as LicnoStanje : null),
      tacan: signal<TacanOdgovor | null>(tacan),
    };
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), { provide: StudentStore, useValue: lazni }],
    });
    const f = TestBed.createComponent(IshodViseTacnihComponent);
    f.detectChanges();
    return f.nativeElement as HTMLElement;
  }

  const stanja = (el: HTMLElement) => Array.from(el.querySelectorAll('li')).map(li => li.getAttribute('data-stanje'));

  it('delimično: naslov ćilibar sa poenima, opis, stavke redom pogođena, pogrešna, propuštena, ostale', () => {
    const el = napravi(pitanje(), { odgovorio: true, tacno: false, poeni: 425, udeo: 0.5, izabrane: [2] }, true);
    const naslov = el.querySelector('[data-naslov]')!;
    expect(naslov.textContent!.trim()).toBe('Delimično tačno +425');
    expect(naslov.classList).toContain('uz-st-pola');
    expect(el.querySelector('[data-opis]')!.textContent!.trim()).toBe('Pogodio si 1 od 2 tačna.');
    expect(stanja(el)).toEqual(['pogodjena', 'propustena', 'ostala', 'ostala']);
    const li = el.querySelectorAll('li');
    expect(li[0].textContent).toContain('✓ Tvoj izbor, tačno');
    expect(li[0].textContent).toContain('Ctrl + Enter');
    expect(li[1].textContent).toContain('○ I ovo je tačno, nisi zaokružio');
    // formula u tekstu opcije ide kroz app-tekst-formule
    expect(li[1].querySelector('app-tekst-formule span.uz-formula')?.textContent).toBe('$x^2$');
    // ostale opcije: bez reda stanja
    expect(li[2].querySelector('[data-oznaka-stanja]')).toBeNull();
    expect(li[0].querySelector('app-opcija-oblik')?.getAttribute('aria-label')).toBe('B, plavi romb');
  });

  it('pogrešan izbor: "Netačno" crveno, stavka "✗ Tvoj izbor, nije tačno" posle pogođene', () => {
    const el = napravi(pitanje(), { odgovorio: true, tacno: false, poeni: 0, udeo: 0, izabrane: [2, 3] });
    const naslov = el.querySelector('[data-naslov]')!;
    expect(naslov.textContent!.trim()).toBe('Netačno');
    expect(naslov.classList).toContain('uz-st-lose');
    expect(el.querySelector('[data-opis]')!.textContent!.trim())
      .toBe('Pogodio si 1 od 2 tačna, ali pogrešan izbor poništava jedan tačan.');
    expect(stanja(el)).toEqual(['pogodjena', 'pogresna', 'propustena', 'ostala']);
    expect(el.querySelectorAll('li')[1].textContent).toContain('✗ Tvoj izbor, nije tačno');
  });

  it('sve tačne: "Tačno!" zeleno, "Svi tačni odgovori."', () => {
    const el = napravi(pitanje(), { odgovorio: true, tacno: true, poeni: 900, udeo: 1, izabrane: [4, 2] });
    const naslov = el.querySelector('[data-naslov]')!;
    expect(naslov.textContent!.trim()).toBe('Tačno!');
    expect(naslov.classList).toContain('uz-st-ok');
    expect(el.querySelector('[data-opis]')!.textContent!.trim()).toBe('Svi tačni odgovori.');
  });

  it('režim "samo dugmad" (opcije bez teksta): samo oblik i slovo, nijedan tekst opcije', () => {
    const p = pitanje({ opcije: [1, 2, 3, 4].map(id => ({ id, tekst: null })) });
    const el = napravi(p, { odgovorio: true, tacno: false, poeni: null, udeo: 0.5, izabrane: [2] });
    expect(el.querySelectorAll('li app-opcija-oblik').length).toBe(4);
    expect(el.querySelector('app-tekst-formule')).toBeNull();
    expect(stanja(el)).toEqual(['pogodjena', 'propustena', 'ostala', 'ostala']);
  });

  it('bez udela (stari backend): udeo iz tacno', () => {
    const el = napravi(pitanje(), { odgovorio: true, tacno: false, poeni: null, izabrane: [2] });
    const naslov = el.querySelector('[data-naslov]')!;
    expect(naslov.textContent!.trim()).toBe('Netačno');
    expect(naslov.classList).toContain('uz-st-lose');
  });

  it('druga pitanja (i više tačnih bez izabranih): naslov ishoda i "Tačan odgovor:" kao ranije; mesto u takmičenju', () => {
    const tacan: TacanOdgovor = { opcije: [{ indeks: 1, tekst: 'Rim' }], tekst: null };
    const el = napravi(pitanje({ tip: 'JEDAN_TACAN', tacneOpcije: [2] }), { odgovorio: true, tacno: true, poeni: 850 }, true, tacan, 2);
    expect(el.querySelector('ul')).toBeNull();
    const naslov = el.querySelector('p.uz-st-veliko')!;
    expect(naslov.textContent!.trim()).toBe('Tačno! +850');
    expect(naslov.classList).toContain('uz-st-ok');
    expect(el.textContent).toContain('Tačan odgovor:');
    expect(el.querySelector('.uz-st-tacna')?.textContent).toContain('Rim');
    expect(el.querySelector('.uz-st-mesto')?.textContent).toBe('Tvoje mesto: 2 · 1\u00a0250');

    TestBed.resetTestingModule();
    const el2 = napravi(pitanje(), { odgovorio: false, tacno: null, poeni: null }, false, tacan);
    expect(el2.querySelector('ul')).toBeNull();
    expect(el2.querySelector('p.uz-st-veliko')!.textContent!.trim()).toBe('Nisi odgovorio');
    expect(el2.querySelector('.uz-st-mesto')).toBeNull();
  });
});
