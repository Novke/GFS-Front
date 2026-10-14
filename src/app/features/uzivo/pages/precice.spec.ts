import { TastaturaIzvodjenja, preskociPrecicu } from './precice';
import { pomeriSat, saLaznimSatom } from '../lazni-sat.testing';

function taster(key: string, target: EventTarget | null = document.body, izmene: KeyboardEventInit = {}): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { key, cancelable: true, ...izmene });
  Object.defineProperty(e, 'target', { value: target });
  return e;
}

function element(html: string): HTMLElement {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.firstElementChild as HTMLElement;
}

describe('preskociPrecicu', () => {
  it('obična stranica: ne preskače', () => {
    expect(preskociPrecicu(taster('ArrowRight'), false)).toBe(false);
  });

  it('otvoren dijalog, polje za unos, ponavljanje: preskače', () => {
    expect(preskociPrecicu(taster('ArrowRight'), true)).toBe(true);
    expect(preskociPrecicu(taster('o', element('<input>')), false)).toBe(true);
    expect(preskociPrecicu(taster('ArrowRight', document.body, { repeat: true }), false)).toBe(true);
  });

  it('Material kontrole sa svojom tastaturom (select, tab, meni): preskače', () => {
    expect(preskociPrecicu(taster('ArrowDown', element('<div role="combobox"></div>')), false)).toBe(true);
    expect(preskociPrecicu(taster('ArrowRight', element('<div role="tab"></div>')), false)).toBe(true);
    const unutra = element('<div role="menu"><button>x</button></div>').firstElementChild!;
    expect(preskociPrecicu(taster('ArrowDown', unutra), false)).toBe(true);
  });

  it('Enter na fokusiranom dugmetu radi dugme; Space i strelice idu na prečicu', () => {
    const dugme = element('<button>Dalje</button>');
    expect(preskociPrecicu(taster('Enter', dugme), false)).toBe(true);
    expect(preskociPrecicu(taster(' ', dugme), false)).toBe(false);
    expect(preskociPrecicu(taster('ArrowRight', dugme), false)).toBe(false);
  });

  it('Space na prekidaču (switch, checkbox) ostaje prekidaču', () => {
    expect(preskociPrecicu(taster(' ', element('<button role="switch"></button>')), false)).toBe(true);
  });
});

describe('TastaturaIzvodjenja', () => {
  it('G 1 2 Enter -> IDI_NA 11, indikator prati unos', () => {
    const t = new TastaturaIzvodjenja();
    expect(t.akcija(taster('g'), 20, false)).toBeNull();
    expect(t.gotoUnos()).toBe('');
    t.akcija(taster('1'), 20, false);
    t.akcija(taster('2'), 20, false);
    expect(t.gotoUnos()).toBe('12');
    const e = taster('Enter');
    expect(t.akcija(e, 20, false)).toEqual({ komanda: 'IDI_NA', vrednost: 11 });
    expect(e.defaultPrevented).toBe(true);
    expect(t.gotoUnos()).toBeNull();
    t.unisti();
  });

  it('indikator "Idi na" se sam sakrije posle 3 s', saLaznimSatom(async () => {
    const t = new TastaturaIzvodjenja();
    t.akcija(taster('g'), 20, false);
    t.akcija(taster('4'), 20, false);
    await pomeriSat(2999);
    expect(t.gotoUnos()).toBe('4');
    await pomeriSat(1);
    expect(t.gotoUnos()).toBeNull();
  }));

  it('Space na fokusiranom dugmetu: REZULTATI, a keyup ne klikne dugme', () => {
    const t = new TastaturaIzvodjenja();
    const dugme = element('<button>QR preko ekrana</button>');
    const dole = taster(' ', dugme);
    expect(t.akcija(dole, 3, false)).toEqual({ komanda: 'REZULTATI' });
    expect(dole.defaultPrevented).toBe(true);
    const gore = taster(' ', dugme);
    t.pusten(gore);
    expect(gore.defaultPrevented).toBe(true);
    const drugiGore = taster(' ', dugme);
    t.pusten(drugiGore);
    expect(drugiGore.defaultPrevented).toBe(false);
  });

  it('ćirilični raspored: г 3 Enter -> IDI_NA 2, ц -> TACAN', () => {
    const t = new TastaturaIzvodjenja();
    expect(t.akcija(taster('г', document.body, { code: 'KeyG' }), 20, false)).toBeNull();
    expect(t.gotoUnos()).toBe('');
    t.akcija(taster('3', document.body, { code: 'Digit3' }), 20, false);
    expect(t.akcija(taster('Enter', document.body, { code: 'Enter' }), 20, false)).toEqual({ komanda: 'IDI_NA', vrednost: 2 });
    const c = taster('ц', document.body, { code: 'KeyC' });
    expect(t.akcija(c, 20, false)).toEqual({ komanda: 'TACAN' });
    expect(c.defaultPrevented).toBe(true);
    t.unisti();
  });

  it('ćirilično slovo u polju za unos ostaje tekst (nije prečica)', () => {
    const t = new TastaturaIzvodjenja();
    const e = taster('ц', element('<input>'), { code: 'KeyC' });
    expect(t.akcija(e, 20, false)).toBeNull();
    expect(e.defaultPrevented).toBe(false);
  });

  it('Space je prečica i ne skroluje; Ctrl+G nije G režim', () => {
    const t = new TastaturaIzvodjenja();
    const e = taster(' ');
    expect(t.akcija(e, 3, false)).toEqual({ komanda: 'REZULTATI' });
    expect(e.defaultPrevented).toBe(true);
    expect(t.akcija(taster('g', document.body, { ctrlKey: true }), 3, false)).toBeNull();
    expect(t.gotoUnos()).toBeNull();
  });
});
