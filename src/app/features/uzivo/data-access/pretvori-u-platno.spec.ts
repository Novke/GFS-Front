import type { Platno, SlikaSloj, Tema, TekstSloj } from './platno.models';
import { deoTeme, pasusSa, ZNAK_LISTE } from './platno-novo';
import { DUZINA_ID_MEDIJA, preslikajMedije, proveriKaoServer } from './platno-provera';
import { brojKoraka } from './platno-koraci';
import {
  infoUPlatno, OPISI_GUBITAKA, procenaVisine, skalaTeksta, type Gubitak, type SlikaZaPretvaranje, type UlazPretvaranja,
} from './pretvori-u-platno';
import { renderMarkdown } from '../ui/markdown';
import { oznakeListe } from '../ui/platno-tekst';
import { TEME } from '../ui/teme';

const SVE_TEME = Object.keys(TEME) as Tema[];
const ulaz = (izmene: Partial<UlazPretvaranja>): UlazPretvaranja =>
  ({ naslov: null, sadrzaj: null, slika: null, postepeno: false, ...izmene });
const SLIKA: SlikaZaPretvaranje = { id: '0b1e5c2a-9d4f-4c55-8a6e-3f2d1c0b9a87', naziv: 'graf.png', sirina: 1600, visina: 900 };

const sloj = (p: Platno, id: string) => p.slojevi.find((s) => s.id === id);
const telo = (p: Platno) => sloj(p, 's2') as TekstSloj;
const tekstPasusa = (s: TekstSloj) => s.pasusi.map((p) => p.delovi.map((d) => d.tekst).join(''));
/** Broj stavki koje INFO slajd otkriva jednu po jednu (`slajd-prikaz`: `:scope > ul > li, :scope > ol > li`). */
const stavkeInfa = (md: string) => {
  const d = document.createElement('div');
  d.innerHTML = renderMarkdown(md);
  return d.querySelectorAll(':scope > ul > li, :scope > ol > li').length;
};

