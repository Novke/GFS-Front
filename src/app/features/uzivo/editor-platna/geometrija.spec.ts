import type { OblikSloj, Sloj, SlikaSloj, Tacka } from '../data-access/platno.models';
import {
  type Kutija, type Obuhvat, type Rucka, MAX_VELICINA, MAX_XY, MIN_XY, centar, krajIzUgla, krajeviLinije, kutijaSloja,
  linijaIzKrajeva, normalizujUgao, obuhvat, obuhvatSvih, ogranici, pogadja, pomeriKutiju, prianjanje, promeniVelicinu,
  slojNaTacki, uLokalne, uPravougaoniku, uSvetske, uglovi, ugaoIDuzina, ugaoRotacije,
} from './geometrija';

const K: Kutija = { x: 100, y: 100, sirina: 200, visina: 100, rotacija: 0 };

function slika(id: string, k: Partial<Kutija> = {}): SlikaSloj {
  return {
    id, tip: 'SLIKA', naziv: null, x: 100, y: 100, sirina: 200, visina: 100, rotacija: 0, providnost: 1, zakljucan: false,
    senka: null, medijId: 'm', isecak: { levo: 0, gore: 0, desno: 0, dole: 0 }, ...k,
  };
}

/** Linija iz briefa: (100, 100), 240 x 24, krajevi (0, 12) i (240, 12), debljina 3. */
function linija(deo: Partial<OblikSloj> = {}): OblikSloj {
  return {
    id: 'l', tip: 'OBLIK', naziv: null, x: 100, y: 100, sirina: 240, visina: 24, rotacija: 0, providnost: 1,
    zakljucan: false, senka: null, oblik: 'LINIJA', popuna: null, ivica: { boja: '#000000', debljina: 3, crtica: 'PUNA' },
    od: { x: 0, y: 12 }, do: { x: 240, y: 12 }, ...deo,
  };
}

/** Najviše 2 decimale (kao server). */
function dveDecimale(v: number): boolean {
  return Number.isInteger(Number((v * 100).toFixed(6)));
}
function sveDveDecimale(o: unknown): void {
  if (typeof o === 'number') {
    expect(dveDecimale(o), `${o} ima više od 2 decimale`).toBe(true);
  } else if (Array.isArray(o)) {
    o.forEach(sveDveDecimale);
  } else if (o && typeof o === 'object') {
    Object.values(o).forEach(sveDveDecimale);
  }
}

function kaoKutija(k: Kutija, ocekivano: Partial<Kutija>): void {
  for (const [polje, v] of Object.entries(ocekivano)) expect(k[polje as keyof Kutija], polje).toBeCloseTo(v as number, 2);
  sveDveDecimale(k);
}
function kaoTacka(t: Tacka, x: number, y: number): void {
  expect(t.x).toBeCloseTo(x, 2);
  expect(t.y).toBeCloseTo(y, 2);
}

describe('geometrija: osnovno', () => {
  it('kutija, centar i prelaz lokalno <-> platno', () => {
    expect(kutijaSloja(slika('a', { rotacija: 30 }))).toEqual({ x: 100, y: 100, sirina: 200, visina: 100, rotacija: 30 });
    expect(centar(K)).toEqual({ x: 200, y: 150 });
    const r = { ...K, rotacija: 90 };
    kaoTacka(uLokalne(r, { x: 200, y: 240 }), 90, 0);
    kaoTacka(uSvetske(r, { x: 90, y: 0 }), 200, 240);
    const t = { x: 123.4, y: 77.7 };
    const k30 = { ...K, rotacija: 30 };
    kaoTacka(uSvetske(k30, uLokalne(k30, t)), t.x, t.y);
  });

  it('uglovi, obuhvat i obuhvat svih', () => {
    const [sz, si, ji, jz] = uglovi(K);
    kaoTacka(sz, 100, 100);
    kaoTacka(si, 300, 100);
    kaoTacka(ji, 300, 200);
    kaoTacka(jz, 100, 200);
    const o = obuhvat({ ...K, rotacija: 90 });
    expect(o.x).toBeCloseTo(150, 6);
    expect(o.y).toBeCloseTo(50, 6);
    expect(o.sirina).toBeCloseTo(100, 6);
    expect(o.visina).toBeCloseTo(200, 6);
    expect(obuhvatSvih([])).toBeNull();
    expect(obuhvatSvih([K, { x: 400, y: 0, sirina: 10, visina: 10, rotacija: 0 }])).toEqual({ x: 100, y: 0, sirina: 310, visina: 200 });
  });

  it('pomeriKutiju pomera i drži granice servera', () => {
    expect(pomeriKutiju(K, 10.004, -5)).toEqual({ ...K, x: 110, y: 95 });
    const van = pomeriKutiju(K, 5000, -5000);
    expect(van.x).toBe(MAX_XY);
    expect(van.y).toBe(MIN_XY);
  });
});

