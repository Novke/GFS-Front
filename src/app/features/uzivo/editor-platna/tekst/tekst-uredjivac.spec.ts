import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TextSelection } from 'prosemirror-state';
import { NotificationStore } from '../../../../core/state/notification.store';
import { okvirPodrazumevani, pasus, platnoSaAnimacijama } from '../../data-access/platno-podaci.testing';
import type { TekstSloj } from '../../data-access/platno.models';
import { FokusPlatna } from '../fokus-platna';
import { SAT_ISTORIJE } from '../istorija';
import { PlatnoEditorStore } from '../platno-editor.store';
import { STIL_UREDJIVACA, TekstUredjivacComponent } from './tekst-uredjivac.component';

const sloj = (): TekstSloj => ({
  id: 't', naziv: null, x: 10, y: 10, sirina: 300, visina: 100, rotacija: 0, providnost: 1, zakljucan: false, senka: null,
  tip: 'TEKST', pasusi: [pasus('Prvi'), pasus('Drugi')], okvir: okvirPodrazumevani, popuna: null, ivica: null,
});

describe('TekstUredjivacComponent (pravi EditorView u jsdom-u)', () => {
  let fixture: ComponentFixture<TekstUredjivacComponent>;
  let store: InstanceType<typeof PlatnoEditorStore>;
  let fokus: ReturnType<typeof vi.fn>;
  const obavestenja = { greska: vi.fn(), info: vi.fn(), uspeh: vi.fn() };
  const view = () => fixture.componentInstance.pogled()!;
  const komande = () => fixture.componentInstance.komande;

  beforeEach(async () => {
    fokus = vi.fn();
    TestBed.configureTestingModule({
      imports: [TekstUredjivacComponent],
      providers: [
        provideZonelessChangeDetection(),
        PlatnoEditorStore,
        { provide: FokusPlatna, useValue: { fokus, postavi: vi.fn() } },
        { provide: NotificationStore, useValue: obavestenja },
        { provide: SAT_ISTORIJE, useValue: () => 0 },
      ],
    });
    store = TestBed.inject(PlatnoEditorStore);
    store.inicijalizuj(platnoSaAnimacijama([], [sloj()]));
    store.pocniUredjivanje('t');
    fixture = TestBed.createComponent(TekstUredjivacComponent);
    fixture.componentRef.setInput('sloj', sloj());
    fixture.componentRef.setInput('tema', 'NACRT');
    await fixture.whenStable();
  });

  afterEach(() => vi.restoreAllMocks());

  it('koren je textbox sa aria-multiline i aria-label, montiran na .uz-pl-sadrzaj.uz-pl-tekst', () => {
    const dom = view().dom as HTMLElement;
    expect(dom.classList).toContain('uz-pl-sadrzaj');
    expect(dom.classList).toContain('uz-pl-tekst');
    expect(dom.getAttribute('contenteditable')).toBe('true');
    expect(dom.getAttribute('role')).toBe('textbox');
    expect(dom.getAttribute('aria-multiline')).toBe('true');
    expect(dom.getAttribute('aria-label')).toBe('Tekst sloja Tekst: Prvi');
    expect(dom.querySelectorAll('p.uz-pl-pasus')).toHaveLength(2);
  });

  it('registruje se u store-u kao aktivni uređivač', () => {
    expect(store.aktivniUredjivac()).toBe(komande());
  });

  it('unos -> presek() vraća pasuse sa tekstom i mapu; drugi presek bez izmena -> null', () => {
    view().dispatch(view().state.tr.insertText('X', 1));
    const r = komande().presek()!;
    expect(r.pasusi.map((p) => p.delovi.map((d) => d.tekst).join(''))).toEqual(['XPrvi', 'Drugi']);
    expect(r.pasusi[0].delovi[0]).toMatchObject({ font: 'Carlito', velicina: 18 });
    expect(r.mapa).toEqual([0, 1]);
    expect(komande().presek()).toBeNull();
  });

  it('bez izmena (ili posle unosa pa brisanja) presek je null', () => {
    expect(komande().presek()).toBeNull();
    view().dispatch(view().state.tr.insertText('X', 1));
    view().dispatch(view().state.tr.delete(1, 2));
    expect(komande().presek()).toBeNull();
  });

  it('posle fixture.destroy() presek() i dalje vraća poslednji nepreuzet rezultat', () => {
    view().dispatch(view().state.tr.insertText('Z', 1));
    const k = komande();
    fixture.destroy();
    expect(k.presek()!.pasusi[0].delovi[0].tekst).toBe('ZPrvi');
    expect(k.presek()).toBeNull();
  });

  it('Ctrl+Z (keydown na view.dom) poništava unos unutar sesije', () => {
    view().dispatch(view().state.tr.insertText('X', 1));
    const e = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true });
    view().dom.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(view().state.doc.child(0).textContent).toBe('Prvi');
  });

  it('Esc -> store.zavrsiUredjivanje i fokus okvira platna', () => {
    const zavrsi = vi.spyOn(store, 'zavrsiUredjivanje');
    view().dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(zavrsi).toHaveBeenCalledTimes(1);
    expect(fokus).toHaveBeenCalled();
    expect(store.uredjivanje()).toBeNull();
  });

  it('Enter deli pasus sa novim ključem (nasleđuje atribute), a presek mapira stare indekse', () => {
    view().dispatch(view().state.tr.setSelection(TextSelection.create(view().state.doc, 1)));
    view().dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    const r = komande().presek()!;
    expect(r.pasusi.map((p) => p.delovi[0]?.tekst ?? '')).toEqual(['', 'Prvi', 'Drugi']);
    expect(r.mapa).toEqual([1, 2]);
  });

  it('stanje prati izbor (stil teksta)', () => {
    expect(komande().stanje()).toMatchObject({ font: 'Carlito', velicina: 18, lista: 'BEZ' });
  });

  it('komande teksta rade nad view-om (postaviStil, prebaciListu)', () => {
    view().dispatch(view().state.tr.setSelection(TextSelection.create(view().state.doc, 1, 5)));
    komande().postaviStil({ velicina: 40 });
    komande().prebaciListu('ZNAK');
    const r = komande().presek()!;
    expect(r.pasusi[0].delovi[0]).toMatchObject({ tekst: 'Prvi', velicina: 40 });
    expect(r.pasusi[0].lista?.vrsta).toBe('ZNAK');
    expect(komande().stanje().velicina).toBe(40);
  });

  it('Fix 1/3: odbaciPresek vraća osnovu preseka (sledeći presek opet daje isti tekst i mapu)', () => {
    view().dispatch(view().state.tr.insertText('X', 1));
    const prvi = komande().presek()!;
    komande().odbaciPresek();
    expect(komande().presek()).toEqual(prvi);
    expect(komande().presek()).toBeNull();
  });

  it('Fix 1/2: netaknut prazan pasus bez delova ostaje bajt-isti posle preseka (ne raste na stil suseda)', async () => {
    const naslov = { ...pasus('Naslov'), delovi: [{ ...pasus('Naslov').delovi[0], velicina: 40 }] };
    const prazan = { ...pasus(''), delovi: [] };
    const kraj = { ...pasus('kraj'), delovi: [{ ...pasus('kraj').delovi[0], font: 'Tinos', velicina: 30 }] };
    const s3: TekstSloj = { ...sloj(), pasusi: [naslov, prazan, kraj] };
    store.inicijalizuj(platnoSaAnimacijama([], [s3]));
    store.pocniUredjivanje('t');
    fixture.destroy();
    fixture = TestBed.createComponent(TekstUredjivacComponent);
    fixture.componentRef.setInput('sloj', s3);
    fixture.componentRef.setInput('tema', 'NACRT');
    await fixture.whenStable();
    view().dispatch(view().state.tr.insertText('!', 7));
    const r = komande().presek()!;
    expect(r.pasusi[0].delovi[0].tekst).toBe('Naslov!');
    expect(r.pasusi[1]).toStrictEqual(prazan);
    expect(r.pasusi[2]).toStrictEqual(kraj);
  });

  it('preko 50 000 znakova na slajdu: unos odbijen porukom', async () => {
    const pun: TekstSloj = { ...sloj(), id: 'pun', pasusi: [pasus('x'.repeat(49_990))] };
    store.inicijalizuj(platnoSaAnimacijama([], [pun, sloj()]));
    store.pocniUredjivanje('t');
    fixture.destroy();
    fixture = TestBed.createComponent(TekstUredjivacComponent);
    fixture.componentRef.setInput('sloj', sloj());
    fixture.componentRef.setInput('tema', 'NACRT');
    await fixture.whenStable();
    view().dispatch(view().state.tr.insertText('ab', 1));
    expect(obavestenja.greska).toHaveBeenCalledWith('Slajd može imati najviše 50000 znakova teksta.');
    expect(view().state.doc.child(0).textContent).toBe('Prvi');
    view().dispatch(view().state.tr.insertText('a', 1));
    expect(view().state.doc.child(0).textContent).toBe('aPrvi');
  });

  /*
   * F19 fix 1: Shift/Ctrl+strelice menja izbor u DOM-u, a ProseMirror ga upisuje u stanje tek na `selectionchange`
   * (zaseban zadatak). Kad je glavna nit zauzeta, sledeći taster stigne pre toga. Ovde je DOM izbor promenjen bez
   * `selectionchange`: komanda mora da radi nad izborom iz DOM-a, ne nad starim. "Prvi" = 1..5, "Drugi" = 7..12.
   */
  describe('izbor iz DOM-a pre komande tastature (zakasneo selectionchange)', () => {
    const naKraju = () => view().dispatch(view().state.tr.setSelection(TextSelection.create(view().state.doc, 12)));
    const izaberiUDomu = (od: number, ka: number) => {
      const a = view().domAtPos(od);
      const b = view().domAtPos(ka);
      document.getSelection()!.setBaseAndExtent(a.node, a.offset, b.node, b.offset);
    };
    const taster = (key: string, ctrlKey = false) =>
      view().dom.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey, bubbles: true, cancelable: true }));

    it('Ctrl+B podebljava reč izabranu u DOM-u, ne stari (prazan) izbor', () => {
      naKraju();
      izaberiUDomu(7, 12);
      taster('b', true);
      const r = komande().presek()!;
      expect(r.pasusi[1].delovi.map((d) => [d.tekst, d.podebljano])).toEqual([['Drugi', true]]);
      expect(r.pasusi[0].delovi.map((d) => d.podebljano)).toEqual([false]);
    });

    it('Backspace briše izbor iz DOM-a (kraj prvog do kraja drugog pasusa) u jednom koraku; jedan Ctrl+Z ga vraća', () => {
      naKraju();
      izaberiUDomu(5, 12);
      taster('Backspace');
      expect(view().state.doc.childCount).toBe(1);
      expect(view().state.doc.textContent).toBe('Prvi');
      taster('z', true);
      expect([view().state.doc.child(0).textContent, view().state.doc.child(1).textContent]).toEqual(['Prvi', 'Drugi']);
    });

    it('isti izbor u DOM-u i u stanju: nijedna dodatna transakcija', () => {
      naKraju();
      izaberiUDomu(12, 12);
      const dispatch = vi.spyOn(view(), 'dispatch');
      taster('Shift');
      expect(dispatch).not.toHaveBeenCalled();
    });
  });
});

