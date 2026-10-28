import {
  PORUKE, PRELAZ, greskeSlajda, greskeSlajdaZaSlanje, normalizujPrelaz, noviSlajd, novoPitanje, oznakaSlajda, prazanZadatakInfo,
  promeniTipPitanja, slajdIzCmd, slajdUCmd, trajanjeIzSekundi,
} from './slajd-pravila';
import { Prelaz, SlajdCmd, SlajdDetails, ZadatakSlajda, ZadatakSlajdaInfo } from './uzivo.models';
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
      beleske: 'B', postepeno: true, pitanje: null, platno: null, prelaz: null, zadatak: null,
    };
    expect(slajdIzCmd(slajdUCmd(s), s)).toEqual(s);
  });

  it('slajdUCmd vraća platno neizmenjeno (izmena beleški ne briše slojeve)', () => {
    const platno = { verzija: 1, pozadina: { boja: '#FFFFFF', medijId: null }, slojevi: [], animacije: [] } as const;
    const s: SlajdDetails = {
      id: 4, rb: 2, tip: 'PLATNO', naslov: null, sadrzaj: null, slika: null, beleske: 'B', postepeno: false, pitanje: null,
      platno: { ...platno, slojevi: [], animacije: [] }, prelaz: null,
    };
    expect(slajdUCmd(s).platno).toBe(s.platno);
    expect(slajdUCmd({ ...s, tip: 'INFO', platno: null }).platno).toBeNull();
  });

  it('oznaka slajda je tekst bez Markdown znakova', () => {
    const s: SlajdDetails = { id: 1, rb: 1, tip: 'INFO', naslov: null, sadrzaj: '## Sile i **momenti**\n- GD-2025',
      slika: null, beleske: null, postepeno: false, pitanje: null, platno: null, prelaz: null };
    expect(oznakaSlajda(s)).toBe('Sile i momenti GD-2025');
    expect(oznakaSlajda({ ...s, sadrzaj: null })).toBe('Nov slajd');
  });

  it('oznaka pitanja čuva formulu: `_` i `*` unutar $...$ ostaju (1011_2 nije 10112), van formule se brišu', () => {
    const s: SlajdDetails = { id: 2, rb: 2, tip: 'PITANJE', naslov: null, sadrzaj: null, slika: null, beleske: null,
      postepeno: false, platno: null, prelaz: null, pitanje: { id: 9, tip: 'JEDAN_TACAN', tekst: '**Koliko** je $1011_2$ i $z^*$?',
        slika: null, vremeSekunde: null, opcije: [], brojTacno: null, brojOdstupanje: null, odstupanjeTip: null, jedinica: null,
        tekstPrikaz: null, prihvatljiviOdgovori: null, skalaMinOznaka: null, skalaMaxOznaka: null } };
    expect(oznakaSlajda(s)).toBe('Koliko je $1011_2$ i $z^*$?');
    // INFO ne tumači $ (kao renderMarkdown): Markdown znaci se brišu svuda
    expect(oznakaSlajda({ ...s, tip: 'INFO', pitanje: null, sadrzaj: 'Cena $a_b$ **x**' })).toBe('Cena $ab$ x');
  });

  describe('PLATNO', () => {
    const platnoSlajd = (platno: Platno | null = platnoFabrika()): SlajdDetails => ({
      id: 4, rb: 2, tip: 'PLATNO', naslov: null, sadrzaj: null, slika: null, beleske: 'B', postepeno: false, pitanje: null, platno,
      prelaz: null, zadatak: null,
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
  describe('prelaz (faza 5, odluke 10-11)', () => {
    const P = (efekat: Prelaz['efekat'], smer: Prelaz['smer'], trajanjeMs: number): Prelaz => ({ efekat, smer, trajanjeMs });
    const info = (prelaz: Prelaz | null): SlajdCmd => ({ ...noviSlajd('INFO'), naslov: 'Uvod', prelaz });
    const platnoCmd = (prelaz: Prelaz | null): SlajdCmd => ({ ...noviSlajd('PLATNO', undefined, platnoFabrika()), prelaz });
    const detalji = (prelaz: Prelaz | null, tip: SlajdDetails['tip'] = 'INFO'): SlajdDetails => ({
      id: 7, rb: 1, tip, naslov: tip === 'INFO' ? 'Uvod' : null, sadrzaj: null, slika: null, beleske: 'B', postepeno: false,
      pitanje: null, platno: tip === 'PLATNO' ? platnoFabrika() : null, prelaz, zadatak: null,
    });

    it('granice i poruka kao na serveru (SlajdPP)', () => {
      expect(PRELAZ).toEqual({ min: 100, max: 5000, podrazumevano: 500 });
      expect(PORUKE.prelaz).toBe('Trajanje prelaza mora biti od 0,1 do 5 sekundi.');
    });

    // iste tabele kao SlajdPPTest.normalizujPrelaz*
    it.each<[string, Partial<Prelaz> | null | undefined, Prelaz | null]>([
      ['null', null, null],
      ['undefined (JSON bez polja)', undefined, null],
      ['bez efekta', { efekat: undefined, smer: 'DESNO', trajanjeMs: 500 }, null],
      ['FADE gubi smer, trajanje 500', { efekat: 'FADE', smer: 'LEVO', trajanjeMs: undefined }, P('FADE', null, 500)],
      ['GURANJE bez smera -> DESNO', { efekat: 'GURANJE', smer: null, trajanjeMs: 700 }, P('GURANJE', 'DESNO', 700)],
      ['BRISANJE ostaje', { efekat: 'BRISANJE', smer: 'GORE', trajanjeMs: 800 }, P('BRISANJE', 'GORE', 800)],
      ['GURANJE bez smera i trajanja', { efekat: 'GURANJE' }, P('GURANJE', 'DESNO', 500)],
    ])('normalizujPrelaz: %s', (_, ulaz, ocekivano) => {
      expect(normalizujPrelaz(ulaz as Prelaz | null | undefined)).toEqual(ocekivano);
    });

    it.each<[string, number]>([
      ['0,8', 800], ['0.8', 800], [' 1,25 ', 1250], ['5', 5000], [',5', 500], ['2,', 2000], ['0,0004', 0], ['1,2345', 1235],
      ['', 0], ['abc', 0], ['1,2,3', 0], ['-1', 0], ['1e3', 0], ['1 000', 0],
    ])('trajanjeIzSekundi("%s") = %d ms (zarez ili tačka; neispravno -> 0, pa poruka)', (tekst, ms) => {
      expect(trajanjeIzSekundi(tekst)).toBe(ms);
    });

    it('noviSlajd je bez prelaza za svaki tip', () => {
      for (const tip of ['INFO', 'PITANJE', 'PLATNO'] as const) expect(noviSlajd(tip).prelaz).toBeNull();
    });

    it('slajdUCmd čuva prelaz za svaki tip (regresija: PUT iz forme, beleški ili platna ne sme da ga obriše)', () => {
      const p = P('BRISANJE', 'GORE', 800);
      for (const tip of ['INFO', 'PLATNO'] as const) expect(slajdUCmd(detalji(p, tip)).prelaz).toEqual(p);
      expect(slajdUCmd(detalji(null)).prelaz).toBeNull();
      // fixture ili stari odgovor bez polja: null, ne undefined (JSON.stringify bi izostavio ključ)
      const bezPolja = { ...detalji(null) } as Partial<SlajdDetails>;
      delete bezPolja.prelaz;
      expect(slajdUCmd(bezPolja as SlajdDetails).prelaz).toBeNull();
    });

    it('slajdIzCmd normalizuje prelaz (lokalni prikaz kao odgovor servera)', () => {
      const osnova = { id: 7, rb: 1 };
      expect(slajdIzCmd(info({ efekat: 'GURANJE', smer: null, trajanjeMs: 600 }), osnova).prelaz).toEqual(P('GURANJE', 'DESNO', 600));
      expect(slajdIzCmd(info({ efekat: 'FADE', smer: 'LEVO', trajanjeMs: 300 }), osnova).prelaz).toEqual(P('FADE', null, 300));
      expect(slajdIzCmd(info(null), osnova).prelaz).toBeNull();
      expect(slajdIzCmd(platnoCmd(P('BRISANJE', 'DOLE', 900)), osnova).prelaz).toEqual(P('BRISANJE', 'DOLE', 900));
      const s = detalji(P('GURANJE', 'LEVO', 1200));
      expect(slajdIzCmd(slajdUCmd(s), s)).toEqual(s);
    });

    it('greskeSlajda: trajanje 50 i 5001 ms je greška za INFO, PLATNO i PITANJE; 100 i 5000 prolaze', () => {
      const pitanje: SlajdCmd = {
        ...noviSlajd('PITANJE'),
        pitanje: { ...novoPitanje('JEDAN_TACAN', 'Koliko?'), opcije: [{ tekst: 'a', tacna: true }, { tekst: 'b', tacna: false }] },
      };
      expect(greskeSlajda(pitanje)).toEqual([]);
      for (const ms of [50, 99, 5001, 800.5]) {
        expect(greskeSlajda(info(P('FADE', null, ms)))).toEqual([PORUKE.prelaz]);
        expect(greskeSlajda(platnoCmd(P('GURANJE', 'LEVO', ms)))).toEqual([PORUKE.prelaz]);
        expect(greskeSlajdaZaSlanje(platnoCmd(P('BRISANJE', 'DOLE', ms)))).toEqual([PORUKE.prelaz]);
        expect(greskeSlajda({ ...pitanje, prelaz: P('FADE', null, ms) })).toEqual([PORUKE.prelaz]);
      }
      for (const ms of [100, 5000]) {
        expect(greskeSlajda(info(P('FADE', null, ms)))).toEqual([]);
        expect(greskeSlajdaZaSlanje(platnoCmd(P('BRISANJE', null, ms)))).toEqual([]);
      }
      // bez prelaza i prelaz bez efekta (normalizuje se u null) nisu greška
      expect(greskeSlajda(info(null))).toEqual([]);
      expect(greskeSlajda(info({ efekat: null, smer: null, trajanjeMs: 1 } as unknown as Prelaz))).toEqual([]);
      // redosled kao SlajdPP.proveri: posle beleški, pre grane po tipu
      expect(greskeSlajda({ ...noviSlajd('INFO'), beleske: 'x'.repeat(20_001), prelaz: P('FADE', null, 1) }))
        .toEqual([PORUKE.beleske, PORUKE.prelaz, PORUKE.infoPrazan]);
      expect(greskeSlajda({ ...platnoCmd(P('FADE', null, 1)), platno: null })).toEqual([PORUKE.prelaz, PORUKE.bezPlatna]);
    });
  });

  describe('ZADATAK (projekat B)', () => {
    const z = (izmene: Partial<ZadatakSlajda> = {}): ZadatakSlajda => ({ grupaId: 2, vremeSekunde: null, brojVarijanti: null, nivo: null, ...izmene });
    const zadatakCmd = (izmene: Partial<ZadatakSlajda> = {}): SlajdCmd => noviSlajd('ZADATAK', undefined, null, z(izmene));
    const info = (izmene: Partial<ZadatakSlajdaInfo> = {}): ZadatakSlajdaInfo => ({
      grupaId: 2, vremeSekunde: 120, brojVarijanti: 4, nivo: null, grupaNaziv: '2 → 10',
      putanja: [{ id: 1, naziv: 'Konverzije brojeva (demo)' }, { id: 2, naziv: '2 → 10' }], list: true, brojAktivnihVarijanti: 3, brojAktivnihPoNivou: [1, 1, 1],
      polja: [{ kljuc: 'a', oznaka: 'a', tip: 'BROJ', odstupanje: 0, odstupanjeTip: 'APSOLUTNO', jedinica: null, zanemariVelicinu: null,
        zanemariRazmake: null, opcije: null }],
      iskljucena: false, iskljucenePodgrupe: [], upozorenja: ['Tema je isključena.'], ...izmene,
    });
    const detalji = (zadatak: ZadatakSlajdaInfo | null = info()): SlajdDetails => ({
      id: 8, rb: 3, tip: 'ZADATAK', naslov: null, sadrzaj: null, slika: null, beleske: 'Na tabli posle.', postepeno: false,
      pitanje: null, platno: null, prelaz: null, zadatak,
    });

    it('poruke kao na serveru (SlajdPP)', () => {
      expect(PORUKE.zadatakBezGrupe).toBe('Zadatak slajd mora imati grupu zadataka.');
      expect(PORUKE.brojVarijanti).toBe('Broj različitih zadataka mora biti od 1 do 50.');
    });

    it('noviSlajd: zadatak samo za ZADATAK, bez pitanja i platna', () => {
      expect(zadatakCmd()).toEqual(expect.objectContaining({ tip: 'ZADATAK', pitanje: null, platno: null, zadatak: z() }));
      for (const tip of ['INFO', 'PITANJE', 'PLATNO'] as const) expect(noviSlajd(tip, undefined, null, z()).zadatak).toBeNull();
    });

    it('bez grupe (ili bez zadatka) -> poruka grupe', () => {
      expect(greskeSlajda(zadatakCmd({ grupaId: null }))).toEqual([PORUKE.zadatakBezGrupe]);
      expect(greskeSlajda({ ...zadatakCmd(), zadatak: null })).toEqual([PORUKE.zadatakBezGrupe]);
      expect(greskeSlajda({ ...zadatakCmd(), zadatak: undefined })).toEqual([PORUKE.zadatakBezGrupe]);
      expect(greskeSlajda(zadatakCmd())).toEqual([]);
    });

    it('vreme kao kod pitanja: 4 i 601 (i neispravan unos) su greška, 5, 600 i null nisu', () => {
      for (const v of [4, 601, 20.5, Number.NaN]) expect(greskeSlajda(zadatakCmd({ vremeSekunde: v }))).toEqual([PORUKE.vreme]);
      for (const v of [5, 600, null]) expect(greskeSlajda(zadatakCmd({ vremeSekunde: v }))).toEqual([]);
    });

    it('broj različitih: 0, 51 (i neispravan unos) su greška; 1, 50 i null (= sve aktivne) nisu', () => {
      for (const b of [0, 51, 2.5, Number.NaN]) expect(greskeSlajda(zadatakCmd({ brojVarijanti: b }))).toEqual([PORUKE.brojVarijanti]);
      for (const b of [1, 50, null]) expect(greskeSlajda(zadatakCmd({ brojVarijanti: b }))).toEqual([]);
    });

    it('redosled: zajedničke provere, pa grupa, vreme, broj (sve, kao SlajdPP.proveri redom)', () => {
      expect(greskeSlajda({ ...zadatakCmd({ grupaId: null, vremeSekunde: 4, brojVarijanti: 0 }), beleske: 'x'.repeat(20_001) }))
        .toEqual([PORUKE.beleske, PORUKE.zadatakBezGrupe, PORUKE.vreme, PORUKE.brojVarijanti]);
    });

    it('slajdUCmd šalje samo grupu, vreme i broj; drugi tipovi šalju zadatak null', () => {
      expect(slajdUCmd(detalji()).zadatak).toEqual({ grupaId: 2, vremeSekunde: 120, brojVarijanti: 4, nivo: null });
      expect(slajdUCmd(detalji(null)).zadatak).toBeNull();
      const infoSlajd: SlajdDetails = { ...detalji(), tip: 'INFO', naslov: 'Uvod', zadatak: null };
      expect(slajdUCmd(infoSlajd).zadatak).toBeNull();
      // fixture ili stari odgovor bez polja: null, ne undefined
      const bezPolja = { ...infoSlajd } as Partial<SlajdDetails>;
      delete bezPolja.zadatak;
      expect(slajdUCmd(bezPolja as SlajdDetails).zadatak).toBeNull();
    });

    it('slajdUCmd -> slajdIzCmd povratno čuva zadatak (ista grupa: opis sa servera ostaje, vreme i broj iz komande)', () => {
      const s = detalji();
      expect(slajdIzCmd(slajdUCmd(s), s)).toEqual(s);
      const cmd = { ...slajdUCmd(s), zadatak: { grupaId: 2, vremeSekunde: null, brojVarijanti: 2, nivo: null } };
      expect(slajdIzCmd(cmd, s).zadatak).toEqual(info({ vremeSekunde: null, brojVarijanti: 2 }));
    });

    it('promena grupe daje prazanZadatakInfo (opis stiže tek sa servera)', () => {
      const s = detalji();
      const cmd = { ...slajdUCmd(s), zadatak: { grupaId: 5, vremeSekunde: 60, brojVarijanti: null, nivo: 3 } };
      const prazan: ZadatakSlajdaInfo = {
        grupaId: 5, vremeSekunde: 60, brojVarijanti: null, nivo: 3, grupaNaziv: null, putanja: [], list: false, brojAktivnihVarijanti: 0,
        brojAktivnihPoNivou: null,
        polja: null, iskljucena: false, iskljucenePodgrupe: [], upozorenja: [], primerSvgId: null,
      };
      expect(prazanZadatakInfo({ grupaId: 5, vremeSekunde: 60, brojVarijanti: null, nivo: 3 })).toEqual(prazan);
      expect(slajdIzCmd(cmd, s).zadatak).toEqual(prazan);
      // nov nacrt (osnova bez zadatka)
      expect(slajdIzCmd(zadatakCmd({ grupaId: 5, vremeSekunde: 60, nivo: 3 }), { id: -1, rb: 0 }).zadatak).toEqual(prazan);
    });

    it('slajdIzCmd: tip koji nije ZADATAK nema zadatak ni kad ga osnova ima', () => {
      const cmd: SlajdCmd = { ...noviSlajd('INFO'), naslov: 'Uvod' };
      expect(slajdIzCmd(cmd, detalji()).zadatak).toBeNull();
      expect(slajdIzCmd({ ...zadatakCmd(), zadatak: null }, detalji()).zadatak).toBeNull();
    });

    it('oznakaSlajda: "Zadatak: <grupa>" ili "Zadatak" dok naziv nije poznat', () => {
      expect(oznakaSlajda(detalji())).toBe('Zadatak: 2 → 10');
      expect(oznakaSlajda(detalji(info({ grupaNaziv: null })))).toBe('Zadatak');
      expect(oznakaSlajda(detalji(null))).toBe('Zadatak');
      expect(oznakaSlajda(detalji(info({ grupaNaziv: 'G'.repeat(80) })), 20)).toBe('Zadatak: GGGGGGGGGG…');
    });
  });
});
