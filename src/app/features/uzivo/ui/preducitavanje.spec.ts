import { infoSlajd, pitanjeSlajd, platnoSlajd } from '../data-access/izvodjenje-podaci.testing';
import { platno } from '../data-access/platno-podaci.testing';
import { FormulaSloj, SlikaSloj } from '../data-access/platno.models';
import { MedijInfo, medijUrl } from '../data-access/uzivo.models';
import { resetujUcitavanjeFormula } from './formula-ucitavanje';
import {
  fontoviZaPrikaz, imaFormuluZaCrtanje, preducitajFontove, preducitajFormule, preducitajFormuleSa, preducitajSlike,
  resetujPreducitavanje, sacekajFontove, slikeSlajda,
} from './preducitavanje';

beforeEach(() => resetujPreducitavanje());

const medij = (id: string): MedijInfo => ({ id, naziv: `${id}.png`, mime: 'image/png', velicina: 10 });

describe('slikeSlajda', () => {
  it('bez slajda i bez slika: prazno', () => {
    expect(slikeSlajda(null)).toEqual([]);
    expect(slikeSlajda(infoSlajd())).toEqual([]);
  });

  it('INFO i PITANJE: slika slajda, odnosno pitanja', () => {
    expect(slikeSlajda(infoSlajd({ slika: medij('info') }))).toEqual([medijUrl('info')]);
    expect(slikeSlajda(pitanjeSlajd('JEDAN_TACAN', { slika: medij('pit') }))).toEqual([medijUrl('pit')]);
  });

  it('PLATNO: pozadina, SLIKA, CRTEZ i slikaIzvora formule, bez ponavljanja', () => {
    const p = platno();
    p.pozadina.medijId = 'pozadina';
    const formula = p.slojevi.find((s) => s.tip === 'FORMULA') as FormulaSloj;
    formula.slikaIzvora = 'formula';
    const slika = p.slojevi.find((s) => s.tip === 'SLIKA') as SlikaSloj;
    p.slojevi.push({ ...slika, id: 'slika-2' });
    expect(slikeSlajda(platnoSlajd({ platno: p }))).toEqual([
      medijUrl('pozadina'),
      medijUrl('00000000-0000-0000-0000-000000000001'),
      medijUrl('formula'),
      medijUrl('00000000-0000-0000-0000-000000000002'),
    ]);
  });
});

describe('preducitajSlike', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('svaki URL se učitava jednom (new Image)', () => {
    const ucitane: string[] = [];
    vi.stubGlobal('Image', class { set src(v: string) { ucitane.push(v); } });
    preducitajSlike(['api/public/mediji/p-a', 'api/public/mediji/p-b', 'api/public/mediji/p-a']);
    preducitajSlike(['api/public/mediji/p-b', 'api/public/mediji/p-c']);
    expect(ucitane).toEqual(['api/public/mediji/p-a', 'api/public/mediji/p-b', 'api/public/mediji/p-c']);
  });

  it('neuspelo učitavanje se ne pamti: sledeći poziv pokušava ponovo', () => {
    const slike: { src: string; onerror: (() => void) | null }[] = [];
    vi.stubGlobal('Image', class {
      onerror: (() => void) | null = null;
      src = '';
      constructor() { slike.push(this); }
    });
    preducitajSlike(['api/public/mediji/greska']);
    expect(slike.length).toBe(1);
    slike[0].onerror?.();
    preducitajSlike(['api/public/mediji/greska']);
    expect(slike.length).toBe(2);
    preducitajSlike(['api/public/mediji/greska']);
    expect(slike.length).toBe(2);
  });
});

describe('fontoviZaPrikaz', () => {
  it('fontovi teme (naslov, telo) i fontovi platna; nepoznat font postaje Carlito', () => {
    const p = platno();
    const tekst = p.slojevi.find((s) => s.tip === 'TEKST')!;
    if (tekst.tip === 'TEKST') {
      tekst.pasusi[0].delovi[0].font = 'Tinos';
      tekst.pasusi[1].delovi[0].font = 'Comic Sans MS';
    }
    const fontovi = fontoviZaPrikaz('NACRT', [platnoSlajd({ platno: p }), infoSlajd(), null]);
    // Carlito: podrazumevani font platna (i zamena za Comic Sans); Cousine: formula bez slike izvora
    expect([...fontovi].sort()).toEqual(['Carlito', 'Cousine', 'IBM Plex Sans', 'Tinos']);
    expect([...fontoviZaPrikaz(undefined, [])]).toEqual(['IBM Plex Sans']);
  });

  it('PLATNO bez teksta uvek traži Carlito; formula sa slikom izvora ne traži Cousine', () => {
    const p = platno();
    p.slojevi = p.slojevi.filter((s) => s.tip === 'FORMULA');
    (p.slojevi[0] as FormulaSloj).slikaIzvora = 'f';
    expect([...fontoviZaPrikaz('NACRT', [platnoSlajd({ platno: p })])].sort()).toEqual(['Carlito', 'IBM Plex Sans']);
  });
});

