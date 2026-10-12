import type { Animacija, CrtezSloj, Deo, FormulaSloj, Pasus, Platno, TabelaSloj, TekstSloj } from '../data-access/platno.models';
import { bajtovaPlatna, GRANICE, uklopiUGranice } from './granice';
import type { KodUpozorenja } from './izvestaj';

const deo = (tekst: string): Deo => ({
  tekst, font: 'Carlito', velicina: 18, boja: '#000000', podebljano: false, kurziv: false, podvuceno: false, precrtano: false, polozaj: 'OBICAN',
});
const pasus = (tekst: string): Pasus => ({
  poravnanje: 'LEVO', nivo: 0, lista: null, uvlacenje: { levo: 0, prviRed: 0 }, razmakPre: 0, razmakPosle: 0, proredProcenat: 100,
  tabulatori: [], delovi: [deo(tekst)],
});
const osnova = (id: string) => ({ id, naziv: null, x: 0, y: 0, sirina: 100, visina: 50, rotacija: 0, providnost: 1, zakljucan: false, senka: null });
const tekst = (id: string, t: string): TekstSloj => ({
  ...osnova(id), tip: 'TEKST', pasusi: [pasus(t)], popuna: null, ivica: null,
  okvir: { unutraLevo: 7.2, unutraGore: 3.6, unutraDesno: 7.2, unutraDole: 3.6, sidro: 'VRH', prelom: true, skala: 1, skalaProreda: 1 },
});
const crtez = (id: string, tacaka: number): CrtezSloj => ({
  ...osnova(id), tip: 'CRTEZ', medijId: 'm', potezi: [{ boja: '#FF0000', debljina: 2.5, tacke: Array.from({ length: tacaka * 2 }, (_, i) => i % 97 + 0.25) }],
});
const platno = (slojevi: TekstSloj[] | (TekstSloj | CrtezSloj | FormulaSloj | TabelaSloj)[], animacije: Animacija[] = []): Platno =>
  ({ verzija: 1, pozadina: { boja: '#FFFFFF', medijId: null }, slojevi, animacije });
const slojeviTeksta = (n: number) => Array.from({ length: n }, (_, i) => tekst(`s${i}`, 'a'));
const animacije = (n: number): Animacija[] => Array.from({ length: n }, (_, i) => ({
  id: `a${i}`, slojId: 's0', pasus: null, vrsta: 'ULAZ', efekat: 'FADE', smer: null, okidac: 'KLIK', trajanjeMs: 500, kasnjenjeMs: 0,
}));

function uklopi(p: Platno) {
  const upozorenja: { kod: KodUpozorenja; poruka: string }[] = [];
  const r = uklopiUGranice(p, (kod, poruka) => upozorenja.push({ kod, poruka }));
  return { r, upozorenja };
}

