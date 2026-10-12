import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { celija, pasus, platno } from '../data-access/platno-podaci.testing';
import {
  FormulaSloj, OblikSloj, Pasus, Platno, Sloj, TabelaSloj, TekstSloj,
} from '../data-access/platno.models';
import { PlatnoPrikazComponent } from './platno-prikaz.component';

async function prikazi(p: Platno, korak = 0) {
  const fixture = TestBed.createComponent(PlatnoPrikazComponent);
  fixture.componentRef.setInput('platno', p);
  fixture.componentRef.setInput('korak', korak);
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

/** Kopija fabričkog platna sa zamenjenim slojem istog id-ja. */
function sa<T extends Sloj>(id: string, izmena: (s: T) => T): Platno {
  const p = platno();
  return { ...p, slojevi: p.slojevi.map((s) => (s.id === id ? izmena(s as T) : s)) };
}

const sloj = (el: HTMLElement, id: string) => el.querySelector<HTMLElement>(`.uz-pl-sloj[data-sloj="${id}"]`)!;

describe('PlatnoPrikazComponent', () => {
  it('renderuje šest slojeva redom (z-osa = redosled u DOM-u), svaki sa unutrašnjim sadržajem', async () => {
    const { el } = await prikazi(platno());
    const slojevi = Array.from(el.querySelectorAll<HTMLElement>('.uz-pl-sloj'));
    expect(slojevi.map((s) => s.dataset['sloj'])).toEqual(['tekst', 'slika', 'oblik', 'tabela', 'formula', 'crtez']);
    for (const s of slojevi) {
      expect(s.querySelector(':scope > .uz-pl-sadrzaj')).not.toBeNull();
    }
  });

  it('vidljivost po koraku: ULAZ sakriven na koraku 0, vidljiv na 1; IZLAZ ga sakriva na 2', async () => {
    const { fixture, el } = await prikazi(platno(), 0);
    const pasus0 = () => sloj(el, 'tekst').querySelector<HTMLElement>('[data-pasus="0"]')!;
    const pasus1 = () => sloj(el, 'tekst').querySelector<HTMLElement>('[data-pasus="1"]')!;
    expect(pasus0().style.visibility).toBe('hidden');
    expect(pasus1().style.visibility).toBe('');
    expect(sloj(el, 'tekst').style.visibility).toBe('');
    expect(sloj(el, 'slika').style.visibility).toBe('hidden');
    expect(sloj(el, 'oblik').style.visibility).toBe('hidden');
    expect(sloj(el, 'tabela').style.visibility).toBe('');

    fixture.componentRef.setInput('korak', 1);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(pasus0().style.visibility).toBe('');
    expect(sloj(el, 'slika').style.visibility).toBe('');
    expect(sloj(el, 'oblik').style.visibility).toBe('');

    fixture.componentRef.setInput('korak', 2);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(sloj(el, 'oblik').style.visibility).toBe('hidden');
  });

  it('ključ animacije za praznu grupu ne menja prikaz (animacije: platno-prikaz-animacije.spec.ts)', async () => {
    const { fixture, el } = await prikazi(platno());
    fixture.componentRef.setInput('animacija', { kljuc: 1, grupa: 0 });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(el.querySelectorAll('.uz-pl-sloj').length).toBe(6);
  });

  it('sloj: rotacija, providnost i senka', async () => {
    const p = sa<TekstSloj>('tekst', (s) => ({
      ...s, rotacija: 30, providnost: 0.5, senka: { boja: '#112233', pomerajX: 2, pomerajY: 3, zamucenje: 4 },
    }));
    const { el } = await prikazi(p);
    const s = sloj(el, 'tekst');
    expect(s.style.left).toBe('calc(var(--u) * 10)');
    expect(s.style.width).toBe('calc(var(--u) * 200)');
    expect(s.style.transform).toBe('rotate(30deg)');
    expect(s.style.opacity).toBe('0.5');
    expect(s.getAttribute('style')).toContain('drop-shadow');
    expect(s.getAttribute('style')).toContain('#112233');
  });

  it('tabela: colspan = 1 + spojDesno, pokrivena ćelija se ne crta, rowspan = 1 + spojDole', async () => {
    const p = sa<TabelaSloj>('tabela', (s) => ({
      ...s, redovi: [30, 30],
      celije: [
        [celija('Spojeno', { spojDesno: 1, spojDole: 1, popuna: '#ABCDEF' }), celija('', { pokrivena: true })],
        [celija('', { pokrivena: true }), celija('', { pokrivena: true })],
      ],
    }));
    const { el } = await prikazi(p);
    const tds = sloj(el, 'tabela').querySelectorAll<HTMLTableCellElement>('td');
    expect(tds.length).toBe(1);
    expect(tds[0].getAttribute('colspan')).toBe('2');
    expect(tds[0].getAttribute('rowspan')).toBe('2');
    expect(tds[0].textContent).toContain('Spojeno');
    expect(sloj(el, 'tabela').querySelectorAll('col').length).toBe(2);
    expect(sloj(el, 'tabela').querySelectorAll('tr').length).toBe(2);
  });

  it('tabela iz fabrike: dve ćelije bez spajanja', async () => {
    const { el } = await prikazi(platno());
    const tds = sloj(el, 'tabela').querySelectorAll('td');
    expect(tds.length).toBe(2);
    expect(tds[0].getAttribute('colspan')).toBe('1');
  });

  it('SLIKA: src kroz medijUrl, alt = naziv ili prazan', async () => {
    const { el } = await prikazi(platno());
    const img = sloj(el, 'slika').querySelector('img')!;
    expect(img.getAttribute('src')).toBe('api/public/mediji/00000000-0000-0000-0000-000000000001');
    expect(img.getAttribute('alt')).toBe('');
  });

  it('SLIKA: isečak uvećava sliku i pomera je ulevo i gore', async () => {
    const p = sa<Extract<Sloj, { tip: 'SLIKA' }>>('slika', (s) => ({ ...s, isecak: { levo: 0.25, gore: 0.1, desno: 0.25, dole: 0.4 } }));
    const { el } = await prikazi(p);
    const img = sloj(el, 'slika').querySelector<HTMLElement>('img')!;
    expect(img.style.width).toBe('200%');
    expect(img.style.height).toBe('200%');
    expect(img.style.left).toBe('-50%');
    expect(img.style.top).toBe('-20%');
  });

  it('FORMULA: sa slikaIzvora je <img>, bez nje LaTeX izvor', async () => {
    const bez = await prikazi(platno());
    expect(sloj(bez.el, 'formula').querySelector('img')).toBeNull();
    expect(sloj(bez.el, 'formula').querySelector('.uz-pl-formula-izvor')?.textContent).toBe('x^2');

    const p = sa<FormulaSloj>('formula', (s) => ({ ...s, slikaIzvora: '00000000-0000-0000-0000-000000000003' }));
    const sa_ = await prikazi(p);
    const img = sloj(sa_.el, 'formula').querySelector('img')!;
    expect(img.getAttribute('src')).toBe('api/public/mediji/00000000-0000-0000-0000-000000000003');
    expect(img.getAttribute('alt')).toBe('x^2');
    expect(sloj(sa_.el, 'formula').querySelector('.uz-pl-formula-izvor')).toBeNull();
  });

  it('CRTEZ: slika preko sloja, alt Crtež', async () => {
    const { el } = await prikazi(platno());
    const img = sloj(el, 'crtez').querySelector('img')!;
    expect(img.getAttribute('src')).toBe('api/public/mediji/00000000-0000-0000-0000-000000000002');
    expect(img.getAttribute('alt')).toBe('Crtež');
  });

  it('OBLIK: SVG u jedinicama sloja; strelica ima marker-end, dvostruka i marker-start', async () => {
    const strelica = sa<OblikSloj>('oblik', (s) => ({
      ...s, oblik: 'STRELICA', popuna: null, ivica: { boja: '#FF0000', debljina: 2, crtica: 'ISPREKIDANA' },
      od: { x: 0, y: 50 }, do: { x: 200, y: 50 },
    }));
    const { el } = await prikazi(strelica);
    const svg = sloj(el, 'oblik').querySelector('svg')!;
    expect(svg.getAttribute('viewBox')).toBe('0 0 200 100');
    expect(svg.getAttribute('preserveAspectRatio')).toBe('none');
    const linija = svg.querySelector('line')!;
    expect(linija.getAttribute('x2')).toBe('200');
    expect(linija.getAttribute('stroke-dasharray')).toBe('8 6');
    const kraj = linija.getAttribute('marker-end')!;
    expect(kraj).toMatch(/^url\(#.+\)$/);
    expect(svg.querySelector(`marker[id="${kraj.slice(5, -1)}"]`)).not.toBeNull();
    expect(linija.getAttribute('marker-start')).toBeNull();

    const dvostruka = sa<OblikSloj>('oblik', (s) => ({ ...s, oblik: 'DVOSTRUKA_STRELICA', ivica: { boja: '#FF0000', debljina: 2, crtica: 'TACKASTA' }, od: null, do: null }));
    const d = await prikazi(dvostruka);
    const l2 = sloj(d.el, 'oblik').querySelector('line')!;
    expect(l2.getAttribute('marker-start')).toMatch(/^url\(#.+\)$/);
    expect(l2.getAttribute('marker-end')).toMatch(/^url\(#.+\)$/);
    expect(l2.getAttribute('y1')).toBe('50');
    expect(l2.getAttribute('stroke-dasharray')).toBe('2 4');
    expect(l2.getAttribute('stroke-linecap')).toBe('round');
  });

  it('OBLIK: elipsa, zaobljeni pravougaonik (rx 10% kraće strane), trougao', async () => {
    const elipsa = await prikazi(platno());
    const e = sloj(elipsa.el, 'oblik').querySelector('ellipse')!;
    expect([e.getAttribute('cx'), e.getAttribute('cy'), e.getAttribute('rx'), e.getAttribute('ry')]).toEqual(['100', '50', '100', '50']);
    expect(e.getAttribute('fill')).toBe('#FFCC00');

    const zaobljen = await prikazi(sa<OblikSloj>('oblik', (s) => ({ ...s, oblik: 'ZAOBLJENI_PRAVOUGAONIK' })));
    expect(sloj(zaobljen.el, 'oblik').querySelector('rect')!.getAttribute('rx')).toBe('10');

    const trougao = await prikazi(sa<OblikSloj>('oblik', (s) => ({ ...s, oblik: 'TROUGAO' })));
    expect(sloj(trougao.el, 'oblik').querySelector('polygon')!.getAttribute('points')).toBe('100,0 200,100 0,100');
  });

  it('dve instance ne dele id-jeve markera', async () => {
    const p = sa<OblikSloj>('oblik', (s) => ({ ...s, oblik: 'STRELICA', ivica: { boja: '#000000', debljina: 1, crtica: 'PUNA' } }));
    const a = await prikazi(p);
    const b = await prikazi(p);
    const id = (el: HTMLElement) => el.querySelector('marker')!.id;
    expect(id(a.el)).not.toBe(id(b.el));
  });

  it('TEKST: nepoznat font se prikazuje kao Carlito, poznat kroz katalog', async () => {
    const p = sa<TekstSloj>('tekst', (s) => ({
      ...s, pasusi: [{ ...pasus('x'), delovi: [{ ...pasus('x').delovi[0], font: 'Comic Sans MS' }, { ...pasus('y').delovi[0], font: 'Tinos' }] }],
    }));
    const { el } = await prikazi(p);
    const delovi = sloj(el, 'tekst').querySelectorAll<HTMLElement>('.uz-pl-deo');
    expect(delovi[0].style.fontFamily).toContain('Carlito');
    expect(delovi[1].style.fontFamily).toContain('Tinos');
  });

  it('TEKST: oblik dela (podebljano, kurziv, podvučeno + precrtano, eksponent) i boja', async () => {
    const osnova = pasus('a').delovi[0];
    const p = sa<TekstSloj>('tekst', (s) => ({
      ...s, pasusi: [{ ...pasus('a'), delovi: [
        { ...osnova, tekst: 'b', podebljano: true, kurziv: true, podvuceno: true, precrtano: true, boja: '#FF0000' },
        { ...osnova, tekst: '2', polozaj: 'EKSPONENT' },
        { ...osnova, tekst: 'i', polozaj: 'INDEKS' },
      ] }],
    }));
    const { el } = await prikazi(p);
    const [b, eks, ind] = Array.from(sloj(el, 'tekst').querySelectorAll<HTMLElement>('.uz-pl-deo'));
    expect(b.style.fontWeight).toBe('700');
    expect(b.style.fontStyle).toBe('italic');
    expect(b.style.textDecorationLine || b.style.textDecoration).toContain('underline');
    expect(b.style.textDecorationLine || b.style.textDecoration).toContain('line-through');
    expect(b.style.color).toMatch(/#FF0000|rgb\(255, 0, 0\)/i);
    expect(b.style.fontSize).toBe('calc(var(--u) * 18)');
    expect(eks.style.fontSize).toBe('calc(var(--u) * 11.7)');
    expect(eks.style.verticalAlign).toBe('super');
    expect(ind.style.verticalAlign).toBe('sub');
    expect(b.style.verticalAlign).toBe('');
  });

  it('TEKST: oznaka liste kao span, poravnanje i uvlačenje pasusa', async () => {
    const lista: Pasus = {
      ...pasus('Stavka'), poravnanje: 'OBOSTRANO', uvlacenje: { levo: 27, prviRed: -27 },
      lista: { vrsta: 'BROJ', znak: null, boja: '#00FF00', format: 'ARAPSKI_TACKA', pocetak: 1 },
    };
    const p = sa<TekstSloj>('tekst', (s) => ({ ...s, pasusi: [lista, lista] }));
    const { el } = await prikazi(p);
    const pasusi = sloj(el, 'tekst').querySelectorAll<HTMLElement>('.uz-pl-pasus');
    expect(pasusi[1].querySelector('.uz-pl-oznaka')?.textContent).toBe('2.');
    expect(pasusi[0].style.textAlign).toBe('justify');
    expect(pasusi[0].querySelector<HTMLElement>('.uz-pl-oznaka')!.style.color).toMatch(/#00FF00|rgb\(0, 255, 0\)/i);
    expect(pasusi[0].querySelector('.uz-pl-oznaka + .uz-pl-deo')?.textContent).toBe('Stavka');
  });

  it('TEKST: prazan pasus dobija zero-width space; prelom na kraju pasusa ostaje prazan red', async () => {
    const prazan: Pasus = { ...pasus(''), delovi: [] };
    const p = sa<TekstSloj>('tekst', (s) => ({ ...s, pasusi: [prazan, pasus(''), pasus('red\n')] }));
    const { el } = await prikazi(p);
    const pasusi = sloj(el, 'tekst').querySelectorAll<HTMLElement>('.uz-pl-pasus');
    expect(pasusi[0].textContent).toBe('​');
    expect(pasusi[1].textContent).toBe('​');
    expect(pasusi[2].textContent).toBe('red\n​');
  });

  it('TEKST: sopstveni tabulatori ne ruše prikaz (tab ostaje u tekstu)', async () => {
    const p = sa<TekstSloj>('tekst', (s) => ({
      ...s, pasusi: [{ ...pasus('a\tb'), tabulatori: [{ poz: 100, poravnanje: 'DECIMALNO' }] }],
    }));
    const { el } = await prikazi(p);
    expect(sloj(el, 'tekst').querySelector('.uz-pl-pasus')?.textContent).toBe('a\tb');
  });

  it('TEKST: pasus sa uvlačenjem i tabom ima .uz-pl-tab (mereni tab), pasus bez uvlačenja zadržava \\t', async () => {
    const p = sa<TekstSloj>('tekst', (s) => ({
      ...s, pasusi: [pasus('a\tb'), { ...pasus('c\td\te'), uvlacenje: { levo: 18, prviRed: -18 } }],
    }));
    const { el } = await prikazi(p);
    const [bez, sa_] = Array.from(sloj(el, 'tekst').querySelectorAll<HTMLElement>('.uz-pl-pasus'));
    expect(bez.querySelector('.uz-pl-tab')).toBeNull();
    expect(bez.hasAttribute('data-meri-tabove')).toBe(false);
    expect(bez.textContent).toBe('a\tb');
    // Nemereni pasus zadržava DOM faze 1: jedan tekstualni čvor po delu.
    expect(Array.from(bez.querySelector('.uz-pl-deo')!.childNodes).map((n) => n.nodeType)).toEqual([Node.TEXT_NODE]);
    expect(sa_.querySelectorAll('.uz-pl-tab').length).toBe(2);
    expect(sa_.dataset['pasus']).toBe('1');
    expect(sa_.hasAttribute('data-meri-tabove')).toBe(true);
    // Tab ostaje u tekstu (kopiranje, čitač ekrana); `tab-size: 0` u CSS-u ga ne crta, širinu daje merenje.
    expect(sa_.textContent).toBe('c\td\te');
    expect(sa_.querySelector('.uz-pl-deo > .uz-pl-tab')?.textContent).toBe('\t');
  });

  it('TEKST: mereni tab dobija širinu do sledećeg stopa; ponovo se meri samo kad se sadržaj promeni', async () => {
    const levo = vi.spyOn(Element.prototype, 'getBoundingClientRect');
    try {
      const fixture = TestBed.createComponent(PlatnoPrikazComponent);
      const host = fixture.nativeElement as HTMLElement;
      Object.defineProperty(host, 'offsetWidth', { get: () => 1920 });
      const p = sa<TekstSloj>('tekst', (s) => ({ ...s, pasusi: [{ ...pasus('a\tb'), uvlacenje: { levo: 18, prviRed: -18 } }] }));
      fixture.componentRef.setInput('platno', p);
      fixture.detectChanges();
      await fixture.whenStable();
      // jsdom nema raspored: tab na poziciji 0, viseća stanica na 18.
      const tab = () => sloj(host, 'tekst').querySelector<HTMLElement>('.uz-pl-tab')!;
      expect(tab().style.width).toBe('calc(var(--u) * 18)');

      levo.mockClear();
      fixture.componentRef.setInput('platno', structuredClone(p));
      fixture.detectChanges();
      await fixture.whenStable();
      expect(levo).not.toHaveBeenCalled();
      expect(tab().style.width).toBe('calc(var(--u) * 18)');

      // Pomeren sloj i druga z-osa (ključ merenja se menja, raspored ne): bez novog merenja, širina ostaje.
      const pomeren = structuredClone(p);
      pomeren.slojevi.reverse();
      Object.assign(pomeren.slojevi.find((s) => s.id === 'tekst')!, { x: 300, y: 200, rotacija: 0 });
      fixture.componentRef.setInput('platno', pomeren);
      fixture.detectChanges();
      await fixture.whenStable();
      expect(levo).not.toHaveBeenCalled();
      expect(tab().style.width).toBe('calc(var(--u) * 18)');
      expect(tab().closest('p')!.dataset['meriTabove']).toBe('5-0');

      fixture.componentRef.setInput('platno', sa<TekstSloj>('tekst', (s) => ({
        ...s, pasusi: [{ ...pasus('a\tb'), uvlacenje: { levo: 18, prviRed: -18 }, tabulatori: [{ poz: 10, poravnanje: 'LEVO' }] }],
      })));
      fixture.detectChanges();
      await fixture.whenStable();
      expect(levo).toHaveBeenCalled();
      expect(tab().style.width).toBe('calc(var(--u) * 10)');
    } finally {
      levo.mockRestore();
    }
  });

  it('TEKST: line-height za proredProcenat 100 je 1,2 kao u fazi 1; razmakPre prvog pasusa ostaje', async () => {
    const p = sa<TekstSloj>('tekst', (s) => ({ ...s, pasusi: [{ ...pasus('a'), razmakPre: 6 }] }));
    const { el } = await prikazi(p);
    const pasusEl = sloj(el, 'tekst').querySelector<HTMLElement>('.uz-pl-pasus')!;
    expect(pasusEl.style.lineHeight).toBe('1.2');
    expect(pasusEl.style.marginTop).toBe('calc(var(--u) * 6)');
    expect(el.style.getPropertyValue('font-kerning')).toBe('');
    expect(el.style.getPropertyValue('font-variant-ligatures')).toBe('');
  });

  it('TABELA: unutrašnje margine ćelije iz metrike (7,2 levo i desno, 3,6 gore i dole); tab u ćeliji sa stopom se meri', async () => {
    const p = sa<TabelaSloj>('tabela', (s) => ({
      ...s, celije: [[celija('A'), { ...celija('B'), pasusi: [{ ...pasus('x\ty'), tabulatori: [{ poz: 40, poravnanje: 'LEVO' }] }] }]],
    }));
    const { el } = await prikazi(p);
    const tds = sloj(el, 'tabela').querySelectorAll<HTMLElement>('td');
    expect([tds[0].style.paddingTop, tds[0].style.paddingRight, tds[0].style.paddingBottom, tds[0].style.paddingLeft])
      .toEqual(['calc(var(--u) * 3.6)', 'calc(var(--u) * 7.2)', 'calc(var(--u) * 3.6)', 'calc(var(--u) * 7.2)']);
    expect(tds[0].querySelector('[data-meri-tabove]')).toBeNull();
    const mereni = tds[1].querySelector<HTMLElement>('.uz-pl-pasus[data-meri-tabove]')!;
    expect(mereni.querySelector('.uz-pl-tab')).not.toBeNull();
    expect(mereni.hasAttribute('data-pasus')).toBe(false);
  });

  it('TEKST: okvir bez preloma i sidro', async () => {
    const p = sa<TekstSloj>('tekst', (s) => ({ ...s, okvir: { ...s.okvir, prelom: false, sidro: 'DNO' }, popuna: '#EEEEEE' }));
    const { el } = await prikazi(p);
    const okvir = sloj(el, 'tekst').querySelector<HTMLElement>('.uz-pl-sadrzaj')!;
    expect(okvir.classList).toContain('uz-pl-tekst--bez-preloma');
    expect(okvir.style.justifyContent).toBe('flex-end');
    expect(okvir.style.backgroundColor).toMatch(/#EEEEEE|rgb\(238, 238, 238\)/i);
  });

  it('TEKST: skala fonta i proreda iz okvira, prored i razmaci pasusa, ivica centrirana na ivici sloja', async () => {
    const p = sa<TekstSloj>('tekst', (s) => ({
      ...s, okvir: { ...s.okvir, skala: 0.5, skalaProreda: 0.9 }, ivica: { boja: '#000000', debljina: 2, crtica: 'PUNA' },
      pasusi: [{ ...pasus('a'), proredProcenat: 150, razmakPre: 6, razmakPosle: 12 }],
    }));
    const { el } = await prikazi(p);
    const okvir = sloj(el, 'tekst').querySelector<HTMLElement>('.uz-pl-sadrzaj')!;
    const pasusEl = okvir.querySelector<HTMLElement>('.uz-pl-pasus')!;
    expect(pasusEl.style.lineHeight).toBe('1.62');
    expect(pasusEl.style.marginTop).toBe('calc(var(--u) * 6)');
    expect(pasusEl.style.marginBottom).toBe('calc(var(--u) * 12)');
    expect(pasusEl.querySelector<HTMLElement>('.uz-pl-deo')!.style.fontSize).toBe('calc(var(--u) * 9)');
    expect(okvir.style.paddingLeft).toBe('calc(var(--u) * 6.2)');
    expect(okvir.getAttribute('style')).toContain('inset: calc(var(--u) * -1)');
  });

  it('pozadina: boja i slika preko celog platna', async () => {
    const p: Platno = { ...platno(), pozadina: { boja: '#123456', medijId: '00000000-0000-0000-0000-000000000009' } };
    const { el } = await prikazi(p);
    expect(el.style.backgroundColor).toMatch(/#123456|rgb\(18, 52, 86\)/i);
    expect(el.querySelector('img.uz-pl-pozadina')?.getAttribute('src')).toBe('api/public/mediji/00000000-0000-0000-0000-000000000009');

    const bez = await prikazi(platno());
    expect(bez.el.querySelector('.uz-pl-pozadina')).toBeNull();
  });
});
