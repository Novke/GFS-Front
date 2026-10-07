import { greskeSlajda, noviSlajd, novoPitanje, oznakaSlajda, promeniTipPitanja, slajdIzCmd, slajdUCmd } from './slajd-pravila';
import { SlajdDetails } from './uzivo.models';

describe('slajd-pravila', () => {
  it('novo pitanje izbora ima dve prazne opcije, bez tačne', () => {
    for (const tip of ['JEDAN_TACAN', 'VISE_TACNIH', 'ANKETA'] as const) {
      expect(novoPitanje(tip).opcije).toEqual([{ tekst: '', tacna: false }, { tekst: '', tacna: false }]);
    }
  });

  it('tačno/netačno ima opcije redom [Tačno, Netačno], Tačno je tačno', () => {
    expect(novoPitanje('TACNO_NETACNO').opcije).toEqual([{ tekst: 'Tačno', tacna: true }, { tekst: 'Netačno', tacna: false }]);
  });

  it('tipovi bez opcija: broj (odstupanje 0, apsolutno), kratak tekst (oblak), skala', () => {
    expect(novoPitanje('BROJ')).toEqual(jasmine.objectContaining({ opcije: [], brojOdstupanje: 0, odstupanjeTip: 'APSOLUTNO' }));
    expect(novoPitanje('KRATAK_TEKST')).toEqual(jasmine.objectContaining({ opcije: [], tekstPrikaz: 'OBLAK' }));
    expect(novoPitanje('SKALA').opcije).toEqual([]);
  });

  it('nov info slajd je neispravan dok nema naslov, tekst ili sliku (server ga ne bi primio)', () => {
    expect(greskeSlajda(noviSlajd('INFO'))).toEqual(['Info slajd mora imati naslov, tekst ili sliku.']);
    expect(greskeSlajda({ ...noviSlajd('INFO'), naslov: 'Uvod' })).toEqual([]);
  });

  it('promena tipa čuva tekst i vreme; jedan tačan zadržava samo prvu tačnu; TN počinje iznova', () => {
    const vise = { ...novoPitanje('VISE_TACNIH', 'Šta važi?'), vremeSekunde: 30,
      opcije: [{ tekst: 'a', tacna: false }, { tekst: 'b', tacna: true }, { tekst: 'c', tacna: true }] };
    const jedan = promeniTipPitanja(vise, 'JEDAN_TACAN');
    expect(jedan.tekst).toBe('Šta važi?');
    expect(jedan.vremeSekunde).toBe(30);
    expect(jedan.opcije.map(o => o.tacna)).toEqual([false, true, false]);
    expect(promeniTipPitanja(vise, 'ANKETA').opcije.every(o => !o.tacna)).toBeTrue();
    expect(promeniTipPitanja(vise, 'TACNO_NETACNO').opcije.map(o => o.tekst)).toEqual(['Tačno', 'Netačno']);
    expect(promeniTipPitanja(vise, 'BROJ').opcije).toEqual([]);
  });

  it('SlajdDetails -> SlajdCmd -> lokalni SlajdDetails čuva sadržaj', () => {
    const s: SlajdDetails = {
      id: 4, rb: 2, tip: 'INFO', naslov: 'N', sadrzaj: 'S', slika: { id: 'u', naziv: 'x.png', mime: 'image/png', velicina: 1 },
      beleske: 'B', postepeno: true, pitanje: null,
    };
    expect(slajdIzCmd(slajdUCmd(s), s)).toEqual(s);
  });

  it('oznaka slajda je tekst bez Markdown znakova', () => {
    const s: SlajdDetails = { id: 1, rb: 1, tip: 'INFO', naslov: null, sadrzaj: '## Sile i **momenti**\n- GD-2025',
      slika: null, beleske: null, postepeno: false, pitanje: null };
    expect(oznakaSlajda(s)).toBe('Sile i momenti GD-2025');
    expect(oznakaSlajda({ ...s, sadrzaj: null })).toBe('Nov slajd');
  });
});