describe('infoUPlatno: naslov i tekst', () => {
  it('naslov u fontu i boji naslova teme (40), telo sa podebljanim delom, bez animacija i gubitaka', () => {
    const { platno, gubici } = infoUPlatno(ulaz({ naslov: 'Uvod', sadrzaj: 'Tekst **jak**' }), 'NACRT');
    const s1 = sloj(platno, 's1') as TekstSloj;
    expect(s1.tip).toBe('TEKST');
    expect(s1.pasusi).toHaveLength(1);
    expect(s1.pasusi[0].delovi).toHaveLength(1);
    expect(s1.pasusi[0].delovi[0]).toMatchObject({ tekst: 'Uvod', font: TEME.NACRT.fontNaslova, velicina: 40, boja: TEME.NACRT.naslov });
    expect({ x: s1.x, y: s1.y, sirina: s1.sirina, visina: s1.visina }).toEqual({ x: 48, y: 28, sirina: 864, visina: 92 });
    const s2 = telo(platno);
    expect(s2.pasusi[0].delovi.map((d) => [d.tekst, d.podebljano])).toEqual([['Tekst ', false], ['jak', true]]);
    expect(s2.pasusi[0].delovi[0]).toMatchObject({ font: TEME.NACRT.fontTela, velicina: 28, boja: TEME.NACRT.tekst });
    expect({ y: s2.y, visina: s2.visina, sirina: s2.sirina }).toEqual({ y: 140, visina: 360, sirina: 864 });
    expect(platno.pozadina).toEqual({ boja: TEME.NACRT.pozadina, medijId: null });
    expect(platno.animacije).toEqual([]);
    expect(gubici).toEqual([]);
  });

  it('bez naslova telo počinje od 28; prazan ulaz je prazno platno', () => {
    expect(telo(infoUPlatno(ulaz({ sadrzaj: 'a' }), 'BELA').platno)).toMatchObject({ y: 28, visina: 472 });
    const prazno = infoUPlatno(ulaz({ naslov: '  ', sadrzaj: '' }), 'BELA');
    expect(prazno.platno.slojevi).toEqual([]);
    expect(prazno.gubici).toEqual([]);
  });

  it('kurziv, precrtano, kod u redu (Cousine 22) i podnaslov (veći, podebljan, font naslova)', () => {
    const s2 = telo(infoUPlatno(ulaz({ sadrzaj: '## Pod\n\n*k* ~~p~~ `kod`' }), 'PAPIR').platno);
    expect(s2.pasusi[0].delovi[0]).toMatchObject({ tekst: 'Pod', velicina: 32, podebljano: true, font: TEME.PAPIR.fontNaslova });
    const d = s2.pasusi[1].delovi;
    expect(d.find((x) => x.tekst === 'k')).toMatchObject({ kurziv: true });
    expect(d.find((x) => x.tekst === 'p')).toMatchObject({ precrtano: true });
    expect(d.find((x) => x.tekst === 'kod')).toMatchObject({ font: 'Cousine', velicina: 22 });
  });

  it('blok koda je jedan pasus u Cousine-u 22 sa \\n', () => {
    const s2 = telo(infoUPlatno(ulaz({ sadrzaj: '```\nx = 1\ny < 2\n```' }), 'NACRT').platno);
    expect(s2.pasusi).toHaveLength(1);
    expect(s2.pasusi[0].delovi).toEqual([expect.objectContaining({ tekst: 'x = 1\ny < 2', font: 'Cousine', velicina: 22 })]);
  });

  it('prelom reda (breaks) ostaje u istom pasusu; & i < ostaju doslovno', () => {
    expect(tekstPasusa(telo(infoUPlatno(ulaz({ sadrzaj: 'a\nb' }), 'NACRT').platno))).toEqual(['a\nb']);
    expect(tekstPasusa(telo(infoUPlatno(ulaz({ sadrzaj: 'a & b < c' }), 'NACRT').platno))).toEqual(['a & b < c']);
  });

  it('entiteti u tekstu kao u prikazu INFO-a (dekodirani), u kodu i posle \\& doslovno', () => {
    expect(tekstPasusa(telo(infoUPlatno(ulaz({ sadrzaj: '&amp; &lt;b&gt; &#169; &#x41;' }), 'NACRT').platno))).toEqual(['& <b> © A']);
    expect(tekstPasusa(telo(infoUPlatno(ulaz({ sadrzaj: '`&amp;` \\&amp;' }), 'NACRT').platno))).toEqual(['&amp; &amp;']);
  });

  it('INFO ne tumači $: dolar i "formula" ostaju tekst, bez FORMULA sloja', () => {
    const { platno } = infoUPlatno(ulaz({ sadrzaj: 'Cena je $x^2$ i 5$' }), 'NACRT');
    expect(tekstPasusa(telo(platno))).toEqual(['Cena je $x^2$ i 5$']);
    expect(platno.slojevi.map((s) => s.tip)).toEqual(['TEKST']);
  });

  it('sirov HTML se izbacuje kao u prikazu INFO-a (bez gubitka)', () => {
    const r = infoUPlatno(ulaz({ sadrzaj: 'a <span>b</span>\n\n<div>x</div>' }), 'NACRT');
    expect(tekstPasusa(telo(r.platno))).toEqual(['a b']);
    expect(r.gubici).toEqual([]);
  });
});

