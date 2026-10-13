import { describe, expect, it } from 'vitest';
import { pasus } from '../data-access/platno-podaci.testing';
import type { Pasus, Sloj, TabelaSloj, TekstSloj } from '../data-access/platno.models';
import {
  PODRAZUMEVANI_TAB, pasusiZaMerenje, poravnajSveTabove, poravnajTabove, sirinaTaba, trebaMerenjeTabova,
} from './platno-tabovi';

function sa(deo: Partial<Pasus>, tekst = 'a\tb'): Pasus {
  return { ...pasus(tekst), ...deo };
}
const levi = (...poz: number[]): Pasus['tabulatori'] => poz.map((p) => ({ poz: p, poravnanje: 'LEVO' }));
const visece = { uvlacenje: { levo: 18, prviRed: -18 } };

const rect = (left: number, width = 0) => ({ left, width } as DOMRect);

/**
 * Pasus u DOM-u sa tabovima kao `.uz-pl-tab`. `levo()` = px od leve ivice pasusa; pasus je na `left` 100 px, pa je
 * lažni `getBoundingClientRect` taba 100 + levo (merenje bez transformacije), a lažni `offsetLeft` levo (rezervno
 * merenje kad pasus ili predak ima transformaciju). `offsetTop`/`offsetHeight` određuju red.
 */
function dom(tabovi: { levo: () => number; gore?: number }[]): { p: HTMLElement; tabovi: HTMLElement[] } {
  const p = document.createElement('p');
  p.getBoundingClientRect = () => rect(100);
  const el = tabovi.map(({ levo, gore = 0 }) => {
    const t = document.createElement('span');
    t.className = 'uz-pl-tab';
    t.getBoundingClientRect = () => rect(100 + levo());
    Object.defineProperty(t, 'offsetLeft', { get: levo });
    Object.defineProperty(t, 'offsetTop', { get: () => gore });
    Object.defineProperty(t, 'offsetHeight', { get: () => 20 });
    p.append('x', t);
    return t;
  });
  return { p, tabovi: el };
}

describe('sirinaTaba', () => {
  it.each([
    ['pozicija 0 bez stopova -> 36', 0, sa({}), 36],
    ['36 -> 36 (sledeći je 72)', 36, sa({}), 36],
    ['10 -> 26', 10, sa({}), 26],
    ['viseće uvlačenje, pozicija 5 -> 13 (viseća stanica 18)', 5, sa(visece), 13],
    ['viseće uvlačenje, pozicija 20 -> 16 (posle viseće: podrazumevani 36)', 20, sa(visece), 16],
    ['sopstveni [72, 144], pozicija 80 -> 64', 80, sa({ tabulatori: levi(72, 144) }), 64],
    ['pozicija 150 posle poslednjeg sopstvenog -> 30 (podrazumevani 180)', 150, sa({ tabulatori: levi(72, 144) }), 30],
    ['viseće (18) i sopstveni [12], pozicija 5 -> 7 (bliži kandidat)', 5, sa({ ...visece, tabulatori: levi(12) }), 7],
    ['sopstveni stop zaklanja podrazumevane levo od sebe: [100], pozicija 10 -> 90', 10, sa({ tabulatori: levi(100) }), 90],
  ])('%s', (_opis, pozicija, p, ocekivano) => {
    expect(sirinaTaba(pozicija, p)).toBeCloseTo(ocekivano, 6);
  });

  it('podrazumevani interval je 36', () => {
    expect(PODRAZUMEVANI_TAB).toBe(36);
  });

  it('širina je uvek pozitivna (i za poziciju levo od margine)', () => {
    expect(sirinaTaba(-18, sa({}))).toBeCloseTo(18, 6);
    expect(sirinaTaba(35.995, sa({}))).toBeGreaterThan(0);
  });
});

describe('trebaMerenjeTabova', () => {
  it('sirinaTaba: stop koji je blizu (manje od 0,5ch) se ne preskače', () => {
    expect(sirinaTaba(35.45, pasus('a\tb'))).toBeCloseTo(0.55, 5);
  });

  it.each([
    // CSS `tab-size` preskače stop bliži od 0,5ch, a PowerPoint ne ("0.5" pa tab: stop 36 je 0,55 dalje): meri se svaki tab
    ['tab bez uvlačenja i stopova -> true', sa({}), true],
    ['tab sa levo 18 -> true', sa({ uvlacenje: { levo: 18, prviRed: 0 } }), true],
    ['tab sa prviRed -> true', sa({ uvlacenje: { levo: 0, prviRed: 10 } }), true],
    ['tab sa sopstvenim stopom -> true', sa({ tabulatori: levi(50) }), true],
    ['bez \\t -> false', sa({ uvlacenje: { levo: 18, prviRed: -18 }, tabulatori: levi(50) }, 'ab'), false],
  ])('%s', (_opis, p, ocekivano) => {
    expect(trebaMerenjeTabova(p)).toBe(ocekivano);
  });

  it('tab u drugom delu pasusa se vidi', () => {
    const p = sa({ uvlacenje: { levo: 18, prviRed: 0 } }, 'a');
    p.delovi = [...p.delovi, { ...p.delovi[0], tekst: '\tb' }];
    expect(trebaMerenjeTabova(p)).toBe(true);
  });
});

