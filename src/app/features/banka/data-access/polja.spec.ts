import { describe, expect, it } from 'vitest';

import type { OdgovorPolja, Polje } from './banka.models';
import { novaOpcija, novoPolje, odgovorPopunjen, prazanOdgovor, prazniOdgovori, proveriPolja } from './polja';

/** Ispravno polje tipa BROJ; `izmena` menja samo ono što test proverava. */
function broj(kljuc: string, izmena: Partial<Polje> = {}): Polje {
  return { ...novoPolje('BROJ', []), kljuc, oznaka: `Rezultat ${kljuc}`, ...izmena };
}

function izbor(tip: 'JEDAN_TACAN' | 'VISE_TACNIH', kljuc = 'a'): Polje {
  return {
    ...novoPolje(tip, []),
    kljuc,
    oznaka: 'Koji su tačni?',
    opcije: [{ id: 1, tekst: 'Prva' }, { id: 2, tekst: 'Druga' }, { id: 5, tekst: 'Peta' }],
  };
}

const odgovor = (izmena: Partial<OdgovorPolja>): OdgovorPolja => ({ broj: null, prihvatljivi: null, tacna: null, tacne: null, ...izmena });

describe('novoPolje', () => {
  it('prvi slobodan ključ je "a", pa "b" ... i preskače zauzete', () => {
    expect(novoPolje('BROJ', []).kljuc).toBe('a');
    expect(novoPolje('BROJ', [broj('a')]).kljuc).toBe('b');
    expect(novoPolje('BROJ', [broj('a'), broj('c')]).kljuc).toBe('b');
    const deset = 'abcdefghi'.split('').map(k => broj(k));
    expect(novoPolje('BROJ', deset).kljuc).toBe('j');
  });

  it('podrazumevane vrednosti su one koje bi server upisao (isti oblik pre i posle prvog čuvanja)', () => {
    expect(novoPolje('BROJ', [])).toEqual({
      kljuc: 'a', oznaka: '', tip: 'BROJ', odstupanje: 0, odstupanjeTip: 'APSOLUTNO', jedinica: null,
      zanemariVelicinu: true, zanemariRazmake: true, opcije: null,
    });
    expect(novoPolje('TEKST', []).opcije).toBeNull();
  });

  it('JEDAN_TACAN i VISE_TACNIH kreću sa dve prazne opcije sa id-jevima 1 i 2', () => {
    for (const tip of ['JEDAN_TACAN', 'VISE_TACNIH'] as const) {
      expect(novoPolje(tip, []).opcije).toEqual([{ id: 1, tekst: '' }, { id: 2, tekst: '' }]);
    }
  });
});

describe('novaOpcija', () => {
  it('id je najveći postojeći + 1 (id obrisane opcije se ne vraća među ostale), prvi je 1', () => {
    expect(novaOpcija([])).toEqual({ id: 1, tekst: '' });
    expect(novaOpcija([{ id: 1, tekst: 'a' }, { id: 4, tekst: 'b' }])).toEqual({ id: 5, tekst: '' });
  });
});

