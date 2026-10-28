import { TestBed } from '@angular/core/testing';
import { Rezultat, RezultatTekst } from '../data-access/uzivo.models';
import {
  MAKS_CIPOVA, OpisPitanja, RezultatPrikazComponent, cipoviRezultata, gustinaCipova, oblakReci, procenti, procentiOpcija,
  tacnihTekst, velicinaReci, vrstaRezultata,
} from './rezultat-prikaz.component';

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

const BEZ_TACNOG: OpisPitanja = { tekstPrikaz: null, jedinica: null, prihvatljiviOdgovori: null, brojTacno: null };
const tekstOdg = (tekst: string, broj: number, tacan: boolean | null = null, sakriven = false): RezultatTekst =>
  ({ kljuc: tekst.toLowerCase(), tekst, broj, sakriven, tacan });
const brojRez = (vrednosti: [number, number, boolean | null][], tacnih: number | null): Rezultat => ({
  tip: 'BROJ', ukupno: vrednosti.reduce((s, v) => s + v[1], 0), opcije: null, tekstovi: null, skala: null, tacnih,
  brojevi: { vrednosti: vrednosti.map(([vrednost, broj, tacan]) => ({ vrednost, broj, tacan })) },
});
const tekstRez = (tekstovi: RezultatTekst[], tacnih: number | null): Rezultat => ({
  tip: 'KRATAK_TEKST', ukupno: tekstovi.reduce((s, t) => s + t.broj, 0), opcije: null, brojevi: null, skala: null, tekstovi, tacnih,
});

describe('vrstaRezultata', () => {
  it('broj: uvek čipovi (i procena bez tačne vrednosti)', () => {
    expect(vrstaRezultata('BROJ', null)).toBe('cipovi');
    expect(vrstaRezultata('BROJ', { ...BEZ_TACNOG, brojTacno: 4 })).toBe('cipovi');
  });

  it('kratak tekst: sa prihvatljivim čipovi (bez obzira na tekstPrikaz), bez njih oblak ili lista', () => {
    expect(vrstaRezultata('KRATAK_TEKST', { ...BEZ_TACNOG, prihvatljiviOdgovori: ['Njutn'], tekstPrikaz: 'LISTA' })).toBe('cipovi');
    expect(vrstaRezultata('KRATAK_TEKST', { ...BEZ_TACNOG, prihvatljiviOdgovori: [] })).toBe('oblak');
    expect(vrstaRezultata('KRATAK_TEKST', { ...BEZ_TACNOG, tekstPrikaz: 'LISTA' })).toBe('lista');
    expect(vrstaRezultata('KRATAK_TEKST', null)).toBe('oblak');
  });

  it('opcije i skala nepromenjeni', () => {
    expect(vrstaRezultata('VISE_TACNIH', null)).toBe('opcije');
    expect(vrstaRezultata('SKALA', null)).toBe('skala');
  });
});

describe('cipoviRezultata', () => {
  const sa = (c: ReturnType<typeof cipoviRezultata>) => c.map(x => [x.tekst, x.broj, x.stanje]);

  it('broj pre C: sve vrednosti neutralne, sa svim decimalama i jedinicom, redom servera (najčešće prve)', () => {
    const r = brojRez([[12, 3, null], [3.14159, 1, null], [1234.5, 1, null]], null);
    expect(sa(cipoviRezultata(r, { ...BEZ_TACNOG, jedinica: 'm', brojTacno: 3.14159 }))).toEqual([
      ['12 m', 3, null], ['3,14159 m', 1, null], ['1\u00a0234,5 m', 1, null],
    ]);
  });

  it('broj posle C: tačni prvi, ostali netačni', () => {
    const r = brojRez([[12, 3, false], [10, 2, true], [10.5, 1, true]], 3);
    expect(sa(cipoviRezultata(r, { ...BEZ_TACNOG, brojTacno: 10 }))).toEqual([
      ['10', 2, 'tacno'], ['10,5', 1, 'tacno'], ['12', 3, 'netacno'],
    ]);
  });

  it('broj posle C kad niko nije pogodio: čip tačne vrednosti sa 0 ("niko"), prvi', () => {
    const r = brojRez([[12, 2, false]], 0);
    expect(sa(cipoviRezultata(r, { ...BEZ_TACNOG, brojTacno: 9.81, jedinica: 'm/s²' }))).toEqual([
      ['9,81 m/s²', 0, 'tacno'], ['12 m/s²', 2, 'netacno'],
    ]);
  });

  it('bez odgovora nema čipa "niko" (ni posle C, ni u konzoli pre prvog odgovora)', () => {
    expect(cipoviRezultata(brojRez([], 0), { ...BEZ_TACNOG, brojTacno: 9.81 })).toEqual([]);
  });

  it('procena (bez tačne vrednosti): neutralno i bez čipa "niko"', () => {
    const r = brojRez([[5, 1, null]], null);
    expect(sa(cipoviRezultata(r, BEZ_TACNOG))).toEqual([['5', 1, null]]);
  });

  it('kratak tekst sa prihvatljivim: posle C ✓/✗, sakriven ostaje označen (nastavnički), "niko" kad nijedan nije tačan', () => {
    const p = { ...BEZ_TACNOG, prihvatljiviOdgovori: ['Njutn', 'Newton'] };
    const r = tekstRez([tekstOdg('Beton', 3, true), tekstOdg('Njutn', 2, true), tekstOdg('Ruzno', 1, false, true)], 2);
    const c = cipoviRezultata({ ...r, tekstovi: [tekstOdg('Beton', 3, false), tekstOdg('Njutn', 2, true), tekstOdg('Ruzno', 1, false, true)] }, p);
    expect(sa(c)).toEqual([['Njutn', 2, 'tacno'], ['Beton', 3, 'netacno'], ['Ruzno', 1, 'netacno']]);
    expect(c[2].sakriven).toBe(true);
    const niko = cipoviRezultata(tekstRez([tekstOdg('Beton', 1, false)], 0), p);
    expect(sa(niko)).toEqual([['Njutn, Newton', 0, 'tacno'], ['Beton', 1, 'netacno']]);
  });

  it('kratak tekst pre C: neutralno, bez čipa "niko" (javni rezultat ne odaje tačan)', () => {
    const p = { ...BEZ_TACNOG, prihvatljiviOdgovori: ['Njutn'] };
    expect(sa(cipoviRezultata(tekstRez([tekstOdg('Beton', 1)], null), p))).toEqual([['Beton', 1, null]]);
  });
});

