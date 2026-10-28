import { TestBed } from '@angular/core/testing';
import { Cip, CipoviOdgovoraComponent, drugih, ograniciCipove, poredjajCipove } from './cipovi-odgovora.component';

const cip = (tekst: string, broj: number, stanje: Cip['stanje'] = null): Cip => ({ kljuc: tekst, tekst, broj, stanje, formula: false });

describe('poredjajCipove', () => {
  it('tačni prvi, pa najčešći, pa redom kojim su stigli', () => {
    const p = poredjajCipove([cip('a', 1, 'netacno'), cip('b', 3, 'netacno'), cip('c', 1, 'tacno'), cip('d', 1, 'netacno')]);
    expect(p.map(c => c.tekst)).toEqual(['c', 'b', 'a', 'd']);
  });
});

describe('ograniciCipove', () => {
  it('ispod granice svi, bez ostatka; null = bez granice', () => {
    expect(ograniciCipove([cip('a', 1)], 3)).toEqual({ prikazani: [cip('a', 1)], ostatak: null });
    expect(ograniciCipove([cip('a', 1), cip('b', 1)], null).prikazani.length).toBe(2);
  });

  it('preko granice: prvih maks, ostatak sabran (vrednosti i učesnici)', () => {
    const { prikazani, ostatak } = ograniciCipove([cip('a', 5), cip('b', 2), cip('c', 2), cip('d', 1)], 2);
    expect(prikazani.map(c => c.tekst)).toEqual(['a', 'b']);
    expect(ostatak).toEqual({ vrednosti: 2, odgovora: 3 });
  });

  it('tačni se nikad ne odsecaju, ni kad ih je više od granice', () => {
    const { prikazani, ostatak } = ograniciCipove([cip('t1', 1, 'tacno'), cip('t2', 1, 'tacno'), cip('n', 9, 'netacno')], 1);
    expect(prikazani.map(c => c.tekst)).toEqual(['t1', 't2']);
    expect(ostatak).toEqual({ vrednosti: 1, odgovora: 9 });
  });
});

describe('drugih', () => {
  it('srpski oblik uz broj', () => {
    expect([1, 2, 4, 5, 11, 12, 21, 22, 25].map(drugih))
      .toEqual(['+1 drugi', '+2 druga', '+4 druga', '+5 drugih', '+11 drugih', '+12 drugih', '+21 drugi', '+22 druga', '+25 drugih']);
  });
});

describe('CipoviOdgovoraComponent', () => {
  async function prikazi(cipovi: Cip[], maks: number | null = null) {
    const fixture = TestBed.createComponent(CipoviOdgovoraComponent);
    fixture.componentRef.setInput('cipovi', cipovi);
    fixture.componentRef.setInput('maks', maks);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }
  const tekst = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();

  it('broj u zagradi tek kad je više od jednog, "niko" za 0, ✓/✗ sa tekstom za čitač, sakriven označen', async () => {
    const s = { ...cip('s', 1, 'netacno'), sakriven: true };
    const el = await prikazi([cip('10', 0, 'tacno'), cip('12', 3, 'netacno'), cip('7', 1), s]);
    expect([...el.querySelectorAll('.uz-co-cip')].map(tekst)).toEqual(['✓tačno: 10 niko', '✗netačno: 12 (3)', '7', '✗netačno: s , sakriveno']);
    expect(el.querySelectorAll('.uz-co-cip--sakriven').length).toBe(1);
  });

  it('ostatak kao jedan čip "+N drugih (M)"', async () => {
    const el = await prikazi([cip('a', 2), cip('b', 1), cip('c', 1)], 1);
    const cipovi = [...el.querySelectorAll('.uz-co-cip')];
    expect(cipovi.length).toBe(2);
    expect(cipovi[1].classList).toContain('uz-co-cip--ostatak');
    expect(tekst(cipovi[1])).toBe('+2 druga (2), 2 odgovora');
  });
});