describe('STIL_UREDJIVACA', () => {
  it('svako pravilo počinje sa .uz-ep-uredjivanje (nikad golo .uz-pl-*), i staje u 4 kB', () => {
    const selektori: string[] = [];
    for (const m of STIL_UREDJIVACA.matchAll(/(^|})\s*([^{}]+)\{/g)) selektori.push(...m[2].split(',').map((s) => s.trim()));
    expect(selektori.length).toBeGreaterThan(2);
    for (const s of selektori) expect(s.startsWith('.uz-ep-uredjivanje'), s).toBe(true);
    expect(STIL_UREDJIVACA).toContain('white-space: pre-wrap');
    expect(STIL_UREDJIVACA).toContain('caret-color: currentColor');
    expect(new TextEncoder().encode(STIL_UREDJIVACA).length).toBeLessThanOrEqual(4096);
  });

  it('komponenta ima styles: [STIL_UREDJIVACA] (stil je u dokumentu posle pravljenja)', async () => {
    TestBed.configureTestingModule({
      imports: [TekstUredjivacComponent],
      providers: [
        provideZonelessChangeDetection(), PlatnoEditorStore,
        { provide: FokusPlatna, useValue: { fokus: vi.fn(), postavi: vi.fn() } },
        { provide: NotificationStore, useValue: { greska: vi.fn(), info: vi.fn() } },
        { provide: SAT_ISTORIJE, useValue: () => 0 },
      ],
    });
    const s = TestBed.inject(PlatnoEditorStore);
    s.inicijalizuj(platnoSaAnimacijama([], [sloj()]));
    const f = TestBed.createComponent(TekstUredjivacComponent);
    f.componentRef.setInput('sloj', sloj());
    f.componentRef.setInput('tema', 'NACRT');
    await f.whenStable();
    const css = [...document.querySelectorAll('style')].map((st) => st.textContent ?? '').join('\n');
    expect(css).toContain('.uz-ep-uredjivanje .uz-pl-tekst');
    f.destroy();
  });
});
