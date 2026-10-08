import { fakeAsync, tick } from '@angular/core/testing';
import { TastaturaIzvodjenja, preskociPrecicu } from './precice';

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
    expect(preskociPrecicu(taster('ArrowRight'), false)).toBeFalse();
  });

  it('otvoren dijalog, polje za unos, ponavljanje: preskače', () => {
    expect(preskociPrecicu(taster('ArrowRight'), true)).toBeTrue();
    expect(preskociPrecicu(taster('o', element('<input>')), false)).toBeTrue();
    expect(preskociPrecicu(taster('ArrowRight', document.body, { repeat: true }), false)).toBeTrue();
  });

  it('Material kontrole sa svojom tastaturom (select, tab, meni): preskače', () => {
    expect(preskociPrecicu(taster('ArrowDown', element('<div role="combobox"></div>')), false)).toBeTrue();
    expect(preskociPrecicu(taster('ArrowRight', element('<div role="tab"></div>')), false)).toBeTrue();
    const unutra = element('<div role="menu"><button>x</button></div>').firstElementChild!;
    expect(preskociPrecicu(taster('ArrowDown', unutra), false)).toBeTrue();
  });

  it('Enter i Space na fokusiranom dugmetu radi dugme, strelice idu na prečicu', () => {
    const dugme = element('<button>Dalje</button>');
    expect(preskociPrecicu(taster('Enter', dugme), false)).toBeTrue();
    expect(preskociPrecicu(taster(' ', dugme), false)).toBeTrue();
    expect(preskociPrecicu(taster('ArrowRight', dugme), false)).toBeFalse();
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
    expect(e.defaultPrevented).toBeTrue();
    expect(t.gotoUnos()).toBeNull();
    t.unisti();
  });

  it('indikator "Idi na" se sam sakrije posle 3 s', fakeAsync(() => {
    const t = new TastaturaIzvodjenja();
    t.akcija(taster('g'), 20, false);
    t.akcija(taster('4'), 20, false);
    tick(2999);
    expect(t.gotoUnos()).toBe('4');
    tick(1);
    expect(t.gotoUnos()).toBeNull();
  }));

  it('Space je prečica i ne skroluje; Ctrl+G nije G režim', () => {
    const t = new TastaturaIzvodjenja();
    const e = taster(' ');
    expect(t.akcija(e, 3, false)).toEqual({ komanda: 'REZULTATI' });
    expect(e.defaultPrevented).toBeTrue();
    expect(t.akcija(taster('g', document.body, { ctrlKey: true }), 3, false)).toBeNull();
    expect(t.gotoUnos()).toBeNull();
  });
});