describe('proveriPolja', () => {
  it('prazna šema i ispravna polja su bez greške', () => {
    expect(proveriPolja([])).toBeNull();
    expect(proveriPolja([broj('a'), broj('b'), izbor('JEDAN_TACAN', 'c'), izbor('VISE_TACNIH', 'd')])).toBeNull();
  });

  it('najviše 10 polja', () => {
    const jedanaest = 'abcdefghijk'.split('').map(k => broj(k));
    expect(proveriPolja(jedanaest)).toBe('Najviše 10 polja.');
    expect(proveriPolja(jedanaest.slice(0, 10))).toBeNull();
  });

  it('ključ: 1-10 malih slova i cifara, počinje slovom', () => {
    const poruka = 'Ključ polja mora biti 1-10 malih slova i cifara i počinjati slovom.';
    for (const kljuc of ['', '1a', 'A', 'a_b', 'a b', 'abcdefghijk', 'č']) {
      expect(proveriPolja([broj(kljuc)]), JSON.stringify(kljuc)).toBe(poruka);
    }
    for (const kljuc of ['a', 'x1', 'abcdefghij', 'a1b2c3d4e5']) {
      expect(proveriPolja([broj(kljuc)]), kljuc).toBeNull();
    }
  });

  it('ključ se proverava posle skidanja razmaka sa krajeva, kao na serveru', () => {
    expect(proveriPolja([broj(' a ')])).toBeNull();
    expect(proveriPolja([broj('a'), broj(' a')])).toBe("Ključ polja 'a' se ponavlja.");
  });

  it('ponovljen ključ', () => {
    expect(proveriPolja([broj('a'), broj('b'), broj('a')])).toBe("Ključ polja 'a' se ponavlja.");
  });

  it('oznaka 1 do 200 znakova (razmaci se ne računaju kao sadržaj)', () => {
    const poruka = 'Oznaka polja mora imati 1 do 200 znakova.';
    expect(proveriPolja([broj('a', { oznaka: '' })])).toBe(poruka);
    expect(proveriPolja([broj('a', { oznaka: '   ' })])).toBe(poruka);
    expect(proveriPolja([broj('a', { oznaka: 'x'.repeat(201) })])).toBe(poruka);
    expect(proveriPolja([broj('a', { oznaka: 'x'.repeat(200) })])).toBeNull();
  });

  it('dužina se broji u znakovima, ne u UTF-16 jedinicama', () => {
    expect(proveriPolja([broj('a', { oznaka: '𝑥'.repeat(200) })])).toBeNull();
    expect(proveriPolja([broj('a', { oznaka: '𝑥'.repeat(201) })])).toBe('Oznaka polja mora imati 1 do 200 znakova.');
  });

  it('JEDAN_TACAN i VISE_TACNIH traže 2 do 6 opcija', () => {
    const poruka = "Polje 'a' mora imati 2 do 6 opcija.";
    const opcije = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1, tekst: `Opcija ${i + 1}` }));
    for (const tip of ['JEDAN_TACAN', 'VISE_TACNIH'] as const) {
      expect(proveriPolja([{ ...izbor(tip), opcije: opcije(1) }])).toBe(poruka);
      expect(proveriPolja([{ ...izbor(tip), opcije: null }])).toBe(poruka);
      expect(proveriPolja([{ ...izbor(tip), opcije: opcije(7) }])).toBe(poruka);
      expect(proveriPolja([{ ...izbor(tip), opcije: opcije(2) }])).toBeNull();
      expect(proveriPolja([{ ...izbor(tip), opcije: opcije(6) }])).toBeNull();
    }
  });

  it('opcije se ne proveravaju kod BROJ i TEKST', () => {
    expect(proveriPolja([broj('a', { opcije: null }), { ...broj('b'), tip: 'TEKST' }])).toBeNull();
  });

  it('prazan tekst opcije (tek dodata opcija) je greška', () => {
    expect(proveriPolja([{ ...novoPolje('JEDAN_TACAN', []), oznaka: 'Pitanje' }]))
      .toBe("Tekst opcije polja 'a' mora imati 1 do 200 znakova.");
  });

  it('odstupanje nije negativno i konačno; jedinica najviše 30 znakova', () => {
    expect(proveriPolja([broj('a', { odstupanje: -1 })])).toBe("Odstupanje polja 'a' mora biti nenegativan broj.");
    expect(proveriPolja([broj('a', { odstupanje: Number.NaN })])).toBe("Odstupanje polja 'a' mora biti nenegativan broj.");
    expect(proveriPolja([broj('a', { odstupanje: 0.5, jedinica: 'kN/m' })])).toBeNull();
    expect(proveriPolja([broj('a', { jedinica: 'x'.repeat(31) })])).toBe("Jedinica polja 'a' može imati najviše 30 znakova.");
  });

  it('vraća prvu povredu po redosledu polja', () => {
    expect(proveriPolja([broj('a', { oznaka: '' }), broj('A')])).toBe('Oznaka polja mora imati 1 do 200 znakova.');
    expect(proveriPolja([broj('A'), broj('a', { oznaka: '' })])).toMatch(/^Ključ polja mora biti/);
  });
});