describe('geometrija: promeniVelicinu', () => {
  it.each<[string, Rucka, Tacka, { odnos?: boolean; odCentra?: boolean }, Partial<Kutija>]>([
    ['JI', 'JI', { x: 350, y: 250 }, {}, { x: 100, y: 100, sirina: 250, visina: 150 }],
    ['SZ', 'SZ', { x: 50, y: 50 }, {}, { x: 50, y: 50, sirina: 250, visina: 150 }],
    ['I ne gleda y', 'I', { x: 400, y: 999 }, {}, { x: 100, y: 100, sirina: 300, visina: 100 }],
    ['JI + odnos', 'JI', { x: 500, y: 160 }, { odnos: true }, { x: 100, y: 100, sirina: 400, visina: 200 }],
    ['JI + odCentra', 'JI', { x: 350, y: 250 }, { odCentra: true }, { x: 50, y: 50, sirina: 300, visina: 200 }],
    ['preko sidra', 'I', { x: 40, y: 150 }, {}, { x: 40, y: 100, sirina: 60, visina: 100 }],
    ['minimum 1', 'I', { x: 100.4, y: 150 }, {}, { sirina: 1 }],
  ])('%s', (_, rucka, pokazivac, o, ocekivano) => {
    const k = promeniVelicinu(K, rucka, pokazivac, o);
    kaoKutija(k, { rotacija: 0, ...ocekivano });
  });

  it('maksimum: širina i visina 2880, x i y u granicama', () => {
    const k = promeniVelicinu(K, 'JI', { x: 5000, y: 5000 });
    expect(k.sirina).toBe(MAX_VELICINA);
    expect(k.visina).toBe(MAX_VELICINA);
    for (const v of [k.x, k.y]) {
      expect(v).toBeGreaterThanOrEqual(MIN_XY);
      expect(v).toBeLessThanOrEqual(MAX_XY);
    }
    sveDveDecimale(k);
  });

  it('odnos ostaje i kad bi jedna strana prešla 2880', () => {
    const k = promeniVelicinu(K, 'JI', { x: 9000, y: 200 }, { odnos: true });
    expect(k.sirina).toBe(MAX_VELICINA);
    expect(k.visina).toBe(MAX_VELICINA / 2);
  });

  it('rotacija 90: ručka I ide naniže na platnu', () => {
    kaoKutija(promeniVelicinu({ ...K, rotacija: 90 }, 'I', { x: 200, y: 300 }), { x: 75, y: 125, sirina: 250, visina: 100, rotacija: 90 });
  });

  const RUCKE: Rucka[] = ['SZ', 'S', 'SI', 'I', 'JI', 'J', 'JZ', 'Z'];
  const SMER: Record<Rucka, { sx: number; sy: number }> = {
    SZ: { sx: -1, sy: -1 }, S: { sx: 0, sy: -1 }, SI: { sx: 1, sy: -1 }, I: { sx: 1, sy: 0 },
    JI: { sx: 1, sy: 1 }, J: { sx: 0, sy: 1 }, JZ: { sx: -1, sy: 1 }, Z: { sx: -1, sy: 0 },
  };
  /** Sidro: suprotni ugao (ugaona ručka) ili sredina suprotne ivice (ivična ručka), na platnu. */
  const sidroKutije = (k: Kutija, r: Rucka) => uSvetske(k, { x: -SMER[r].sx * k.sirina / 2, y: -SMER[r].sy * k.visina / 2 });
  /** Pomeraj iz lokalnih osa sloja u ose platna (samo rotacija). */
  const uOsePlatna = (k: Kutija, l: Tacka) => uSvetske({ ...k, x: -k.sirina / 2, y: -k.visina / 2 }, l);
  const SLUCAJEVI = [0, 30, 90, 135, 270].flatMap((rotacija) => RUCKE.map((r) => [rotacija, r] as const));
  const ugao37 = 37 * Math.PI / 180;

  // Pokazivač se udaljava od sidra u smeru ručke (u osama sloja), pa okvir ostaje sa iste strane sidra.
  it.each(SLUCAJEVI)('suprotna ivica ostaje na mestu (rotacija %s, ručka %s)', (rotacija, rucka) => {
    const k = { ...K, rotacija };
    const sidro = sidroKutije(k, rucka);
    const smer = uOsePlatna(k, { x: SMER[rucka].sx * 300 * Math.cos(ugao37), y: SMER[rucka].sy * 300 * Math.sin(ugao37) });
    const nova = promeniVelicinu(k, rucka, { x: sidro.x + smer.x, y: sidro.y + smer.y });
    const posle = sidroKutije(nova, rucka);
    expect(Math.abs(posle.x - sidro.x)).toBeLessThan(0.02);
    expect(Math.abs(posle.y - sidro.y)).toBeLessThan(0.02);
    expect(nova.rotacija).toBe(rotacija);
    sveDveDecimale(nova);
  });

  // Pokazivač pod 37° na platnu: za neke rotacije prelazi preko sidra, pa sidro postaje drugi ugao (ili sredina druge
  // ivice) novog okvira (model nema preslikavanje), ali tačka sidra na platnu i dalje ostaje na mestu.
  it.each(SLUCAJEVI)('i preko sidra tačka sidra ostaje na okviru (rotacija %s, ručka %s)', (rotacija, rucka) => {
    const k = { ...K, rotacija };
    const sidro = sidroKutije(k, rucka);
    const nova = promeniVelicinu(k, rucka, { x: sidro.x + 300 * Math.cos(ugao37), y: sidro.y + 300 * Math.sin(ugao37) });
    const tacke = RUCKE.map((r) => sidroKutije(nova, r));
    const najblizi = Math.min(...tacke.map((t) => Math.max(Math.abs(t.x - sidro.x), Math.abs(t.y - sidro.y))));
    expect(najblizi).toBeLessThan(0.02);
    expect(nova.rotacija).toBe(rotacija);
    sveDveDecimale(nova);
  });

  /** Rezultat je u granicama servera (x, y u [-960, 1920], širina i visina u [1, 2880]) i ima najviše 2 decimale. */
  function uGranicama(k: Kutija): void {
    for (const v of [k.x, k.y]) {
      expect(v).toBeGreaterThanOrEqual(MIN_XY);
      expect(v).toBeLessThanOrEqual(MAX_XY);
    }
    for (const v of [k.sirina, k.visina]) {
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(MAX_VELICINA);
    }
    sveDveDecimale(k);
  }

  // Review Focus 4: kad bi stezanje x/y (ili širine i visine) proradilo, sloj se smanjuje umesto da klizi, pa sidro
  // (kod `odCentra` centar) ostaje na mestu.
  it.each<[string, Kutija, Rucka, Tacka, { odnos?: boolean; odCentra?: boolean }]>([
    ['JI + odCentra, x = 1500', K, 'JI', { x: 1500, y: 250 }, { odCentra: true }],
    ['JI + odCentra, x = 1800', K, 'JI', { x: 1800, y: 250 }, { odCentra: true }],
    ['JI + odCentra + odnos, x = 1800', K, 'JI', { x: 1800, y: 250 }, { odCentra: true, odnos: true }],
    ['SZ, x = -1000', K, 'SZ', { x: -1000, y: 50 }, {}],
    ['SZ, x = -1500', K, 'SZ', { x: -1500, y: 50 }, {}],
    ['SZ + odnos, x = -1500', K, 'SZ', { x: -1500, y: 50 }, { odnos: true }],
    ['SZ daleko gore-levo', K, 'SZ', { x: -4000, y: -4000 }, {}],
    ['Z, x = -1500', K, 'Z', { x: -1500, y: 999 }, {}],
    ['S, y = -1500', K, 'S', { x: -999, y: -1500 }, {}],
    ['rotacija 90, I do y = 2600', { ...K, rotacija: 90 }, 'I', { x: 200, y: 2600 }, {}],
    ['rotacija 90, I do y = 3000', { ...K, rotacija: 90 }, 'I', { x: 200, y: 3000 }, {}],
    ['rotacija 90, JI daleko', { ...K, rotacija: 90 }, 'JI', { x: -3000, y: 3000 }, {}],
    ['rotacija 135, JI daleko', { ...K, rotacija: 135 }, 'JI', { x: -3000, y: 3000 }, {}],
    ['rotacija 135, JI + odnos daleko', { ...K, rotacija: 135 }, 'JI', { x: -3000, y: 3000 }, { odnos: true }],
    ['rotacija 30, J + odCentra daleko', { ...K, rotacija: 30 }, 'J', { x: 200, y: 4000 }, { odCentra: true }],
  ])('na granici platna sidro ostaje: %s', (_, k, rucka, pokazivac, o) => {
    const pre = o.odCentra ? centar(k) : sidroKutije(k, rucka);
    const nova = promeniVelicinu(k, rucka, pokazivac, o);
    const posle = o.odCentra ? centar(nova) : sidroKutije(nova, rucka);
    expect(Math.abs(posle.x - pre.x), 'sidro x').toBeLessThan(0.02);
    expect(Math.abs(posle.y - pre.y), 'sidro y').toBeLessThan(0.02);
    expect(nova.rotacija).toBe(k.rotacija);
    uGranicama(nova);
    if (o.odnos) expect(Math.abs(nova.sirina / nova.visina - k.sirina / k.visina)).toBeLessThan(0.01);
  });

  // Isto svojstvo za sve rotacije i ručke: pokazivač 4000 jedinica od sidra u smeru ručke (u osama sloja) uvek
  // stegne širinu ili visinu na 2880, a većinom i položaj.
  it.each(SLUCAJEVI)('daleko van platna sidro ostaje (rotacija %s, ručka %s)', (rotacija, rucka) => {
    const k = { ...K, rotacija };
    const sidro = sidroKutije(k, rucka);
    const smer = uOsePlatna(k, { x: SMER[rucka].sx * 4000, y: SMER[rucka].sy * 4000 });
    const nova = promeniVelicinu(k, rucka, { x: sidro.x + smer.x, y: sidro.y + smer.y });
    const posle = sidroKutije(nova, rucka);
    expect(Math.abs(posle.x - sidro.x)).toBeLessThan(0.02);
    expect(Math.abs(posle.y - sidro.y)).toBeLessThan(0.02);
    uGranicama(nova);
  });
});