describe('sacekajFontove', () => {
  let load: ReturnType<typeof vi.fn>;

  function postaviFonts(f: ((font: string, tekst?: string) => Promise<unknown>) | null) {
    load = vi.fn(f ?? (() => Promise.resolve([])));
    Object.defineProperty(document, 'fonts', { configurable: true, value: f === null ? undefined : { load } });
  }

  afterEach(() => {
    delete (document as Partial<Document> & { fonts?: unknown }).fonts;
    vi.useRealTimers();
  });

  it('učitava normalan i podebljan rez svakog fonta, sa latin-ext znakovima', async () => {
    postaviFonts(() => Promise.resolve([]));
    await sacekajFontove(['Carlito', 'IBM Plex Sans', 'Carlito']);
    expect(load.mock.calls.map((c) => c[0])).toEqual([
      '400 32px "Carlito"', '700 32px "Carlito"', '400 32px "IBM Plex Sans"', '700 32px "IBM Plex Sans"',
    ]);
    expect(load.mock.calls[0][1]).toContain('čćđšž');
  });

  it('razrešava se posle maxMs kad učitavanje ne završi', async () => {
    vi.useFakeTimers();
    postaviFonts(() => new Promise(() => undefined));
    let gotovo = false;
    void sacekajFontove(['Carlito'], 3000).then(() => { gotovo = true; });
    await vi.advanceTimersByTimeAsync(2999);
    expect(gotovo).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(gotovo).toBe(true);
  });

  it('razrešava se (ne odbija) kad document.fonts.load odbije', async () => {
    postaviFonts(() => Promise.reject(new Error('mreža')));
    await expect(sacekajFontove(['Carlito'])).resolves.toBeUndefined();
  });

  it('bez document.fonts (stari pregledač): odmah', async () => {
    postaviFonts(null);
    await expect(sacekajFontove(['Carlito'])).resolves.toBeUndefined();
  });

  it('preducitajFontove: odbijeno učitavanje se ne pamti', async () => {
    postaviFonts(() => Promise.reject(new Error('mreža')));
    preducitajFontove(['Arimo']);
    await new Promise((r) => setTimeout(r));
    preducitajFontove(['Arimo']);
    expect(load.mock.calls.map((c) => c[0])).toEqual([
      '400 32px "Arimo"', '700 32px "Arimo"', '400 32px "Arimo"', '700 32px "Arimo"',
    ]);
  });

  it('preducitajFontove: isti font se ne traži dvaput', () => {
    postaviFonts(() => Promise.resolve([]));
    preducitajFontove(['Tinos']);
    preducitajFontove(['Tinos', 'Cousine']);
    expect(load.mock.calls.map((c) => c[0])).toEqual([
      '400 32px "Tinos"', '700 32px "Tinos"', '400 32px "Cousine"', '700 32px "Cousine"',
    ]);
  });
});

describe('formule', () => {
  const saFormulom = (slikaIzvora: string | null = null) => {
    const p = platno();
    p.slojevi = p.slojevi.map((s) => (s.tip === 'FORMULA' ? { ...s, slikaIzvora } : s));
    return platnoSlajd({ platno: p });
  };
  const bezFormule = () => {
    const p = platno();
    p.slojevi = p.slojevi.filter((s) => s.tip !== 'FORMULA');
    return platnoSlajd({ platno: p });
  };
  const linkovi = () => document.head.querySelectorAll('link[data-gfs="mathlive"]');

  const ocisti = () => {
    // drugi specovi u istom jsdom-u crtaju formule pravim učitavačem (link ostaje u <head>)
    linkovi().forEach((l) => l.remove());
    resetujUcitavanjeFormula();
  };
  beforeEach(ocisti);
  afterEach(ocisti);

  it('imaFormuluZaCrtanje: PLATNO sa formulom bez slike izvora', () => {
    expect(imaFormuluZaCrtanje(saFormulom())).toBe(true);
    expect(imaFormuluZaCrtanje(saFormulom('slika-formule'))).toBe(false);
    expect(imaFormuluZaCrtanje(bezFormule())).toBe(false);
    expect(imaFormuluZaCrtanje(infoSlajd())).toBe(false);
    expect(imaFormuluZaCrtanje(null)).toBe(false);
  });

  it('preducitajFormule: bez formule ništa; kad bar jedan slajd ima formulu, modul i stil po jednom', async () => {
    const ucitaj = vi.fn(() => Promise.resolve({} as never));
    const stil = vi.fn(() => Promise.resolve());
    preducitajFormuleSa(ucitaj, stil, [infoSlajd(), bezFormule(), null]);
    expect(ucitaj).not.toHaveBeenCalled();
    expect(stil).not.toHaveBeenCalled();
    preducitajFormuleSa(ucitaj, stil, [bezFormule(), saFormulom()]);
    expect(ucitaj).toHaveBeenCalledTimes(1);
    expect(stil).toHaveBeenCalledTimes(1);
  });

  it('preducitajFormule (pravi učitavači): dva poziva -> jedan <link> stila (keš u formula-ucitavanje)', async () => {
    preducitajFormule(null, saFormulom());
    preducitajFormule(saFormulom());
    expect(linkovi().length).toBe(1);
  });

  it('preducitajFormule: greške učitavanja se gutaju', async () => {
    const ucitaj = vi.fn(() => Promise.reject(new Error('mreža')));
    const stil = vi.fn(() => Promise.reject(new Error('mreža')));
    expect(() => preducitajFormuleSa(ucitaj, stil, [saFormulom()])).not.toThrow();
    await new Promise((r) => setTimeout(r));
    expect(ucitaj).toHaveBeenCalledTimes(1);
  });
});