describe('tacnihTekst i gustinaCipova', () => {
  it('"Tačno x od y · N %" samo kad je tačnost vidljiva i ima odgovora', () => {
    expect(tacnihTekst(brojRez([[1, 7, true], [2, 5, false]], 7))).toBe('Tačno 7 od 12 · 58 %');
    expect(tacnihTekst(brojRez([[1, 1, null]], null))).toBeNull();
    expect(tacnihTekst(brojRez([], 0))).toBeNull();
  });

  it('gustina po broju čipova', () => {
    expect([1, 4, 5, 12, 13, 20, 21, MAKS_CIPOVA + 1].map(gustinaCipova))
      .toEqual(['malo', 'malo', 'srednje', 'srednje', 'mnogo', 'mnogo', 'vrlo', 'vrlo']);
  });
});

describe('RezultatPrikazComponent: čipovi i tačnih', () => {
  async function prikazi(rezultat: Rezultat, pitanje: OpisPitanja | null, prikaziTacnih = true) {
    const fixture = TestBed.createComponent(RezultatPrikazComponent);
    fixture.componentRef.setInput('rezultat', rezultat);
    fixture.componentRef.setInput('pitanje', pitanje);
    fixture.componentRef.setInput('prikaziTacnih', prikaziTacnih);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }
  const tekst = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

  it('broj: čipovi umesto medijane, broj u zagradi tek kad je više od jednog', async () => {
    const el = await prikazi(brojRez([[199, 2, null], [198, 1, null]], null), BEZ_TACNOG);
    expect([...el.querySelectorAll('.uz-co-cip')].map(tekst)).toEqual(['199 (2)', '198']);
    expect(tekst(el)).not.toContain('Medijana');
    expect(el.querySelector('.uz-rez-tacnih')).toBeNull();
    expect(el.querySelector('app-cipovi-odgovora')?.getAttribute('data-gustina')).toBe('malo');
  });

  it('posle C: red "Tačno x od y · N %", tačan čip prvi sa ✓, netačan sa ✗; pregled ga gasi', async () => {
    const r = brojRez([[12, 1, false], [10, 3, true]], 3);
    const el = await prikazi(r, { ...BEZ_TACNOG, brojTacno: 10 });
    expect(tekst(el.querySelector('.uz-rez-tacnih'))).toBe('✓Tačno 3 od 4 · 75 %');
    const cipovi = el.querySelectorAll('.uz-co-cip');
    expect(cipovi[0].classList).toContain('uz-co-cip--tacno');
    expect(tekst(cipovi[0])).toBe('✓tačno: 10 (3)');
    expect(cipovi[1].classList).toContain('uz-co-cip--netacno');
    const pregled = await prikazi(r, { ...BEZ_TACNOG, brojTacno: 10 }, false);
    expect(pregled.querySelector('.uz-rez-tacnih')).toBeNull();
  });

  it('opcije posle C: red "Tačno x od y · N %" iz servera (i za više tačnih)', async () => {
    const el = await prikazi({
      tip: 'VISE_TACNIH', ukupno: 5, brojevi: null, tekstovi: null, skala: null, tacnih: 2,
      opcije: [{ id: 1, tekst: 'A', broj: 4, tacna: true }, { id: 2, tekst: 'B', broj: 3, tacna: false }],
    }, BEZ_TACNOG);
    expect(tekst(el.querySelector('.uz-rez-tacnih'))).toBe('✓Tačno 2 od 5 · 40 %');
  });

  it(`više od ${MAKS_CIPOVA} različitih: prvih ${MAKS_CIPOVA} i "+N drugih (M)", tačan se ne odseca`, async () => {
    const vrednosti: [number, number, boolean | null][] = Array.from({ length: 40 }, (_, i) => [i + 1, 1, false]);
    vrednosti.push([99, 1, true]);
    const el = await prikazi(brojRez(vrednosti, 1), { ...BEZ_TACNOG, brojTacno: 99 });
    const cipovi = [...el.querySelectorAll('.uz-co-cip')];
    expect(cipovi.length).toBe(MAKS_CIPOVA + 1);
    expect(tekst(cipovi[0])).toContain('99');
    expect(tekst(cipovi[cipovi.length - 1])).toBe('+11 drugih (11), 11 odgovora');
    expect(el.querySelector('app-cipovi-odgovora')?.getAttribute('data-gustina')).toBe('vrlo');
  });

  it('kratak tekst sa prihvatljivim: čipovi i kad je tekstPrikaz OBLAK; bez prihvatljivih oblak', async () => {
    const r = tekstRez([tekstOdg('Njutn', 2, true), tekstOdg('Beton', 1, false)], 2);
    const el = await prikazi(r, { ...BEZ_TACNOG, tekstPrikaz: 'OBLAK', prihvatljiviOdgovori: ['Njutn'] });
    expect(el.querySelector('.uz-rez-oblak')).toBeNull();
    expect([...el.querySelectorAll('.uz-co-cip')].map(tekst)).toEqual(['✓tačno: Njutn (2)', '✗netačno: Beton']);
    const otvoreno = await prikazi(tekstRez([tekstOdg('Beton', 1)], null), { ...BEZ_TACNOG, tekstPrikaz: 'OBLAK' });
    expect(otvoreno.querySelector('.uz-rez-oblak')).not.toBeNull();
    expect(otvoreno.querySelector('.uz-co-cip')).toBeNull();
  });

  it('bez odgovora: "Još nema odgovora."', async () => {
    const el = await prikazi(brojRez([], null), BEZ_TACNOG);
    expect(tekst(el)).toBe('Još nema odgovora.');
  });
});