describe('geometrija: rotacija', () => {
  it.each<[Tacka, number | undefined, number]>([
    [{ x: 200, y: 50 }, undefined, 0],
    [{ x: 300, y: 150 }, undefined, 90],
    [{ x: 200, y: 250 }, undefined, 180],
    [{ x: 100, y: 150 }, undefined, 270],
    [{ x: 273.14, y: 81.8 }, 15, 45],
  ])('ugaoRotacije(K, %o, korak %s) = %s', (t, korak, ugao) => {
    const u = ugaoRotacije(K, t, korak);
    expect(u).toBeCloseTo(ugao, 2);
    sveDveDecimale(u);
  });

  it.each([[-90, 270], [360, 0], [725.5, 5.5], [359.999, 0], [-0.001, 0], [12.345, 12.35]])('normalizujUgao(%s) = %s', (u, ocekivano) => {
    expect(normalizujUgao(u)).toBe(ocekivano);
  });
});

describe('geometrija: pogađanje i izbor', () => {
  it('rotiran sloj se pogađa unutar uspravne kutije', () => {
    const s = slika('a', { rotacija: 90 });
    expect(pogadja(s, { x: 200, y: 240 }, 0)).toBe(true);
    expect(pogadja(s, { x: 290, y: 150 }, 0)).toBe(false);
  });

  it('linija se pogađa blizu duži', () => {
    const s = linija();
    expect(pogadja(s, { x: 220, y: 112 }, 4)).toBe(true);
    expect(pogadja(s, { x: 220, y: 130 }, 4)).toBe(false);
    expect(pogadja(s, { x: 220, y: 117 }, 4)).toBe(true);
    expect(pogadja(linija({ od: null, do: null }), { x: 220, y: 112 }, 0)).toBe(true);
  });

  it('slojNaTacki daje gornji sloj, poštuje preskoci, prazno je null', () => {
    const donji = slika('d');
    const gornji = slika('g', { x: 150 });
    const slojevi: Sloj[] = [donji, gornji];
    expect(slojNaTacki(slojevi, { x: 200, y: 150 }, 0)?.id).toBe('g');
    expect(slojNaTacki(slojevi, { x: 200, y: 150 }, 0, new Set(['g']))?.id).toBe('d');
    expect(slojNaTacki([], { x: 200, y: 150 }, 0)).toBeNull();
    expect(slojNaTacki(slojevi, { x: 900, y: 500 }, 0)).toBeNull();
  });

  it('uPravougaoniku bira samo slojeve čiji je obuhvat ceo unutra', () => {
    const slojevi: Sloj[] = [
      slika('unutra', { x: 10, y: 10, sirina: 50, visina: 50 }),
      slika('delimicno', { x: 80, y: 10, sirina: 50, visina: 50 }),
      slika('rotiran', { x: 10, y: 10, sirina: 50, visina: 50, rotacija: 90 }),
      slika('preskocen', { x: 20, y: 20, sirina: 10, visina: 10 }),
    ];
    const p: Obuhvat = { x: 0, y: 0, sirina: 100, visina: 100 };
    expect(uPravougaoniku(slojevi, p, new Set(['preskocen']))).toEqual(['unutra', 'rotiran']);
    expect(uPravougaoniku(slojevi, { x: 10, y: 10, sirina: 50, visina: 50 })).toEqual(['unutra', 'rotiran', 'preskocen']);
    // Pravougaonik prevučen nagore i ulevo (negativna širina i visina) bira isto kao uspravan.
    expect(uPravougaoniku(slojevi, { x: 100, y: 100, sirina: -100, visina: -100 })).toEqual(['unutra', 'rotiran', 'preskocen']);
    expect(uPravougaoniku(slojevi, { x: 100, y: 0, sirina: -100, visina: 100 }, new Set(['preskocen']))).toEqual(['unutra', 'rotiran']);
  });
});

