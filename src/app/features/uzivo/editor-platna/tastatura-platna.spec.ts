import { type KomandaTastature, jeSnimanje, komandaTastature, uPoljuZaUnos } from './tastatura-platna';

interface T { key: string; code?: string; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; altKey?: boolean }
const taster = (t: T) => ({ code: '', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...t });

describe('tastatura-platna: komandaTastature', () => {
  const slucajevi: [string, T, KomandaTastature | null][] = [
    ['Delete', { key: 'Delete' }, { tip: 'OBRISI' }],
    ['Backspace', { key: 'Backspace' }, { tip: 'OBRISI' }],
    ['Ctrl+c', { key: 'c', ctrlKey: true }, { tip: 'KOPIRAJ' }],
    ['Ctrl+v', { key: 'v', ctrlKey: true }, { tip: 'NALEPI' }],
    ['Ctrl+d', { key: 'd', ctrlKey: true }, { tip: 'DUPLIRAJ' }],
    ['Ctrl+a', { key: 'a', ctrlKey: true }, { tip: 'IZABERI_SVE' }],
    ['Ctrl+z', { key: 'z', ctrlKey: true }, { tip: 'PONISTI' }],
    ['Ctrl+Shift+Z', { key: 'Z', ctrlKey: true, shiftKey: true }, { tip: 'PONOVI' }],
    ['Ctrl+y', { key: 'y', ctrlKey: true }, { tip: 'PONOVI' }],
    ['Meta+z', { key: 'z', metaKey: true }, { tip: 'PONISTI' }],
    ['Ctrl+BracketRight (key đ)', { key: 'đ', code: 'BracketRight', ctrlKey: true }, { tip: 'Z', smer: 'NAPRED' }],
    ['Ctrl+Shift+BracketRight', { key: 'Đ', code: 'BracketRight', ctrlKey: true, shiftKey: true }, { tip: 'Z', smer: 'NA_VRH' }],
    ['Ctrl+BracketLeft (key š)', { key: 'š', code: 'BracketLeft', ctrlKey: true }, { tip: 'Z', smer: 'NAZAD' }],
    ['Ctrl+Shift+BracketLeft', { key: 'Š', code: 'BracketLeft', ctrlKey: true, shiftKey: true }, { tip: 'Z', smer: 'NA_DNO' }],
    ['Escape', { key: 'Escape' }, { tip: 'PONISTI_IZBOR' }],
    ['Enter', { key: 'Enter' }, { tip: 'UREDI' }],
    ['F2', { key: 'F2' }, { tip: 'UREDI' }],
    ['ArrowLeft', { key: 'ArrowLeft' }, { tip: 'POMERI', dx: -1, dy: 0 }],
    ['ArrowRight', { key: 'ArrowRight' }, { tip: 'POMERI', dx: 1, dy: 0 }],
    ['ArrowDown', { key: 'ArrowDown' }, { tip: 'POMERI', dx: 0, dy: 1 }],
    ['Shift+ArrowUp', { key: 'ArrowUp', shiftKey: true }, { tip: 'POMERI', dx: 0, dy: -10 }],
    ['z bez Ctrl', { key: 'z' }, null],
    ['Ctrl+Alt+z (AltGr)', { key: 'z', ctrlKey: true, altKey: true }, null],
    ['Alt+ArrowLeft', { key: 'ArrowLeft', altKey: true }, null],
    ['Ctrl+ArrowLeft', { key: 'ArrowLeft', ctrlKey: true }, null],
    ['Ctrl+q (nije prečica)', { key: 'q', ctrlKey: true }, null],
  ];
  it.each(slucajevi)('%s', (_naziv, t, ocekivano) => {
    expect(komandaTastature(taster(t))).toEqual(ocekivano);
  });
});

describe('tastatura-platna: jeSnimanje', () => {
  it.each<[string, T, boolean]>([
    ['Ctrl+s', { key: 's', ctrlKey: true }, true],
    ['Meta+S', { key: 'S', metaKey: true }, true],
    ['s', { key: 's' }, false],
    ['Ctrl+Alt+s', { key: 's', ctrlKey: true, altKey: true }, false],
  ])('%s', (_naziv, t, ocekivano) => {
    expect(jeSnimanje(taster(t))).toBe(ocekivano);
  });
});

describe('tastatura-platna: uPoljuZaUnos', () => {
  let koren: HTMLElement;
  beforeEach(() => {
    koren = document.createElement('div');
    document.body.appendChild(koren);
  });
  afterEach(() => koren.remove());

  function element(html: string, selektor: string): Element {
    koren.innerHTML = html;
    return koren.querySelector(selektor)!;
  }

  it.each<[string, string, string]>([
    ['input', '<input id="c">', '#c'],
    ['textarea', '<textarea id="c"></textarea>', '#c'],
    ['select', '<select id="c"></select>', '#c'],
    ['contenteditable', '<div id="c" contenteditable="true">x</div>', '#c'],
    ['unutar .cdk-overlay-container', '<div class="cdk-overlay-container"><button id="c">x</button></div>', '#c'],
    ['role=tab', '<div id="c" role="tab">x</div>', '#c'],
    ['unutar role=tablist', '<div role="tablist"><span id="c">x</span></div>', '#c'],
    ['role=combobox', '<div id="c" role="combobox">x</div>', '#c'],
    ['role=listbox', '<div id="c" role="listbox">x</div>', '#c'],
    ['role=radio', '<div id="c" role="radio">x</div>', '#c'],
    ['role=slider', '<div id="c" role="slider">x</div>', '#c'],
  ])('%s -> true', (_naziv, html, selektor) => {
    expect(uPoljuZaUnos(element(html, selektor))).toBe(true);
  });

  it('div okvira platna -> false', () => {
    expect(uPoljuZaUnos(element('<div class="uz-ep-platno" tabindex="0" role="group" id="c"></div>', '#c'))).toBe(false);
  });

  it('null -> false', () => {
    expect(uPoljuZaUnos(null)).toBe(false);
  });
});
