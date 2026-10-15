import { TestBed } from '@angular/core/testing';
import { Rezultat, RezultatTekst } from '../data-access/uzivo.models';
import { RezultatPrikazComponent, oblakReci, procenti, procentiOpcija, velicinaReci } from './rezultat-prikaz.component';

const zbir = (niz: number[]) => niz.reduce((a, b) => a + b, 0);

describe('procenti', () => {
  it('[1,1,1] -> 33, 33, 34 u nekom redosledu, zbir 100', () => {
    const p = procenti([1, 1, 1]);
    expect(zbir(p)).toBe(100);
    expect([...p].sort((a, b) => a - b)).toEqual([33, 33, 34]);
  });

  it('[0,0] -> [0,0] (nema odgovora)', () => {
    expect(procenti([0, 0])).toEqual([0, 0]);
  });

  it('prazan niz -> prazan niz', () => {
    expect(procenti([])).toEqual([]);
  });

  it('tačni udeli se ne menjaju', () => {
    expect(procenti([2, 1, 1])).toEqual([50, 25, 25]);
    expect(procenti([3, 0])).toEqual([100, 0]);
  });

  it('ostatak ide opciji sa najvećim razlomljenim delom', () => {
    // 5/11 = 45.45, 3/11 = 27.27, 2/11 = 18.18, 1/11 = 9.09 -> 99 posle zaokruživanja naniže; +1 ide prvoj (.45)
    expect(procenti([5, 3, 2, 1])).toEqual([46, 27, 18, 9]);
    // 2/3 = 66.67, 1/3 = 33.33 -> 66 + 33 = 99; +1 ide prvoj (.67)
    expect(procenti([2, 1])).toEqual([67, 33]);
  });

  it('zbir je uvek 100 kad ima odgovora', () => {
    for (const niz of [[1, 1, 1, 1, 1, 1], [7, 3, 9, 1], [1, 0, 0, 0, 0, 2], [13, 17, 19, 23, 29, 31]]) {
      expect(zbir(procenti(niz))).toBe(100);
    }
  });
});

describe('procentiOpcija', () => {
  it('jedan tačan i anketa: udeo u zbiru glasova (zbir 100)', () => {
    expect(procentiOpcija('JEDAN_TACAN', [1, 1, 1], 3)).toEqual(procenti([1, 1, 1]));
    expect(procentiOpcija('ANKETA', [3, 1], 4)).toEqual([75, 25]);
  });

  it('više tačnih: udeo učesnika koji su izabrali opciju (zbir može preći 100)', () => {
    // 10 učesnika, svako bira više opcija
    expect(procentiOpcija('VISE_TACNIH', [9, 8, 2], 10)).toEqual([90, 80, 20]);
  });

  it('više tačnih bez odgovora -> nule', () => {
    expect(procentiOpcija('VISE_TACNIH', [0, 0, 0], 0)).toEqual([0, 0, 0]);
  });
});

describe('velicinaReci', () => {
  it('najređa reč je 1em, najčešća 3.2em', () => {
    expect(velicinaReci(1, 10)).toBe(1);
    expect(velicinaReci(10, 10)).toBe(3.2);
  });

  it('linearno između', () => {
    expect(velicinaReci(5.5, 10)).toBeCloseTo(2.1, 5);
    expect(velicinaReci(2, 3)).toBeCloseTo(2.1, 5);
  });

  it('kad su sve reči jednom (max 1) sve su 1em', () => {
    expect(velicinaReci(1, 1)).toBe(1);
  });

  it('vrednosti van opsega se ograničavaju', () => {
    expect(velicinaReci(0, 10)).toBe(1);
    expect(velicinaReci(25, 10)).toBe(3.2);
  });
});