describe('geometrija: prianjanje (vođice)', () => {
  it('leva ivica uz drugi sloj', () => {
    const r = prianjanje({ x: 597, y: 10, sirina: 50, visina: 50 }, [{ x: 600, y: 300, sirina: 100, visina: 100 }], 5);
    expect(r).toEqual({ dx: 3, dy: 0, vodjice: [{ osa: 'x', poz: 600, od: 10, do: 400 }] });
  });

  it('centar platna po x i gornja ivica platna po y', () => {
    const r = prianjanje({ x: 452, y: 0, sirina: 50, visina: 50 }, [], 5);
    expect(r.dx).toBe(3);
    expect(r.dy).toBe(0);
    expect(r.vodjice).toEqual([
      { osa: 'x', poz: 480, od: 0, do: 540 },
      { osa: 'y', poz: 0, od: 0, do: 960 },
    ]);
  });

  it('ništa u pragu: bez pomeraja i vođica', () => {
    expect(prianjanje({ x: 300, y: 300, sirina: 50, visina: 50 }, [], 5)).toEqual({ dx: 0, dy: 0, vodjice: [] });
  });

  it('od dve mete bira bližu', () => {
    const r = prianjanje({ x: 200, y: 100, sirina: 50, visina: 50 },
      [{ x: 203, y: 400, sirina: 10, visina: 10 }, { x: 198, y: 400, sirina: 10, visina: 10 }], 5);
    expect(r.dx).toBe(-2);
    expect(r.dy).toBe(0);
    expect(r.vodjice).toEqual([{ osa: 'x', poz: 198, od: 100, do: 410 }]);
  });
});