describe('poravnajTabove', () => {
  it('jedan sopstveni LEVO stop na 36, pasus left 100 px, tab left 118 px (2 px po jedinici = pozicija 9) -> širina 27', () => {
    const { p, tabovi } = dom([{ levo: () => 18 }]);
    poravnajTabove(p, sa({ tabulatori: levi(36) }), 2);
    expect(tabovi[0].style.width).toBe('calc(var(--u) * 27)');
  });

  it('platno sa podpikselnom širinom: px po jedinici iz prikazane širine platna, ne iz zaokruženog parametra', () => {
    const platno = document.createElement('div');
    platno.className = 'uz-pl-platno';
    platno.getBoundingClientRect = () => rect(0, 1924.8);
    const { p, tabovi } = dom([{ levo: () => 18.045 }]);
    platno.append(p);
    poravnajTabove(p, sa({ tabulatori: levi(36) }), 2);
    expect(tabovi[0].style.width).toBe('calc(var(--u) * 27)');
  });

  it('izdvojen pasus skaliran iznad (npr. dijalog koji se otvara): položaj se deli odnosom prikazane i rasporedne širine', () => {
    const { p, tabovi } = dom([{ levo: () => 9 }]);
    p.getBoundingClientRect = () => rect(100, 200);
    Object.defineProperty(p, 'offsetWidth', { get: () => 400 });
    poravnajTabove(p, sa({ tabulatori: levi(36) }), 2);
    expect(tabovi[0].style.width).toBe('calc(var(--u) * 27)');
  });

  it('pasus u rotiranom sloju (transformacija do platna): položaj iz rasporeda (offsetLeft), ne iz getBoundingClientRect', () => {
    const platno = document.createElement('div');
    platno.className = 'uz-pl-platno';
    const sloj = document.createElement('div');
    sloj.style.transform = 'rotate(12deg)';
    const { p, tabovi } = dom([{ levo: () => 18 }]);
    p.getBoundingClientRect = () => rect(150);
    platno.append(sloj);
    sloj.append(p);
    poravnajTabove(p, sa({ tabulatori: levi(36) }), 2);
    expect(tabovi[0].style.width).toBe('calc(var(--u) * 27)');
  });

  it('drugi tab u istom redu: pomak od širine prvog se računa bez novog merenja', () => {
    // Prvi tab na 9 jed.; drugi 10 jed. (tekst) iza prvog. Lažni DOM pomera drugi tab za upisanu širinu prvog.
    const sirinaPx = (t: HTMLElement) => (parseFloat(t.style.width.replace(/^calc\(var\(--u\) \* /, '')) || 0) * 2;
    const t: HTMLElement[] = [];
    const { p, tabovi } = dom([{ levo: () => 18 }, { levo: () => 18 + sirinaPx(t[0]) + 20 }]);
    t.push(...tabovi);
    poravnajTabove(p, sa({ tabulatori: levi(36, 100) }), 2);
    expect(tabovi[0].style.width).toBe('calc(var(--u) * 27)');
    // drugi počinje na 36 + 10 = 46 -> do 100
    expect(tabovi[1].style.width).toBe('calc(var(--u) * 54)');
  });

  it('tab u drugom redu ne nasleđuje pomak iz prvog reda', () => {
    const { p, tabovi } = dom([{ levo: () => 18 }, { levo: () => 4, gore: 40 }]);
    poravnajTabove(p, sa({ tabulatori: levi(36) }), 2);
    expect(tabovi[0].style.width).toBe('calc(var(--u) * 27)');
    expect(tabovi[1].style.width).toBe('calc(var(--u) * 34)');
  });

  it.each([
    // Lažni raspored poravnatog reda (linija 300 px, posle taba još 40 px teksta): tab se pomera sa svakom širinom.
    ['DESNO', 'right', (w: number) => 300 - 40 - 2 * w - 10],
    ['CENTAR', 'center', (w: number) => (300 - (10 + 2 * w + 40)) / 2 + 10],
  ] as const)('%s: širine se računaju na levo poravnatom redu (stabilne), poravnanje se vraća', (poravnanje, css, poravnat) => {
    const sirina = (t: HTMLElement) => parseFloat(t.style.width.replace(/^calc\(var\(--u\) \* /, '')) || 0;
    const t: HTMLElement[] = [];
    const poravnanja: string[] = [];
    const { p, tabovi } = dom([{ levo: () => {
      poravnanja.push(p.style.textAlign);
      return p.style.textAlign === 'left' ? 18 : poravnat(sirina(t[0]));
    } }]);
    t.push(...tabovi);
    p.style.textAlign = css;
    const pasus = sa({ poravnanje, tabulatori: levi(36) });
    poravnajTabove(p, pasus, 2);
    expect(tabovi[0].style.width).toBe('calc(var(--u) * 27)');
    expect(p.style.textAlign).toBe(css);
    expect(new Set(poravnanja)).toEqual(new Set(['left']));
    poravnajTabove(p, pasus, 2);
    expect(tabovi[0].style.width).toBe('calc(var(--u) * 27)');
  });

  it('rezervno merenje se prijavljuje (transformacija), precizno ne', () => {
    const a = dom([{ levo: () => 18 }]);
    expect(poravnajSveTabove([{ el: a.p, pasus: sa({ tabulatori: levi(36) }) }], 2)).toEqual({ rezervno: false });
    const platno = document.createElement('div');
    platno.className = 'uz-pl-platno';
    const sloj = document.createElement('div');
    sloj.style.transform = 'scale(0.3)';
    platno.append(sloj);
    const b = dom([{ levo: () => 18 }]);
    sloj.append(b.p);
    expect(poravnajSveTabove([{ el: b.p, pasus: sa({ tabulatori: levi(36) }) }], 2)).toEqual({ rezervno: true });
  });

  it('najviše 3 prolaza čak i kad se raspored ne smiruje', () => {
    let citanja = 0;
    const { p } = dom([{ levo: () => (citanja++ % 2 === 0 ? 18 : 60) }]);
    poravnajTabove(p, sa({ tabulatori: levi(36) }), 2);
    expect(citanja).toBe(3);
  });

  it('bez širine platna (sakriven prikaz) ništa ne menja', () => {
    const { p, tabovi } = dom([{ levo: () => 18 }]);
    poravnajTabove(p, sa({ tabulatori: levi(36) }), 0);
    expect(tabovi[0].style.width).toBe('');
  });

  it('poravnajSveTabove: jedno čitanje rasporeda po prolazu za sve pasuse', () => {
    const citanja: string[] = [];
    const a = dom([{ levo: () => (citanja.push('a'), 18) }]);
    const b = dom([{ levo: () => (citanja.push('b'), 18) }]);
    poravnajSveTabove([{ el: a.p, pasus: sa({ tabulatori: levi(36) }) }, { el: b.p, pasus: sa({ tabulatori: levi(72) }) }], 2);
    expect(a.tabovi[0].style.width).toBe('calc(var(--u) * 27)');
    expect(b.tabovi[0].style.width).toBe('calc(var(--u) * 63)');
    // prolaz 1 (meri oba, upiše), prolaz 2 (meri oba, bez promene -> kraj)
    expect(citanja).toEqual(['a', 'b', 'a', 'b']);
  });
});

describe('pasusiZaMerenje', () => {
  const tekst = (id: string, pasusi: Pasus[]): TekstSloj => ({
    id, naziv: null, x: 0, y: 0, sirina: 100, visina: 100, rotacija: 0, providnost: 1, zakljucan: false, senka: null,
    tip: 'TEKST', pasusi, popuna: null, ivica: null,
    okvir: { unutraLevo: 7.2, unutraGore: 3.6, unutraDesno: 7.2, unutraDole: 3.6, sidro: 'VRH', prelom: true, skala: 1, skalaProreda: 1 },
  });

  it('ključevi: indeks sloja i pasusa za TEKST, indeks sloja, reda, kolone i pasusa za ćeliju; potpis prati sadržaj', () => {
    const meri = sa({ tabulatori: levi(50) });
    const tabela: TabelaSloj = {
      ...tekst('t', []), tip: 'TABELA', kolone: [50, 50], redovi: [20],
      celije: [[
        { pasusi: [pasus('x')], popuna: null, ivice: { gore: null, dole: null, levo: null, desno: null }, spojDesno: 0, spojDole: 0, pokrivena: false, sidro: 'VRH' },
        { pasusi: [pasus('y'), meri], popuna: null, ivice: { gore: null, dole: null, levo: null, desno: null }, spojDesno: 0, spojDole: 0, pokrivena: false, sidro: 'VRH' },
      ]],
    } as unknown as TabelaSloj;
    const slojevi: Sloj[] = [tekst('a', [pasus('bez'), meri]), tekst('b', [pasus('a\tb')]), tabela];
    const m = pasusiZaMerenje(slojevi);
    expect([...m.pasusi.keys()]).toEqual(['0-1', '1-0', '2-0-1-1']);
    expect(m.pasusi.get('0-1')).toBe(meri);
    expect(pasusiZaMerenje(structuredClone(slojevi)).potpis).toBe(m.potpis);
    // Pomeren, rotiran, providniji sloj i druga z-osa: isti raspored teksta, isti potpis.
    const pomeren = structuredClone(slojevi).reverse();
    Object.assign(pomeren[2], { x: 300, y: 40, rotacija: 15, providnost: 0.5, naziv: 'novi', zakljucan: true });
    Object.assign(pomeren[0], { senka: { boja: '#000000', pomerajX: 1, pomerajY: 1, zamucenje: 2 } });
    expect(pasusiZaMerenje(pomeren).potpis).toBe(m.potpis);
    const izmenjen = structuredClone(slojevi);
    (izmenjen[0] as TekstSloj).sirina = 120;
    expect(pasusiZaMerenje(izmenjen).potpis).not.toBe(m.potpis);
    expect(pasusiZaMerenje([tekst('b', [pasus('ab')])])).toEqual({ pasusi: new Map(), potpis: '' });
  });
});
