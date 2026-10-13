import { TestBed } from '@angular/core/testing';
import type { Platno } from '../data-access/platno.models';
import { platnoSaAnimacijama } from '../data-access/platno-podaci.testing';
import { Istorija, MAX_ISTORIJE, PROZOR_SPAJANJA_MS, SAT_ISTORIJE } from './istorija';

/** Različiti snimci dokumenta (istorija poredi samo objekte, ne sadržaj). */
const snimak = (): Platno => platnoSaAnimacijama([]);

describe('Istorija', () => {
  let t: number;
  let ist: Istorija;
  beforeEach(() => {
    t = 0;
    ist = new Istorija(() => t);
  });

  it('konstante iz plana: 100 koraka, prozor spajanja 1 s', () => {
    expect(MAX_ISTORIJE).toBe(100);
    expect(PROZOR_SPAJANJA_MS).toBe(1000);
  });

  it('zabelezi, ponisti, ponovi', () => {
    const a = snimak();
    const b = snimak();
    ist.zabelezi(a);
    expect(ist.mozeNazad).toBe(true);
    expect(ist.mozeNapred).toBe(false);
    expect(ist.ponisti(b)).toBe(a);
    expect(ist.mozeNazad).toBe(false);
    expect(ist.mozeNapred).toBe(true);
    expect(ist.ponovi(a)).toBe(b);
    expect(ist.mozeNazad).toBe(true);
    expect(ist.mozeNapred).toBe(false);
  });

  it('prazna: ponisti i ponovi vraćaju null', () => {
    expect(ist.mozeNazad).toBe(false);
    expect(ist.mozeNapred).toBe(false);
    expect(ist.ponisti(snimak())).toBeNull();
    expect(ist.ponovi(snimak())).toBeNull();
    expect(ist.mozeNapred).toBe(false);
  });

  it('101 korak: najstariji ispada, 100 poništavanja vraća snimke 101..2, 101. je null', () => {
    const snimci = Array.from({ length: 101 }, () => snimak());
    snimci.forEach((s) => ist.zabelezi(s));
    for (let i = 100; i >= 1; i--) expect(ist.ponisti(snimak())).toBe(snimci[i]);
    expect(ist.mozeNazad).toBe(false);
    expect(ist.ponisti(snimak())).toBeNull();
  });

  it('isti ključ u t = 0, 500, 1400 je jedan korak (prozor se meri od poslednje izmene)', () => {
    const a = snimak();
    ist.zabelezi(a, 'strelice');
    t = 500;
    ist.zabelezi(snimak(), 'strelice');
    t = 1400;
    ist.zabelezi(snimak(), 'strelice');
    expect(ist.ponisti(snimak())).toBe(a);
    expect(ist.mozeNazad).toBe(false);
  });

  it('isti ključ u t = 0 i 1001 su dva koraka', () => {
    const a = snimak();
    const b = snimak();
    ist.zabelezi(a, 'strelice');
    t = 1001;
    ist.zabelezi(b, 'strelice');
    expect(ist.ponisti(snimak())).toBe(b);
    expect(ist.ponisti(snimak())).toBe(a);
  });

  it('tačno 1000 ms se još spaja', () => {
    ist.zabelezi(snimak(), 'k');
    t = 1000;
    ist.zabelezi(snimak(), 'k');
    ist.ponisti(snimak());
    expect(ist.mozeNazad).toBe(false);
  });

  it('ključevi a pa b u t = 0 i 100 su dva koraka', () => {
    ist.zabelezi(snimak(), 'a');
    t = 100;
    ist.zabelezi(snimak(), 'b');
    ist.ponisti(snimak());
    expect(ist.mozeNazad).toBe(true);
  });

  it('bez ključa dva puta su dva koraka', () => {
    ist.zabelezi(snimak());
    ist.zabelezi(snimak());
    ist.ponisti(snimak());
    expect(ist.mozeNazad).toBe(true);
  });

  it('izmena bez ključa prekida spajanje ključa', () => {
    ist.zabelezi(snimak(), 'k');
    ist.zabelezi(snimak());
    ist.zabelezi(snimak(), 'k');
    ist.ponisti(snimak());
    ist.ponisti(snimak());
    expect(ist.mozeNazad).toBe(true);
  });

  it('ponisti između dve izmene istog ključa prekida spajanje', () => {
    const a = snimak();
    const b = snimak();
    ist.zabelezi(a, 'k');
    t = 100;
    ist.zabelezi(b, 'k'); // spaja se sa prvim
    t = 200;
    const posle = ist.ponisti(snimak());
    expect(posle).toBe(a);
    t = 300;
    const c = snimak();
    ist.zabelezi(c, 'k'); // nov korak, ne spaja se
    expect(ist.ponisti(snimak())).toBe(c);
    expect(ist.mozeNazad).toBe(false);
  });

  it('ponovi takođe prekida spajanje', () => {
    const a = snimak();
    ist.zabelezi(a, 'k');
    const sada = snimak();
    ist.ponisti(sada);
    ist.ponovi(a);
    t = 100;
    ist.zabelezi(sada, 'k');
    expect(ist.ponisti(snimak())).toBe(sada);
    expect(ist.ponisti(snimak())).toBe(a);
  });

  it('nova izmena posle ponisti briše ponovi', () => {
    ist.zabelezi(snimak());
    ist.ponisti(snimak());
    expect(ist.mozeNapred).toBe(true);
    ist.zabelezi(snimak());
    expect(ist.mozeNapred).toBe(false);
    expect(ist.ponovi(snimak())).toBeNull();
  });

  it('spojena izmena posle ponisti takođe briše ponovi', () => {
    ist.zabelezi(snimak(), 'k');
    ist.zabelezi(snimak());
    ist.ponisti(snimak());
    // poništavanje je prekinulo spajanje; nova izmena istog ključa je nov korak i briše "ponovi"
    ist.zabelezi(snimak(), 'k');
    expect(ist.mozeNapred).toBe(false);
  });

  it('resetuj briše obe strane i prekida spajanje', () => {
    ist.zabelezi(snimak(), 'k');
    ist.zabelezi(snimak(), 'x');
    ist.ponisti(snimak());
    expect(ist.mozeNazad).toBe(true);
    expect(ist.mozeNapred).toBe(true);
    ist.resetuj();
    expect(ist.mozeNazad).toBe(false);
    expect(ist.mozeNapred).toBe(false);
    const a = snimak();
    ist.zabelezi(a, 'k'); // ne spaja se sa izmenom pre resetuj
    expect(ist.mozeNazad).toBe(true);
    expect(ist.ponisti(snimak())).toBe(a);
  });

  it('bez sata u konstruktoru radi sa performance.now()', () => {
    const i = new Istorija();
    const a = snimak();
    i.zabelezi(a, 'k');
    i.zabelezi(snimak(), 'k');
    expect(i.ponisti(snimak())).toBe(a);
    expect(i.mozeNazad).toBe(false);
  });
});

describe('SAT_ISTORIJE', () => {
  it('podrazumevano je performance.now()', () => {
    const sat = TestBed.inject(SAT_ISTORIJE);
    const pre = performance.now();
    const v = sat();
    expect(v).toBeGreaterThanOrEqual(pre);
    expect(v).toBeLessThanOrEqual(performance.now());
  });

  it('testovi ga zamenjuju lažnim satom', () => {
    let t = 42;
    TestBed.configureTestingModule({ providers: [{ provide: SAT_ISTORIJE, useValue: () => t }] });
    const sat = TestBed.inject(SAT_ISTORIJE);
    expect(sat()).toBe(42);
    t = 1042;
    expect(sat()).toBe(1042);
  });
});