describe('uklopiUGranice', () => {
  it('300 slojeva prolazi nepromenjeno, 301 je greška', () => {
    const p = platno(slojeviTeksta(300));
    expect(uklopi(p)).toEqual({ r: p, upozorenja: [] });
    expect(uklopi(platno(slojeviTeksta(301))).r).toEqual({ greska: 'Slajd ima više od 300 objekata.' });
  });

  it('400 animacija prolazi, 401 je greška', () => {
    expect('greska' in (uklopi(platno(slojeviTeksta(1), animacije(400))).r)).toBe(false);
    expect(uklopi(platno(slojeviTeksta(1), animacije(401))).r).toEqual({ greska: 'Slajd ima više od 400 animacija.' });
  });

  it('50 000 znakova prolazi, 50 001 i 51 000 su greška (code point-i, ćelije i latex se broje)', () => {
    expect('greska' in uklopi(platno([tekst('a', 'x'.repeat(50_000))])).r).toBe(false);
    const poruka = { greska: 'Slajd ima više od 50000 znakova teksta.' };
    expect(uklopi(platno([tekst('a', 'x'.repeat(51_000))])).r).toEqual(poruka);
    expect(uklopi(platno([tekst('a', 'x'.repeat(49_999) + '😀😀')])).r).toEqual(poruka); // 50 001 code point-a, 50 003 UTF-16 jedinica
    expect('greska' in uklopi(platno([tekst('a', '😀'.repeat(25_000))])).r).toBe(false); // 25 000 code point-a
    const formula: FormulaSloj = { ...osnova('f'), tip: 'FORMULA', latex: 'y'.repeat(30_000), boja: '#000000', velicina: 18, poravnanje: 'LEVO', slikaIzvora: null };
    const tabela: TabelaSloj = {
      ...osnova('t'), tip: 'TABELA', kolone: [50, 50], redovi: [20],
      celije: [[
        { pasusi: [pasus('x'.repeat(10_000))], popuna: null, ivice: { gore: null, dole: null, levo: null, desno: null }, spojDesno: 0, spojDole: 0, pokrivena: false, sidro: 'VRH' },
        { pasusi: [pasus('x'.repeat(10_001))], popuna: null, ivice: { gore: null, dole: null, levo: null, desno: null }, spojDesno: 0, spojDole: 0, pokrivena: true, sidro: 'VRH' },
      ]],
    };
    expect(uklopi(platno([formula, tabela])).r).toEqual(poruka); // 30 000 + 20 001, pokrivena ćelija se broji kao na serveru
  });

  it('crtež sa 20 000 tačaka prolazi, sa 20 001 gubi poteze uz CRTEZ_BEZ_POTEZA (drugi crtež ostaje)', () => {
    expect(uklopi(platno([crtez('c', 20_000)]))).toEqual({ r: platno([crtez('c', 20_000)]), upozorenja: [] });
    const ulaz = platno([crtez('c', 20_001), crtez('d', 10)]);
    const { r, upozorenja } = uklopi(ulaz);
    expect(r).toEqual(platno([{ ...crtez('c', 20_001), potezi: null }, crtez('d', 10)]));
    expect(upozorenja.map((u) => u.kod)).toEqual(['CRTEZ_BEZ_POTEZA']);
    expect((ulaz.slojevi[0] as CrtezSloj).potezi).not.toBeNull(); // ulaz se ne menja
  });

  it('tačke se zbrajaju preko poteza istog crteža', () => {
    const c = crtez('c', 10_000);
    c.potezi = [c.potezi![0], { ...c.potezi![0] }, { boja: '#00FF00', debljina: 1, tacke: [1, 2] }];
    expect((uklopi(platno([c])).r as Platno).slojevi[0]).toEqual({ ...c, potezi: null });
  });

  it('dokument preko 1 MB zbog poteza: potezi svih crteža se uklanjaju i prolazi', () => {
    const slojevi = [crtez('a', 19_000), crtez('b', 19_000), crtez('c', 19_000)];
    for (const c of slojevi) c.potezi![0].tacke = c.potezi![0].tacke.map((_, i) => 100000.123456 + i * 0.37);
    const ulaz = platno(slojevi);
    expect(bajtovaPlatna(ulaz)).toBeGreaterThan(GRANICE.bajtova);
    const { r, upozorenja } = uklopi(ulaz);
    expect((r as Platno).slojevi.every((s) => s.tip === 'CRTEZ' && s.potezi === null)).toBe(true);
    expect(upozorenja.map((u) => u.kod)).toEqual(['CRTEZ_BEZ_POTEZA']);
    expect(bajtovaPlatna(r as Platno)).toBeLessThanOrEqual(GRANICE.bajtova);
  });

  it('dokument preko 1 MB i bez poteza je greška (mnogo slojeva i animacija sa dugim nazivima)', () => {
    const slojevi = Array.from({ length: 300 }, (_, i) => ({ ...tekst(`s${i}`, 'a'), naziv: 'n'.repeat(60), pasusi: Array.from({ length: 40 }, () => pasus('b')) }));
    const p = platno(slojevi);
    expect(bajtovaPlatna(p)).toBeGreaterThan(GRANICE.bajtova);
    expect(uklopi(p).r).toEqual({ greska: 'Slajd je prevelik (više od 1 MB).' });
  });
});

describe('bajtovaPlatna', () => {
  it('računa UTF-8 bajtove, ne UTF-16 jedinice', () => {
    const a = bajtovaPlatna(platno([tekst('a', 'x')]));
    expect(bajtovaPlatna(platno([tekst('a', 'š')]))).toBe(a + 1);
    expect(bajtovaPlatna(platno([tekst('a', '😀')]))).toBe(a + 3);
  });

  it('ceo broj u Double polju je za 2 bajta duži (server piše 100.0), a Integer polje nije', () => {
    const a = bajtovaPlatna(platno([tekst('a', 'x')]));
    const p = platno([{ ...tekst('a', 'x'), sirina: 100.5 }]); // 100 -> 100.5: +0 (isti broj cifara + ".5" umesto ".0")
    expect(bajtovaPlatna(p)).toBe(a - 2 + 2);
    const sa = platno([{ ...tekst('a', 'x'), sirina: 100.25 }]);
    expect(bajtovaPlatna(sa)).toBe(a - 2 + 3); // celi 100 gubi ".0" (2), 100.25 ima ".25" (3)
  });

  it('zaokružuje na 2 decimale HALF_UP pre merenja', () => {
    const duga = platno([{ ...tekst('a', 'x'), sirina: 100.123456789 }]);
    const kratka = platno([{ ...tekst('a', 'x'), sirina: 100.12 }]);
    expect(bajtovaPlatna(duga)).toBe(bajtovaPlatna(kratka));
  });
});