describe('geometrija: krajevi linije', () => {
  it('krajevi na platnu i nova kutija oko krajeva', () => {
    const s = linija();
    const [a, b] = krajeviLinije(s);
    kaoTacka(a, 100, 112);
    kaoTacka(b, 340, 112);
    const n = linijaIzKrajeva(s, { x: 100, y: 112 }, { x: 340, y: 212 });
    expect(n).toMatchObject({ x: 91, y: 103, sirina: 258, visina: 118, rotacija: 0, od: { x: 9, y: 9 }, do: { x: 249, y: 109 } });
    expect(n.id).toBe('l');
    expect(n.ivica).toEqual(s.ivica);
  });

  it('vodoravna linija ima visinu > 0', () => {
    const n = linijaIzKrajeva(linija(), { x: 100, y: 112 }, { x: 340, y: 112 });
    expect(n.visina).toBe(18);
    expect(n.od).toEqual({ x: 9, y: 9 });
    expect(n.do).toEqual({ x: 249, y: 9 });
  });

  it('rotirana linija: krajevi na platnu, pa "ispečena" rotacija', () => {
    const s = linija({ rotacija: 90 });
    const [a, b] = krajeviLinije(s);
    kaoTacka(a, 220, -8);
    kaoTacka(b, 220, 232);
    const n = linijaIzKrajeva(s, a, b);
    expect(n).toMatchObject({ x: 211, y: -17, sirina: 18, visina: 258, rotacija: 0, od: { x: 9, y: 9 }, do: { x: 9, y: 249 } });
    sveDveDecimale([n.x, n.y, n.sirina, n.visina, n.od, n.do]);
  });

  it('podrazumevani krajevi (od/do null) su sredina leve i desne ivice', () => {
    const [a, b] = krajeviLinije(linija({ od: null, do: null }));
    kaoTacka(a, 100, 112);
    kaoTacka(b, 340, 112);
  });

  it('linija van granica servera ostaje u granicama', () => {
    const n = linijaIzKrajeva(linija(), { x: -2000, y: 100 }, { x: 3000, y: 100 });
    expect(n.x).toBeGreaterThanOrEqual(MIN_XY);
    expect(n.sirina).toBeLessThanOrEqual(MAX_VELICINA);
    // Krajevi su relativni u okviru: server traži [-2880, 2880], a okvir mora da ih obuhvati.
    for (const t of [n.od!, n.do!]) {
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.x).toBeLessThanOrEqual(n.sirina);
      expect(t.y).toBeGreaterThanOrEqual(0);
      expect(t.y).toBeLessThanOrEqual(n.visina);
    }
    sveDveDecimale([n.x, n.y, n.sirina, n.visina, n.od, n.do]);
  });

  it.each<[Tacka, Tacka, number, number]>([
    [{ x: 100, y: 100 }, { x: 200, y: 100 }, 0, 100],
    [{ x: 100, y: 100 }, { x: 100, y: 200 }, 90, 100],
    [{ x: 100, y: 100 }, { x: 0, y: 100 }, 180, 100],
  ])('ugaoIDuzina(%o, %o) = {%s, %s}', (a, b, ugao, duzina) => {
    expect(ugaoIDuzina(a, b)).toEqual({ ugao, duzina });
  });

  it('krajIzUgla', () => {
    expect(krajIzUgla({ x: 100, y: 100 }, 90, 50)).toEqual({ x: 100, y: 150 });
    expect(krajIzUgla({ x: 100, y: 100 }, 45, 100)).toEqual({ x: 170.71, y: 170.71 });
  });
});

describe('geometrija: ogranici', () => {
  it('u granice servera, 2 decimale, ugao u [0, 360)', () => {
    expect(ogranici({ x: 2000, y: -2000, sirina: 0.001, visina: 3000, rotacija: -30 }))
      .toEqual({ x: 1920, y: -960, sirina: 0.01, visina: 2880, rotacija: 330 });
    const k = ogranici({ x: 1.005, y: 2.675, sirina: 10.123, visina: 0.5, rotacija: 10.999 });
    expect(k).toEqual({ x: 1.01, y: 2.68, sirina: 10.12, visina: 0.5, rotacija: 11 });
  });
});