describe('infoUPlatno: liste i koraci', () => {
  it('ugnježdena lista: nivoi, oznaka i uvlačenje; postepeno -> KLIK po stavci najvišeg nivoa', () => {
    const md = '- a\n  - b\n- c';
    const { platno } = infoUPlatno(ulaz({ sadrzaj: md, postepeno: true }), 'NACRT');
    const p = telo(platno).pasusi;
    expect(p.map((x) => [x.delovi[0].tekst, x.nivo, x.lista?.vrsta, x.lista?.znak, x.uvlacenje.levo, x.uvlacenje.prviRed])).toEqual([
      ['a', 0, 'ZNAK', ZNAK_LISTE, 18, -18],
      ['b', 1, 'ZNAK', ZNAK_LISTE, 54, -18],
      ['c', 0, 'ZNAK', ZNAK_LISTE, 18, -18],
    ]);
    expect(platno.animacije.map((a) => [a.id, a.okidac, a.pasus, a.slojId, a.vrsta, a.efekat])).toEqual([
      ['a1', 'KLIK', 0, 's2', 'ULAZ', 'FADE'],
      ['a2', 'SA_PRETHODNIM', 1, 's2', 'ULAZ', 'FADE'],
      ['a3', 'KLIK', 2, 's2', 'ULAZ', 'FADE'],
    ]);
    expect(brojKoraka(platno)).toBe(2);
    expect(brojKoraka(platno)).toBe(stavkeInfa(md));
  });

  it('bez postepeno nema animacija', () => {
    expect(infoUPlatno(ulaz({ sadrzaj: '- a\n- b' }), 'NACRT').platno.animacije).toEqual([]);
  });

  it('numeracija počinje od start; nastavak stavke je bez oznake i ne prekida brojanje', () => {
    expect(oznakeListe(telo(infoUPlatno(ulaz({ sadrzaj: '3. x\n4. y' }), 'NACRT').platno).pasusi)).toEqual(['3.', '4.']);
    const s2 = telo(infoUPlatno(ulaz({ sadrzaj: '1. a\n\n   nastavak\n2. b' }), 'NACRT').platno);
    expect(oznakeListe(s2.pasusi)).toEqual(['1.', null, '2.']);
    expect(s2.pasusi[1].uvlacenje).toEqual({ levo: 18, prviRed: 0 });
  });

  it.each([
    '- a\n  - b\n- c',
    'Uvod\n\n- a\n- b\n\nPosle\n\n1. x\n2. y',
    '1. a\n\n   nastavak\n2. b',
    '- \n- b',
    '- [ ] zadatak\n- [x] gotovo',
    '> - a\n> - b\n\n- c',
    '- # naslov u stavci\n- ```\n  kod\n  ```',
  ])('broj koraka je isti kao kod INFO slajda: %j', (md) => {
    const { platno } = infoUPlatno(ulaz({ sadrzaj: md, postepeno: true }), 'NACRT');
    expect(brojKoraka(platno)).toBe(stavkeInfa(md));
    expect(proveriKaoServer(platno)).toBeNull();
  });
});

describe('infoUPlatno: gubici', () => {
  it.each<[string, Gubitak]>([
    ['[veza](https://primer.rs)', 'VEZE'],
    ['tekst ![slika](x.png)', 'SLIKE_U_TEKSTU'],
    ['| a | b |\n|---|---|\n| 1 | 2 |', 'TABELE'],
    ['---', 'LINIJE'],
    ['> citat', 'CITATI'],
  ])('%j -> %s', (md, g) => {
    expect(infoUPlatno(ulaz({ sadrzaj: md }), 'NACRT').gubici).toEqual([g]);
    expect(OPISI_GUBITAKA[g]).toBeTruthy();
  });

  it('veza zadržava tekst; tabela postaje redovi sa tabulatorom (zaglavlje podebljano)', () => {
    expect(tekstPasusa(telo(infoUPlatno(ulaz({ sadrzaj: 'vidi [ovde](https://primer.rs)' }), 'NACRT').platno))).toEqual(['vidi ovde']);
    const s2 = telo(infoUPlatno(ulaz({ sadrzaj: '| a | b |\n|---|---|\n| 1 | 2 |' }), 'NACRT').platno);
    expect(tekstPasusa(s2)).toEqual(['a\tb', '1\t2']);
    expect(s2.pasusi[0].delovi.every((d) => d.podebljano)).toBe(true);
    expect(s2.pasusi[1].delovi.some((d) => d.podebljano)).toBe(false);
  });

  it('citat je kurziv i uvučen 36 više; lista u citatu nije korak (kao INFO)', () => {
    const s2 = telo(infoUPlatno(ulaz({ sadrzaj: '> citat' }), 'NACRT').platno);
    expect(s2.pasusi[0].uvlacenje.levo).toBe(36);
    expect(s2.pasusi[0].delovi.every((d) => d.kurziv)).toBe(true);
    const r = infoUPlatno(ulaz({ sadrzaj: '> - a\n> - b', postepeno: true }), 'NACRT');
    expect(telo(r.platno).pasusi.map((p) => p.uvlacenje.levo)).toEqual([54, 54]);
    expect(r.platno.animacije).toEqual([]);
  });

  it('dugačak tekst: skala u 0,25..1 i gubitak DUGACAK_TEKST', () => {
    const r = infoUPlatno(ulaz({ sadrzaj: 'x '.repeat(5000) }), 'NACRT');
    const skala = telo(r.platno).okvir.skala;
    expect(skala).toBeLessThan(1);
    expect(skala).toBeGreaterThanOrEqual(0.25);
    expect(r.gubici).toContain('DUGACAK_TEKST');
  });
});