describe('oblakReci', () => {
  const tekst = (tekst: string, broj: number, extra: Partial<RezultatTekst> = {}): RezultatTekst =>
    ({ kljuc: tekst.toLowerCase(), tekst, broj, sakriven: false, tacan: null, ...extra });

  it('najviše 60 reči, i to najčešćih', () => {
    const sve = Array.from({ length: 80 }, (_, i) => tekst('r' + i, 80 - i));
    const oblak = oblakReci(sve);
    expect(oblak.length).toBe(60);
    expect(Math.min(...oblak.map(r => r.broj))).toBe(21);
  });

  it('najčešća reč je u sredini, susedne do nje', () => {
    const oblak = oblakReci([tekst('a', 9), tekst('b', 7), tekst('c', 5), tekst('d', 3), tekst('e', 1)]);
    expect(oblak.map(r => r.tekst)).toEqual(['d', 'b', 'a', 'c', 'e']);
  });

  it('veličina po broju, najčešća 3.2em', () => {
    const oblak = oblakReci([tekst('a', 4), tekst('b', 1)]);
    const a = oblak.find(r => r.tekst === 'a')!;
    const b = oblak.find(r => r.tekst === 'b')!;
    expect(a.velicina).toBe(3.2);
    expect(b.velicina).toBe(1);
  });

  it('čuva oznake sakriven i tacan', () => {
    const [r] = oblakReci([tekst('x', 2, { sakriven: true, tacan: true })]);
    expect(r.sakriven).toBe(true);
    expect(r.tacan).toBe(true);
  });

  it('prazno -> prazno', () => {
    expect(oblakReci([])).toEqual([]);
  });
});

describe('RezultatPrikazComponent: formule', () => {
  async function prikazi(rezultat: Rezultat, tekstPrikaz: 'OBLAK' | 'LISTA' | null = null) {
    const fixture = TestBed.createComponent(RezultatPrikazComponent);
    fixture.componentRef.setInput('rezultat', rezultat);
    fixture.componentRef.setInput('tekstPrikaz', tekstPrikaz);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('tekst opcije u stubićima je app-tekst-formule (formula $11$)', async () => {
    const el = await prikazi({
      tip: 'JEDAN_TACAN', ukupno: 2, brojevi: null, tekstovi: null, skala: null,
      opcije: [{ id: 1, tekst: '$11$', broj: 1, tacna: true }, { id: 2, tekst: 'Deset', broj: 1, tacna: false }],
    });
    const tekstovi = el.querySelectorAll('.uz-rez-opcija-tekst app-tekst-formule');
    expect(tekstovi.length).toBe(2);
    expect(tekstovi[0].querySelector('span.uz-formula')?.textContent).toBe('$11$');
    expect(tekstovi[1].textContent).toBe('Deset');
    expect(el.querySelector('.uz-rez-opcija-tekst')?.textContent).toContain('✓ tačno');
  });

  it('tačna opcija bez formule: razmak između značke "✓ tačno" i teksta (čitač ekrana, kopiranje)', async () => {
    const el = await prikazi({
      tip: 'JEDAN_TACAN', ukupno: 2, brojevi: null, tekstovi: null, skala: null,
      opcije: [{ id: 1, tekst: '$11$', broj: 1, tacna: false }, { id: 2, tekst: 'Deset', broj: 1, tacna: true }],
    });
    const tacna = el.querySelector('.uz-rez-opcija--tacna .uz-rez-opcija-tekst')!;
    expect(tacna.textContent).toContain('✓ tačno Deset');
  });

  it('značka "✓ tačno" je van bloka formule (brat domaćina, ne u njemu): uživo stigla značka suzi blok, merenje to vidi', async () => {
    const el = await prikazi({
      tip: 'JEDAN_TACAN', ukupno: 2, brojevi: null, tekstovi: null, skala: null,
      opcije: [{ id: 1, tekst: '$11$', broj: 1, tacna: true }, { id: 2, tekst: 'Deset', broj: 1, tacna: false }],
    });
    const znak = el.querySelector('.uz-rez-opcija--tacna .uz-tacno-znak')!;
    expect(znak.parentElement!.classList).toContain('uz-rez-opcija-tekst');
    expect(znak.closest('app-tekst-formule')).toBeNull();
    expect(znak.parentElement!.querySelector(':scope > app-tekst-formule.uz-rez-opcija-formula')).not.toBeNull();
  });

  it('kratki odgovori (oblak i lista) ostaju običan tekst: $x$ nije formula (odgovori studenata)', async () => {
    const tekstovi: RezultatTekst[] = [{ kljuc: 'x', tekst: '$x$', broj: 2, sakriven: false, tacan: null }];
    const rezultat: Rezultat = { tip: 'KRATAK_TEKST', ukupno: 2, opcije: null, brojevi: null, tekstovi, skala: null };
    const oblak = await prikazi(rezultat);
    expect(oblak.querySelector('app-tekst-formule')).toBeNull();
    expect(oblak.querySelector('.uz-formula')).toBeNull();
    expect(oblak.textContent).toContain('$x$');
    const lista = await prikazi(rezultat, 'LISTA');
    expect(lista.querySelector('app-tekst-formule')).toBeNull();
    expect(lista.textContent).toContain('$x$');
  });
});
