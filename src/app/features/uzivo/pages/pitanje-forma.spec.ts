import { OpcijaCmd, PitanjeCmd, TipPitanja } from '../data-access/uzivo.models';
import { greskePitanja } from './pitanje-forma.component';

function pitanje(tip: TipPitanja, izmene: Partial<PitanjeCmd> = {}): PitanjeCmd {
  return {
    tip, tekst: 'Koliko je 2 + 2?', slikaId: null, vremeSekunde: null, opcije: [], brojTacno: null, brojOdstupanje: null,
    odstupanjeTip: null, jedinica: null, tekstPrikaz: null, prihvatljiviOdgovori: [], skalaMinOznaka: null,
    skalaMaxOznaka: null, ...izmene,
  };
}

const o = (tekst: string, tacna = false): OpcijaCmd => ({ tekst, tacna });

describe('greskePitanja (iste poruke kao SlajdPP)', () => {
  it('ispravno pitanje sa jednim tačnim nema grešaka', () => {
    expect(greskePitanja(pitanje('JEDAN_TACAN', { opcije: [o('3'), o('4', true)] }))).toEqual([]);
  });

  it('broj opcija mora biti 2-6', () => {
    const poruka = 'Pitanje mora imati od 2 do 6 ponuđenih odgovora.';
    expect(greskePitanja(pitanje('ANKETA', { opcije: [o('a')] }))).toContain(poruka);
    expect(greskePitanja(pitanje('ANKETA', { opcije: [o('a'), o('b'), o('c'), o('d'), o('e'), o('f'), o('g')] })))
      .toContain(poruka);
    expect(greskePitanja(pitanje('ANKETA', { opcije: [o('a'), o('b'), o('c'), o('d'), o('e'), o('f')] }))).toEqual([]);
  });

  it('prazan ili predugačak tekst opcije', () => {
    const poruka = 'Ponuđeni odgovor mora imati od 1 do 300 znakova.';
    expect(greskePitanja(pitanje('ANKETA', { opcije: [o('a'), o('   ')] }))).toEqual([poruka]);
    expect(greskePitanja(pitanje('ANKETA', { opcije: [o('a'), o('x'.repeat(301))] }))).toEqual([poruka]);
    expect(greskePitanja(pitanje('ANKETA', { opcije: [o('a'), o('x'.repeat(300))] }))).toEqual([]);
  });

  it('jedan tačan: tačno jedna tačna opcija', () => {
    const poruka = 'Pitanje sa jednim tačnim odgovorom mora imati tačno jedan tačan odgovor.';
    expect(greskePitanja(pitanje('JEDAN_TACAN', { opcije: [o('a'), o('b')] }))).toEqual([poruka]);
    expect(greskePitanja(pitanje('JEDAN_TACAN', { opcije: [o('a', true), o('b', true)] }))).toEqual([poruka]);
  });

  it('više tačnih: bar jedna tačna, više je dozvoljeno', () => {
    expect(greskePitanja(pitanje('VISE_TACNIH', { opcije: [o('a'), o('b')] }))).toEqual(['Označi bar jedan tačan odgovor.']);
    expect(greskePitanja(pitanje('VISE_TACNIH', { opcije: [o('a', true), o('b', true)] }))).toEqual([]);
  });

  it('anketa ne traži tačan odgovor', () => {
    expect(greskePitanja(pitanje('ANKETA', { opcije: [o('a'), o('b')] }))).toEqual([]);
  });

  it('tačno/netačno: tačno dve opcije i tačno jedna tačna', () => {
    const poruka = 'Tačno/netačno pitanje ima tačno dva odgovora, od kojih je jedan tačan.';
    expect(greskePitanja(pitanje('TACNO_NETACNO', { opcije: [o('Tačno', true), o('Netačno')] }))).toEqual([]);
    expect(greskePitanja(pitanje('TACNO_NETACNO', { opcije: [o('Tačno'), o('Netačno')] }))).toEqual([poruka]);
    expect(greskePitanja(pitanje('TACNO_NETACNO', { opcije: [o('Tačno', true), o('Netačno', true)] }))).toEqual([poruka]);
    expect(greskePitanja(pitanje('TACNO_NETACNO', { opcije: [o('Tačno', true)] }))).toEqual([poruka]);
  });

  it('vreme je null ili 5-600 sekundi', () => {
    const poruka = 'Vreme za odgovor mora biti od 5 do 600 sekundi.';
    expect(greskePitanja(pitanje('SKALA', { vremeSekunde: 4 }))).toEqual([poruka]);
    expect(greskePitanja(pitanje('SKALA', { vremeSekunde: 601 }))).toEqual([poruka]);
    expect(greskePitanja(pitanje('SKALA', { vremeSekunde: 5 }))).toEqual([]);
    expect(greskePitanja(pitanje('SKALA', { vremeSekunde: 600 }))).toEqual([]);
    expect(greskePitanja(pitanje('SKALA', { vremeSekunde: null }))).toEqual([]);
  });

  it('odstupanje broja je ≥ 0', () => {
    expect(greskePitanja(pitanje('BROJ', { brojTacno: 3.5, brojOdstupanje: -0.1 })))
      .toEqual(['Odstupanje ne može biti negativno.']);
    expect(greskePitanja(pitanje('BROJ', { brojTacno: 3.5, brojOdstupanje: 0 }))).toEqual([]);
    expect(greskePitanja(pitanje('BROJ', { brojTacno: null, brojOdstupanje: null }))).toEqual([]);
    expect(greskePitanja(pitanje('BROJ', { brojTacno: NaN }))).toEqual(['Broj nije ispravan.']);
  });

  it('najviše 20 prihvatljivih odgovora, svaki do 100 znakova', () => {
    const poruka = 'Najviše 20 prihvatljivih odgovora, svaki do 100 znakova.';
    const dvadeset = Array.from({ length: 20 }, (_, i) => `odgovor ${i}`);
    expect(greskePitanja(pitanje('KRATAK_TEKST', { prihvatljiviOdgovori: dvadeset }))).toEqual([]);
    expect(greskePitanja(pitanje('KRATAK_TEKST', { prihvatljiviOdgovori: [...dvadeset, 'još jedan'] }))).toEqual([poruka]);
    expect(greskePitanja(pitanje('KRATAK_TEKST', { prihvatljiviOdgovori: ['x'.repeat(101)] }))).toEqual([poruka]);
  });

  it('tekst pitanja je obavezan, a za tipove bez opcija se opcije ne proveravaju', () => {
    expect(greskePitanja(pitanje('KRATAK_TEKST', { tekst: '  ' }))).toEqual(['Tekst pitanja je obavezan (najviše 2000 znakova).']);
    expect(greskePitanja(pitanje('SKALA', { skalaMinOznaka: 'x'.repeat(61) })))
      .toEqual(['Oznaka skale može imati najviše 60 znakova.']);
  });
});