describe('infoUPlatno: slika', () => {
  it('uz tekst: desna kolona 320, contain i centrirano', () => {
    const { platno } = infoUPlatno(ulaz({ naslov: 'N', sadrzaj: 'a', slika: SLIKA }), 'NACRT');
    const s3 = sloj(platno, 's3') as SlikaSloj;
    expect({ x: s3.x, y: s3.y, sirina: s3.sirina, visina: s3.visina }).toEqual({ x: 592, y: 230, sirina: 320, visina: 180 });
    expect(s3).toMatchObject({ tip: 'SLIKA', medijId: SLIKA.id, naziv: 'graf.png', zakljucan: false });
    expect(telo(platno).sirina).toBe(520);
  });

  it('samo slika: ceo prostor tela', () => {
    const s3 = sloj(infoUPlatno(ulaz({ slika: SLIKA }), 'NACRT').platno, 's3') as SlikaSloj;
    expect(s3.x).toBeCloseTo(60.4, 1);
    expect(s3.y).toBe(28);
    expect(s3.sirina).toBeCloseTo(839.1, 1);
    expect(s3.visina).toBe(472);
  });

  it('naziv slike se skraćuje na 60 znakova (code point-i), prazan je null', () => {
    const dug = infoUPlatno(ulaz({ slika: { ...SLIKA, naziv: '😀'.repeat(70) } }), 'NACRT').platno;
    expect([...(sloj(dug, 's3') as SlikaSloj).naziv!]).toHaveLength(60);
    expect((sloj(infoUPlatno(ulaz({ slika: { ...SLIKA, naziv: '' } }), 'NACRT').platno, 's3') as SlikaSloj).naziv).toBeNull();
  });
});

describe('procenaVisine i skalaTeksta', () => {
  it('jedan red: 28 * 1,2 bez razmaka', () => {
    expect(procenaVisine([pasusSa(deoTeme('NACRT', 'telo', 28, '0123456789'))], 864)).toBeCloseTo(33.6, 6);
  });

  it('kad staje, skala je 1; inače korak 0,05 i najmanje 0,25', () => {
    const kratak = [pasusSa(deoTeme('NACRT', 'telo', 28, 'kratko'))];
    expect(skalaTeksta(kratak, 864, 360)).toBe(1);
    const dug = [pasusSa(deoTeme('NACRT', 'telo', 28, 'x'.repeat(400)))];
    const s = skalaTeksta(dug, 864, 100);
    expect(s).toBeLessThan(1);
    expect(Math.round(s * 20)).toBeCloseTo(s * 20, 9);
    expect(skalaTeksta([pasusSa(deoTeme('NACRT', 'telo', 28, 'x'.repeat(100_000)))], 864, 100)).toBe(0.25);
  });
});

describe('infoUPlatno: server prima svaki rezultat', () => {
  const ULAZI: UlazPretvaranja[] = [
    ulaz({ naslov: 'Uvod', sadrzaj: 'Tekst **jak**' }),
    ulaz({ sadrzaj: '- a\n  - b\n- c', postepeno: true }),
    ulaz({ sadrzaj: '3. x\n4. y' }),
    ulaz({ sadrzaj: '1. a\n\n   nastavak\n2. b', postepeno: true }),
    ulaz({ sadrzaj: '[veza](https://primer.rs) ![s](x.png)\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n---\n\n> citat' }),
    ulaz({ sadrzaj: '`kod`\n\n```\na\nb\n```' }),
    ulaz({ sadrzaj: 'a\nb\n\na & b < c' }),
    ulaz({ naslov: 'N', sadrzaj: 'a', slika: SLIKA }),
    ulaz({ slika: SLIKA }),
    ulaz({ sadrzaj: 'x '.repeat(5000) }),
    ulaz({ naslov: 'Sve', sadrzaj: '# H1\n###### H6\n\n- **a** *b*\n  1. c\n     - d\n\n> > dvostruki', slika: SLIKA, postepeno: true }),
  ];
  const kaoServer = (p: Platno) => preslikajMedije(p, () => 'a'.repeat(DUZINA_ID_MEDIJA));

  it.each(ULAZI.map((u, i) => [i, u] as const))('ulaz %i', (_i, u) => {
    for (const tema of SVE_TEME) expect(proveriKaoServer(kaoServer(infoUPlatno(u, tema).platno)), tema).toBeNull();
  });
});
