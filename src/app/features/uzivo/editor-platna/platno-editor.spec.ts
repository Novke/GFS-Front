import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { EditorStore } from '../data-access/editor.store';
import type { Platno } from '../data-access/platno.models';
import { platno } from '../data-access/platno-podaci.testing';
import { PrezentacijeApi } from '../data-access/prezentacije.api';
import type { SlajdDetails } from '../data-access/uzivo.models';
import { OZNAKA_EDITORA_PLATNA } from './oznake';
import { PlatnoEditorComponent } from './platno-editor.component';
import { PlatnoEditorStore } from './platno-editor.store';

function platnoSlajd(): SlajdDetails {
  return {
    id: 12, rb: 2, tip: 'PLATNO', naslov: null, sadrzaj: null, slika: null, beleske: null, postepeno: false, pitanje: null,
    platno: platno(),
  };
}

describe('PlatnoEditorComponent', () => {
  let fixture: ComponentFixture<PlatnoEditorComponent>;
  let lazni: {
    izmeniPlatno: ReturnType<typeof vi.fn<(id: number, p: Platno) => void>>;
    registrujPraznjenje: ReturnType<typeof vi.fn<(f: (() => void) | null, o?: () => boolean) => () => void>>;
  };
  let odjava: ReturnType<typeof vi.fn<() => void>>;
  let store: InstanceType<typeof PlatnoEditorStore>;
  const el = () => fixture.nativeElement as HTMLElement;
  const okvir = () => el().querySelector<HTMLElement>('.uz-ep-platno')!;
  const taster = (cilj: Element, key: string, o: KeyboardEventInit = {}) => {
    const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...o });
    cilj.dispatchEvent(e);
    return e;
  };

  beforeEach(async () => {
    odjava = vi.fn<() => void>();
    lazni = {
      izmeniPlatno: vi.fn<(id: number, p: Platno) => void>(),
      registrujPraznjenje: vi.fn<(f: (() => void) | null, o?: () => boolean) => () => void>(() => odjava),
    };
    TestBed.configureTestingModule({
      imports: [PlatnoEditorComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: EditorStore, useValue: lazni },
        { provide: PrezentacijeApi, useValue: {} },
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    });
    fixture = TestBed.createComponent(PlatnoEditorComponent);
    fixture.componentRef.setInput('slajd', platnoSlajd());
    fixture.componentRef.setInput('tema', 'NACRT');
    await fixture.whenStable();
    store = fixture.debugElement.injector.get(PlatnoEditorStore);
  });

  afterEach(() => vi.restoreAllMocks());

  it('domaćin nosi oznaku lenjog chunk-a editora', () => {
    expect(el().getAttribute('data-oznaka')).toBe(OZNAKA_EDITORA_PLATNA);
    expect(OZNAKA_EDITORA_PLATNA).toBe('gfs-editor-platna');
  });

  it('platno crta svih 6 slojeva bez animacija: slojevi koji u pregledu kreću skriveni su vidljivi', () => {
    const slojevi = Array.from(el().querySelectorAll<HTMLElement>('app-platno-prikaz [data-sloj]'));
    expect(slojevi.map((s) => s.dataset['sloj'])).toEqual(['tekst', 'slika', 'oblik', 'tabela', 'formula', 'crtez']);
    for (const s of slojevi) expect(s.style.visibility).not.toBe('hidden');
    expect(el().querySelector('[data-pasus="0"]')!.getAttribute('style') ?? '').not.toContain('hidden');
  });

  it('okvir platna je fokusabilna grupa sa opisom prečica', () => {
    const o = okvir();
    expect(o.getAttribute('tabindex')).toBe('0');
    expect(o.getAttribute('role')).toBe('group');
    expect(o.getAttribute('aria-label')).toBe('Platno slajda');
    expect(el().querySelector('#' + o.getAttribute('aria-describedby'))!.textContent).toContain('Delete briše');
  });

  it('okvir platna prati režim editora (fokus prsten u tokenima režima), a samo platno je uvek dnevno', () => {
    expect(okvir().classList).not.toContain('rezim-dan');
    expect(okvir().classList).not.toContain('uz-dan');
    const platnoEl = okvir().querySelector<HTMLElement>(':scope > .uz-platno')!;
    expect(platnoEl.classList).toContain('rezim-dan');
    expect(platnoEl.classList).toContain('uz-dan');
    expect(platnoEl.querySelector('app-platno-prikaz')).not.toBeNull();
    expect(platnoEl.querySelector('app-platno-overlay')).not.toBeNull();
  });

  it('Delete na okviru briše izabran sloj i njegove animacije; Ctrl+Z vraća, Ctrl+Y ponovo briše', async () => {
    const pocetak = store.platno();
    store.izaberi(['oblik']);
    okvir().focus();
    const e = taster(okvir(), 'Delete');
    expect(e.defaultPrevented).toBe(true);
    expect(lazni.izmeniPlatno).toHaveBeenCalledTimes(1);
    const [id, bez] = lazni.izmeniPlatno.mock.calls[0];
    expect(id).toBe(12);
    expect(bez.slojevi.map((s) => s.id)).not.toContain('oblik');
    expect(bez.animacije.some((a) => a.slojId === 'oblik')).toBe(false);

    taster(okvir(), 'z', { ctrlKey: true });
    expect(lazni.izmeniPlatno.mock.calls[1][1]).toBe(pocetak);
    taster(okvir(), 'y', { ctrlKey: true });
    expect(lazni.izmeniPlatno.mock.calls[2][1]).toEqual(bez);
    expect(lazni.izmeniPlatno).toHaveBeenCalledTimes(3);
  });

  it('Review Focus 3: Ctrl+Z u polju panela Slojevi i ArrowRight na tabu ne menjaju dokument', async () => {
    store.izaberi(['oblik']);
    taster(okvir(), 'Delete');
    lazni.izmeniPlatno.mockClear();
    const pre = store.platno();

    store.postaviTab('SLOJEVI');
    await fixture.whenStable();
    el().querySelector<HTMLButtonElement>('button[aria-label="Preimenuj"]')!.click();
    await fixture.whenStable();
    const polje = el().querySelector<HTMLInputElement>('input[aria-label="Naziv sloja"]')!;
    expect(polje).not.toBeNull();
    taster(polje, 'z', { ctrlKey: true });
    const tab = el().querySelector<HTMLElement>('[role="tab"]')!;
    expect(tab).not.toBeNull();
    taster(tab, 'ArrowRight');

    expect(lazni.izmeniPlatno).not.toHaveBeenCalled();
    expect(store.platno()).toBe(pre);
    expect(store.mozeNazad()).toBe(true);
  });

  it('Ctrl+S na okviru prazni otvorenu sesiju i pušta događaj do stranice (bez preventDefault)', () => {
    const isprazni = vi.spyOn(store, 'isprazni');
    const e = taster(okvir(), 's', { ctrlKey: true });
    expect(isprazni).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(false);
  });

  it('Esc na okviru poništava izbor bez izmene dokumenta', () => {
    store.izaberi(['oblik']);
    taster(okvir(), 'Escape');
    expect(store.izbor()).toEqual([]);
    expect(lazni.izmeniPlatno).not.toHaveBeenCalled();
  });

  it('registruje pražnjenje u ngOnInit (dve funkcije), a pri uništavanju prvo prazni pa zove SVOJU odjavu (ne null)', () => {
    expect(lazni.registrujPraznjenje).toHaveBeenCalledTimes(1);
    const [isprazni, otvoreno] = lazni.registrujPraznjenje.mock.calls[0];
    expect(typeof isprazni).toBe('function');
    expect(typeof otvoreno).toBe('function');
    const spij = vi.spyOn(store, 'isprazni');
    isprazni!();
    expect(spij).toHaveBeenCalledTimes(1);
    expect(otvoreno!()).toBe(false);

    spij.mockClear();
    fixture.destroy();
    expect(odjava).toHaveBeenCalledTimes(1);
    expect(spij).toHaveBeenCalled();
    expect(spij.mock.invocationCallOrder[0]).toBeLessThan(odjava.mock.invocationCallOrder[0]);
    expect(lazni.registrujPraznjenje).toHaveBeenCalledTimes(1);
    expect(lazni.registrujPraznjenje).not.toHaveBeenCalledWith(null);
  });

  it('uništavanje posle izmene bez izlaza ne predaje ništa dvaput (pražnjenje je idempotentno)', () => {
    store.izaberi(['oblik']);
    taster(okvir(), 'Delete');
    fixture.destroy();
    expect(lazni.izmeniPlatno).toHaveBeenCalledTimes(1);
  });

  it('izlaz čita id slajda u trenutku izmene (nacrt dobija pravi id)', async () => {
    fixture.componentRef.setInput('slajd', { ...platnoSlajd(), id: 30 });
    await fixture.whenStable();
    store.izaberi(['oblik']);
    taster(okvir(), 'Delete');
    expect(lazni.izmeniPlatno.mock.calls[0][0]).toBe(30);
  });

  it('aria-live najavljuje izbor nazivom sloja', async () => {
    const najava = () => el().querySelector('[aria-live="polite"]')!.textContent!.trim();
    expect(najava()).toBe('Ništa nije izabrano');
    store.izaberi(['oblik']);
    await fixture.whenStable();
    expect(najava()).toBe('Izabrano: Elipsa 1');
    store.izaberi(['oblik', 'slika']);
    await fixture.whenStable();
    expect(najava()).toBe('Izabrano slojeva: 2');
  });

  it('tabovi Svojstva i Slojevi prate store; Svojstva bez izbora pokazuje svojstva slajda, sa izborom svojstva sloja', async () => {
    const tabovi = Array.from(el().querySelectorAll<HTMLElement>('[role="tab"]')).map((t) => t.textContent!.trim());
    expect(tabovi).toEqual(['Svojstva', 'Slojevi']);
    expect(el().querySelector('app-panel-svojstva app-svojstva-slajda')).not.toBeNull();
    store.izaberi(['oblik']);
    await fixture.whenStable();
    expect(el().querySelector('app-panel-svojstva app-svojstva-oblika')).not.toBeNull();
    store.ponistiIzbor();
    store.postaviTab('SLOJEVI');
    await fixture.whenStable();
    expect(el().querySelector('app-panel-slojevi')).not.toBeNull();
    el().querySelectorAll<HTMLElement>('[role="tab"]')[0].click();
    await fixture.whenStable();
    expect(store.tab()).toBe('SVOJSTVA');
  });

  it('traka: Poništi i Ponovi prate istoriju, Obriši briše izabrano', async () => {
    const dugme = (ime: string) => el().querySelector<HTMLButtonElement>(`app-traka-alata button[aria-label="${ime}"]`)!;
    expect(dugme('Poništi').getAttribute('aria-disabled')).toBe('true');
    expect(dugme('Ponovi').getAttribute('aria-disabled')).toBe('true');
    store.izaberi(['oblik']);
    await fixture.whenStable();
    dugme('Obriši').click();
    await fixture.whenStable();
    expect(lazni.izmeniPlatno).toHaveBeenCalledTimes(1);
    expect(dugme('Poništi').getAttribute('aria-disabled')).not.toBe('true');
    dugme('Poništi').click();
    await fixture.whenStable();
    expect(store.platno().slojevi.map((s) => s.id)).toContain('oblik');
    expect(dugme('Ponovi').getAttribute('aria-disabled')).not.toBe('true');
    store.izaberi(['tekst']);
    dugme('Napred').click();
    expect(store.platno().slojevi[1].id).toBe('tekst');
    dugme('Nazad').click();
    expect(store.platno().slojevi[0].id).toBe('tekst');
  });
});

