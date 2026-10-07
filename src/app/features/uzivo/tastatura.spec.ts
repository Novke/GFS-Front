import { GotoBafer, TasterAkcija, tasterUAkciju, uPoljuZaUnos } from './tastatura';

const taster = (key: string, mod: { ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean } = {}) =>
  ({ key, ctrlKey: false, metaKey: false, altKey: false, ...mod });

describe('tasterUAkciju (mapa iz spec-a 6.4)', () => {
  const tabela: [string[], TasterAkcija][] = [
    [['ArrowRight', 'PageDown', 'Enter'], { komanda: 'SLEDECI' }],
    [['ArrowLeft', 'PageUp'], { komanda: 'PRETHODNI' }],
    [['Home'], { komanda: 'IDI_NA', vrednost: -1 }],
    [[' '], { komanda: 'REZULTATI' }],
    [['c', 'C'], { komanda: 'TACAN' }],
    [['l', 'L'], { komanda: 'RANG_LISTA' }],
    [['o', 'O'], { komanda: 'OTVORI_ZATVORI' }],
    [['r', 'R'], { komanda: 'PONOVI' }],
    [['t', 'T'], { komanda: 'TAJMER' }],
    [['+', '='], { komanda: 'TAJMER_PLUS' }],
    [['-'], { komanda: 'TAJMER_MINUS' }],
    [['m', 'M'], { komanda: 'TELEFON_PRIKAZ' }],
    [['d', 'D'], { komanda: 'DETALJI' }],
    [['q', 'Q'], { komanda: 'QR' }],
    [['b', 'B', '.'], { komanda: 'EKRAN_CRN' }],
    [['w', 'W'], { komanda: 'EKRAN_BEO' }],
    [['f', 'F'], { lokalno: 'CEO_EKRAN' }],
    [['p', 'P'], { lokalno: 'KONZOLA' }],
    [['?'], { lokalno: 'POMOC' }],
  ];

  for (const [tasteri, akcija] of tabela) {
    for (const key of tasteri) {
      it(`'${key}' -> ${JSON.stringify(akcija)}`, () => {
        expect(tasterUAkciju(taster(key), 10)).toEqual(akcija);
      });
    }
  }

  it('End sa 5 slajdova -> IDI_NA 4', () => {
    expect(tasterUAkciju(taster('End'), 5)).toEqual({ komanda: 'IDI_NA', vrednost: 4 });
  });

  it('End bez slajdova -> IDI_NA -1', () => {
    expect(tasterUAkciju(taster('End'), 0)).toEqual({ komanda: 'IDI_NA', vrednost: -1 });
  });

  it('Ctrl, Meta i Alt kombinacije se ne hvataju', () => {
    expect(tasterUAkciju(taster('c', { ctrlKey: true }), 5)).toBeNull();
    expect(tasterUAkciju(taster('ArrowRight', { metaKey: true }), 5)).toBeNull();
    expect(tasterUAkciju(taster('ArrowLeft', { altKey: true }), 5)).toBeNull();
  });

  it('nepoznat taster -> null', () => {
    expect(tasterUAkciju(taster('x'), 5)).toBeNull();
    expect(tasterUAkciju(taster('Escape'), 5)).toBeNull();
    expect(tasterUAkciju(taster('g'), 5)).toBeNull();
  });
});

describe('uPoljuZaUnos', () => {
  it('input, textarea i select jesu polja za unos', () => {
    expect(uPoljuZaUnos(document.createElement('input'))).toBe(true);
    expect(uPoljuZaUnos(document.createElement('textarea'))).toBe(true);
    expect(uPoljuZaUnos(document.createElement('select'))).toBe(true);
  });

  it('contenteditable je polje za unos', () => {
    // jsdom/Chrome: isContentEditable se izvodi iz atributa; ovde ga postavljamo direktno kao u pregledaču.
    const el = document.createElement('div');
    el.contentEditable = 'true';
    document.body.appendChild(el);
    try {
      expect(uPoljuZaUnos(el)).toBe(true);
    } finally {
      el.remove();
    }
  });

  it('običan element i null nisu polja za unos', () => {
    expect(uPoljuZaUnos(document.createElement('div'))).toBe(false);
    expect(uPoljuZaUnos(document.createElement('button'))).toBe(false);
    expect(uPoljuZaUnos(null)).toBe(false);
    expect(uPoljuZaUnos(window)).toBe(false);
  });
});

describe('GotoBafer', () => {
  it("g, 1, 2, Enter -> IDI_NA 11", () => {
    const b = new GotoBafer(() => 0);
    expect(b.obradi('g')).toBe('progutao');
    expect(b.unos).toBe('');
    expect(b.obradi('1')).toBe('progutao');
    expect(b.obradi('2')).toBe('progutao');
    expect(b.unos).toBe('12');
    expect(b.obradi('Enter')).toEqual({ komanda: 'IDI_NA', vrednost: 11 });
    expect(b.unos).toBeNull();
  });

  it('taster van G režima nije progutan', () => {
    const b = new GotoBafer(() => 0);
    expect(b.obradi('5')).toBeNull();
    expect(b.obradi('Enter')).toBeNull();
    expect(b.unos).toBeNull();
  });

  it('g pa posle 3,1 s cifra 5 -> null (istek poništava)', () => {
    let t = 0;
    const b = new GotoBafer(() => t);
    expect(b.obradi('g')).toBe('progutao');
    t = 3_100;
    expect(b.obradi('5')).toBeNull();
    expect(b.unos).toBeNull();
  });

  it('g pa cifra posle tačno 3 s još važi', () => {
    let t = 0;
    const b = new GotoBafer(() => t);
    b.obradi('g');
    t = 3_000;
    expect(b.obradi('5')).toBe('progutao');
    expect(b.unos).toBe('5');
  });

  it('g, Escape -> progutao i kraj režima', () => {
    const b = new GotoBafer(() => 0);
    b.obradi('g');
    expect(b.obradi('Escape')).toBe('progutao');
    expect(b.unos).toBeNull();
    expect(b.obradi('5')).toBeNull();
  });

  it('g, Enter bez cifara poništava režim i taster nije progutan', () => {
    const b = new GotoBafer(() => 0);
    b.obradi('g');
    expect(b.obradi('Enter')).toBeNull();
    expect(b.unos).toBeNull();
  });

  it('najviše 3 cifre', () => {
    const b = new GotoBafer(() => 0);
    b.obradi('g');
    b.obradi('1'); b.obradi('2'); b.obradi('3');
    expect(b.obradi('4')).toBeNull();
    expect(b.unos).toBeNull();
  });

  it('G (veliko) takođe otvara režim', () => {
    const b = new GotoBafer(() => 0);
    expect(b.obradi('G')).toBe('progutao');
    b.obradi('7');
    expect(b.obradi('Enter')).toEqual({ komanda: 'IDI_NA', vrednost: 6 });
  });
});
