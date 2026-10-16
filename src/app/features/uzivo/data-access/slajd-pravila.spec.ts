import { greskeSlajda, greskeSlajdaZaSlanje, noviSlajd, novoPitanje, oznakaSlajda, promeniTipPitanja, slajdIzCmd, slajdUCmd } from './slajd-pravila';
import { SlajdDetails } from './uzivo.models';
import { platno as platnoFabrika } from './platno-podaci.testing';
import { Platno, Sloj } from './platno.models';

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
    expect(novoPitanje('BROJ')).toEqual(expect.objectContaining({ opcije: [], brojOdstupanje: 0, odstupanjeTip: 'APSOLUTNO' }));
    expect(novoPitanje('KRATAK_TEKST')).toEqual(expect.objectContaining({ opcije: [], tekstPrikaz: 'OBLAK' }));
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
    expect(promeniTipPitanja(vise, 'ANKETA').opcije.every(o => !o.tacna)).toBe(true);
    expect(promeniTipPitanja(vise, 'TACNO_NETACNO').opcije.map(o => o.tekst)).toEqual(['Tačno', 'Netačno']);
    expect(promeniTipPitanja(vise, 'BROJ').opcije).toEqual([]);
  });

  it('SlajdDetails -> SlajdCmd -> lokalni SlajdDetails čuva sadržaj', () => {
    const s: SlajdDetails = {
      id: 4, rb: 2, tip: 'INFO', naslov: 'N', sadrzaj: 'S', slika: { id: 'u', naziv: 'x.png', mime: 'image/png', velicina: 1 },
      beleske: 'B', postepeno: true, pitanje: null, platno: null,
    };
    expect(slajdIzCmd(slajdUCmd(s), s)).toEqual(s);
  });

  it('slajdUCmd vraća platno neizmenjeno (izmena beleški ne briše slojeve)', () => {
    const platno = { verzija: 1, pozadina: { boja: '#FFFFFF', medijId: null }, slojevi: [], animacije: [] } as const;
    const s: SlajdDetails = {
      id: 4, rb: 2, tip: 'PLATNO', naslov: null, sadrzaj: null, slika: null, beleske: 'B', postepeno: false, pitanje: null,
      platno: { ...platno, slojevi: [], animacije: [] },
    };
    expect(slajdUCmd(s).platno).toBe(s.platno);
    expect(slajdUCmd({ ...s, tip: 'INFO', platno: null }).platno).toBeNull();
  });

  it('oznaka slajda je tekst bez Markdown znakova', () => {
    const s: SlajdDetails = { id: 1, rb: 1, tip: 'INFO', naslov: null, sadrzaj: '## Sile i **momenti**\n- GD-2025',
      slika: null, beleske: null, postepeno: false, pitanje: null, platno: null };
    expect(oznakaSlajda(s)).toBe('Sile i momenti GD-2025');
    expect(oznakaSlajda({ ...s, sadrzaj: null })).toBe('Nov slajd');
  });

  describe('PLATNO', () => {
    const platnoSlajd = (platno: Platno | null = platnoFabrika()): SlajdDetails => ({
      id: 4, rb: 2, tip: 'PLATNO', naslov: null, sadrzaj: null, slika: null, beleske: 'B', postepeno: false, pitanje: null, platno,
    });

    it('slajdUCmd daje isto platno po vrednosti, a slajdIzCmd ga vraća', () => {
      const s = platnoSlajd();
      expect(slajdUCmd(s).platno).toEqual(platnoFabrika());
      expect(slajdIzCmd(slajdUCmd(s), s)).toEqual(s);
    });

    it('greške: samo beleške do 20000 znakova i postojanje platna', () => {
      const cmd = slajdUCmd(platnoSlajd());
      expect(greskeSlajda(cmd)).toEqual([]);
      expect(greskeSlajda({ ...cmd, beleske: 'x'.repeat(20_000) })).toEqual([]);
      expect(greskeSlajda({ ...cmd, beleske: 'x'.repeat(20_001) })).toEqual(['Beleške mogu imati najviše 20000 znakova.']);
      expect(greskeSlajda({ ...cmd, platno: null })).toEqual(['Platno slajd mora imati dokument platna.']);
    });

    it('greskeSlajda za PLATNO proverava brojeve (jeftino): 301 sloj je greška, ispravan dokument nije', () => {
      const p = platnoFabrika();
      const sloj = p.slojevi.find(l => l.tip === 'TEKST')!;
      const slojevi: Sloj[] = Array.from({ length: 301 }, (_, i) => ({ ...sloj, id: `s${i}` }));
      expect(greskeSlajda(slajdUCmd(platnoSlajd({ ...p, slojevi, animacije: [] })))).toContain('Slajd može imati najviše 300 slojeva.');
      expect(greskeSlajda(slajdUCmd(platnoSlajd()))).toEqual([]);
      expect(greskeSlajdaZaSlanje(slajdUCmd(platnoSlajd()))).toEqual([]);
    });

    it('dokument koji prolazi brojeve a ne server (#ggg): greskeSlajda [], greskeSlajdaZaSlanje poruka servera', () => {
      const cmd = slajdUCmd(platnoSlajd({ ...platnoFabrika(), pozadina: { boja: '#ggg', medijId: null } }));
      expect(greskeSlajda(cmd)).toEqual([]);
      expect(greskeSlajdaZaSlanje(cmd)).toEqual(['Boja nije ispravna (#RRGGBB).']);
    });

    it('greskeSlajdaZaSlanje vraća greške greskeSlajda bez pune provere; za INFO je isto što i greskeSlajda', () => {
      expect(greskeSlajdaZaSlanje({ ...slajdUCmd(platnoSlajd()), platno: null })).toEqual(['Platno slajd mora imati dokument platna.']);
      expect(greskeSlajdaZaSlanje(noviSlajd('INFO'))).toEqual(greskeSlajda(noviSlajd('INFO')));
    });

    it('greskeSlajda za PLATNO ne serijalizuje dokument (JSON.stringify se ne zove)', () => {
      const cmd = slajdUCmd(platnoSlajd());
      const stringify = vi.spyOn(JSON, 'stringify');
      try {
        greskeSlajda(cmd);
        expect(stringify).not.toHaveBeenCalled();
      } finally {
        stringify.mockRestore();
      }
    });

    it('noviSlajd nosi platno samo za PLATNO', () => {
      const p = platnoFabrika();
      expect(noviSlajd('PLATNO', undefined, p).platno).toBe(p);
      expect(noviSlajd('INFO', undefined, p).platno).toBeNull();
      expect(noviSlajd('PLATNO').platno).toBeNull();
    });

    it('beleške INFO slajda imaju istu granicu kao server (20000)', () => {
      expect(greskeSlajda({ ...noviSlajd('INFO'), naslov: 'N', beleske: 'x'.repeat(20_000) })).toEqual([]);
    });

    it('oznaka je tekst prvog TEKST sloja (prvi neprazan deo), inače "Platno"', () => {
      expect(oznakaSlajda(platnoSlajd())).toBe('Prvi');
      const p = platnoFabrika();
      const tekst = p.slojevi.find(l => l.tip === 'TEKST')!;
      if (tekst.tip === 'TEKST') {
        tekst.pasusi[0].delovi[0].tekst = '';
        tekst.pasusi[1].delovi[0].tekst = 'Drugi red';
      }
      expect(oznakaSlajda(platnoSlajd(p))).toBe('Drugi red');
      expect(oznakaSlajda(platnoSlajd({ ...p, slojevi: p.slojevi.filter(l => l.tip !== 'TEKST') }))).toBe('Platno');
      expect(oznakaSlajda(platnoSlajd(null))).toBe('Platno');
    });
  });
});