describe('RezultatPrikazComponent: formule', () => {
  async function prikazi(rezultat: Rezultat, tekstPrikaz: 'OBLAK' | 'LISTA' | null = null) {
    const fixture = TestBed.createComponent(RezultatPrikazComponent);
    fixture.componentRef.setInput('rezultat', rezultat);
    fixture.componentRef.setInput('pitanje', { ...BEZ_TACNOG, tekstPrikaz });
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('tekst opcije u stubićima je app-tekst-formule (formula $11$)', async () => {
    const el = await prikazi({
      tip: 'JEDAN_TACAN', ukupno: 2, brojevi: null, tekstovi: null, skala: null, tacnih: 1,
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
      tip: 'JEDAN_TACAN', ukupno: 2, brojevi: null, tekstovi: null, skala: null, tacnih: 1,
      opcije: [{ id: 1, tekst: '$11$', broj: 1, tacna: false }, { id: 2, tekst: 'Deset', broj: 1, tacna: true }],
    });
    const tacna = el.querySelector('.uz-rez-opcija--tacna .uz-rez-opcija-tekst')!;
    expect(tacna.textContent).toContain('✓ tačno Deset');
  });

  it('značka "✓ tačno" je van bloka formule (brat domaćina, ne u njemu): uživo stigla značka suzi blok, merenje to vidi', async () => {
    const el = await prikazi({
      tip: 'JEDAN_TACAN', ukupno: 2, brojevi: null, tekstovi: null, skala: null, tacnih: 1,
      opcije: [{ id: 1, tekst: '$11$', broj: 1, tacna: true }, { id: 2, tekst: 'Deset', broj: 1, tacna: false }],
    });
    const znak = el.querySelector('.uz-rez-opcija--tacna .uz-tacno-znak')!;
    expect(znak.parentElement!.classList).toContain('uz-rez-opcija-tekst');
    expect(znak.closest('app-tekst-formule')).toBeNull();
    expect(znak.parentElement!.querySelector(':scope > app-tekst-formule.uz-rez-opcija-formula')).not.toBeNull();
  });

  it('kratki odgovori (oblak i lista) ostaju običan tekst: $x$ nije formula (odgovori studenata)', async () => {
    const tekstovi: RezultatTekst[] = [{ kljuc: 'x', tekst: '$x$', broj: 2, sakriven: false, tacan: null }];
    const rezultat: Rezultat = { tip: 'KRATAK_TEKST', ukupno: 2, opcije: null, brojevi: null, tekstovi, skala: null, tacnih: null };
    const oblak = await prikazi(rezultat);
    expect(oblak.querySelector('app-tekst-formule')).toBeNull();
    expect(oblak.querySelector('.uz-formula')).toBeNull();
    expect(oblak.textContent).toContain('$x$');
    const lista = await prikazi(rezultat, 'LISTA');
    expect(lista.querySelector('app-tekst-formule')).toBeNull();
    expect(lista.textContent).toContain('$x$');
  });
});