describe('prazniOdgovori', () => {
  it('po jedan prazan odgovor za svaki ključ šeme, sa praznom vrednošću tipa', () => {
    const polja = [broj('a'), { ...broj('b'), tip: 'TEKST' as const }, izbor('JEDAN_TACAN', 'c'), izbor('VISE_TACNIH', 'd')];
    expect(prazniOdgovori(polja)).toEqual({
      a: odgovor({ broj: null }),
      b: odgovor({ prihvatljivi: [] }),
      c: odgovor({ tacna: null }),
      d: odgovor({ tacne: [] }),
    });
  });

  it('prazna šema daje prazan objekat; nijedan prazan odgovor nije popunjen', () => {
    expect(prazniOdgovori([])).toEqual({});
    const polja = [broj('a'), { ...broj('b'), tip: 'TEKST' as const }, izbor('JEDAN_TACAN', 'c'), izbor('VISE_TACNIH', 'd')];
    const prazni = prazniOdgovori(polja);
    expect(polja.map(p => odgovorPopunjen(p, prazni[p.kljuc]))).toEqual([false, false, false, false]);
  });

  it('prazanOdgovor ne deli nizove između poziva', () => {
    const p: Polje = { ...broj('a'), tip: 'TEKST' };
    const prvi = prazanOdgovor(p);
    prvi.prihvatljivi?.push('x');
    expect(prazanOdgovor(p).prihvatljivi).toEqual([]);
  });
});

describe('odgovorPopunjen', () => {
  it('BROJ: konačan broj (nula je popunjena)', () => {
    expect(odgovorPopunjen(broj('a'), odgovor({ broj: 0 }))).toBe(true);
    expect(odgovorPopunjen(broj('a'), odgovor({ broj: 45.5 }))).toBe(true);
    expect(odgovorPopunjen(broj('a'), odgovor({ broj: null }))).toBe(false);
    expect(odgovorPopunjen(broj('a'), odgovor({ broj: Number.NaN }))).toBe(false);
    expect(odgovorPopunjen(broj('a'), odgovor({ broj: Number.POSITIVE_INFINITY }))).toBe(false);
  });

  it('TEKST: bar jedan prihvatljiv odgovor i nijedan prazan', () => {
    const tekst: Polje = { ...broj('a'), tip: 'TEKST' };
    expect(odgovorPopunjen(tekst, odgovor({ prihvatljivi: ['kN'] }))).toBe(true);
    expect(odgovorPopunjen(tekst, odgovor({ prihvatljivi: [] }))).toBe(false);
    expect(odgovorPopunjen(tekst, odgovor({ prihvatljivi: null }))).toBe(false);
    expect(odgovorPopunjen(tekst, odgovor({ prihvatljivi: ['kN', '  '] }))).toBe(false);
  });

  it('JEDAN_TACAN: id jedne od opcija šeme', () => {
    const p = izbor('JEDAN_TACAN');
    expect(odgovorPopunjen(p, odgovor({ tacna: 5 }))).toBe(true);
    expect(odgovorPopunjen(p, odgovor({ tacna: 3 }))).toBe(false);
    expect(odgovorPopunjen(p, odgovor({ tacna: null }))).toBe(false);
  });

  it('VISE_TACNIH: neprazan skup id-jeva opcija šeme', () => {
    const p = izbor('VISE_TACNIH');
    expect(odgovorPopunjen(p, odgovor({ tacne: [1, 5] }))).toBe(true);
    expect(odgovorPopunjen(p, odgovor({ tacne: [] }))).toBe(false);
    expect(odgovorPopunjen(p, odgovor({ tacne: [1, 9] }))).toBe(false);
    expect(odgovorPopunjen(p, odgovor({ tacne: null }))).toBe(false);
  });
});