describe('PlatnoEditorComponent: dve instance (promena slajda) nad pravim EditorStore-om', () => {
  it('stara instanca koja nestaje posle registracije nove ne briše registraciju nove', async () => {
    TestBed.configureTestingModule({
      imports: [PlatnoEditorComponent],
      providers: [
        provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting(), EditorStore,
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    });
    const editorStore = TestBed.inject(EditorStore);
    const napravi = async (id: number) => {
      const f = TestBed.createComponent(PlatnoEditorComponent);
      f.componentRef.setInput('slajd', { ...platnoSlajd(), id });
      f.componentRef.setInput('tema', 'NACRT');
      await f.whenStable();
      return f;
    };
    const stara = await napravi(12);
    const nova = await napravi(13);
    const novaStore = nova.debugElement.injector.get(PlatnoEditorStore);
    const isprazniNove = vi.spyOn(novaStore, 'isprazni');
    vi.spyOn(novaStore, 'imaOtvoreno').mockReturnValue(true);

    stara.destroy();
    editorStore.isprazni();
    expect(isprazniNove).toHaveBeenCalledTimes(1);
    expect(editorStore.imaNesacuvano()).toBe(true);

    nova.destroy();
    isprazniNove.mockClear();
    editorStore.isprazni();
    expect(isprazniNove).not.toHaveBeenCalled();
    expect(editorStore.imaNesacuvano()).toBe(false);
    vi.restoreAllMocks();
  });
});
