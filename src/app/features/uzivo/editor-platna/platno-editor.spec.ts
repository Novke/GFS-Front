import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { Subject } from 'rxjs';
import { NotificationStore, type Poruka } from '../../../core/state/notification.store';
import { EditorStore } from '../data-access/editor.store';
import type { Platno } from '../data-access/platno.models';
import { platno } from '../data-access/platno-podaci.testing';
import { PrezentacijeApi } from '../data-access/prezentacije.api';
import type { MedijInfo, SlajdDetails } from '../data-access/uzivo.models';
import { OZNAKA_EDITORA_PLATNA } from './oznake';
import { PlatnoEditorComponent } from './platno-editor.component';
import { PlatnoEditorStore } from './platno-editor.store';
import { DIMENZIJE_SLIKE } from './slike-editora';

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
  let otpremanje: Subject<MedijInfo>;
  let poruke: Poruka[];
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
        { provide: PrezentacijeApi, useValue: { upload: () => otpremanje } },
        { provide: DIMENZIJE_SLIKE, useValue: () => Promise.resolve({ sirina: 100, visina: 50 }) },
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    });
    otpremanje = new Subject<MedijInfo>();
    poruke = [];
    TestBed.inject(NotificationStore).poruke$.subscribe((p) => poruke.push(p));
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

  describe('otpremanje slike živi koliko editor slajda', () => {
    const png = () => new File([new Uint8Array([137, 80, 78, 71])], 'slika.png', { type: 'image/png' });
    const medij = (id: string): MedijInfo => ({ id, naziv: 'slika.png', mime: 'image/png', velicina: 4 });
    async function zameniSliku() {
      store.izaberi(['slika']);
      await fixture.whenStable();
      const input = el().querySelector<HTMLInputElement>('app-svojstva-slike input[type="file"]')!;
      Object.defineProperty(input, 'files', { configurable: true, value: [png()] });
      input.dispatchEvent(new Event('change'));
      await fixture.whenStable();
    }
    const slika = () => store.platno().slojevi.find((s) => s.id === 'slika') as { medijId: string };

    it('prelazak na tab Slojevi usred otpremanja: slika se ipak primeni', async () => {
      await zameniSliku();
      store.postaviTab('SLOJEVI');
      await fixture.whenStable();
      expect(el().querySelector('app-svojstva-slike')).toBeNull();
      otpremanje.next(medij('posle-taba'));
      otpremanje.complete();
      await fixture.whenStable();
      expect(slika().medijId).toBe('posle-taba');
      expect(lazni.izmeniPlatno).toHaveBeenLastCalledWith(12, store.platno());
      expect(poruke).toEqual([]);
    });

    it('editor uništen usred otpremanja: poruka, ništa se ne predaje posle', async () => {
      await zameniSliku();
      fixture.destroy();
      const predaja = lazni.izmeniPlatno.mock.calls.length;
      otpremanje.next(medij('kasno'));
      otpremanje.complete();
      expect(poruke.map((p) => p.tekst)).toEqual(['Slika nije primenjena: slajd je zatvoren.']);
      expect(lazni.izmeniPlatno.mock.calls.length).toBe(predaja);
    });
  });

  it('Review Focus 1: otkucan a nepotvrđen broj u panelu je u dokumentu pre nego što Ctrl+S stigne do stranice', async () => {
    store.izaberi(['oblik']);
    await fixture.whenStable();
    const x = Array.from(el().querySelectorAll<HTMLElement>('app-svojstva-sloja mat-form-field'))
      .find((f) => f.querySelector('mat-label')?.textContent?.trim() === 'X')!.querySelector('input')!;
    x.focus();
    x.value = '321';
    x.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
    let xNaStranici: number | null = null;
    const stranica = () => { xNaStranici = store.platno().slojevi.find((s) => s.id === 'oblik')!.x; };
    document.addEventListener('keydown', stranica);
    try {
      const e = taster(x, 's', { ctrlKey: true });
      expect(e.defaultPrevented).toBe(false);
    } finally {
      document.removeEventListener('keydown', stranica);
    }
    expect(xNaStranici).toBe(321);
    expect(lazni.izmeniPlatno).toHaveBeenCalledTimes(1);
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

  it('F7: posle ubacivanja oblika iz menija prava strelica (keydown na okviru) pomera nov sloj za 1', async () => {
    const dugmeOblik = Array.from(el().querySelectorAll<HTMLButtonElement>('button')).find((b) => b.getAttribute('aria-label') === 'Oblik')!;
    dugmeOblik.click();
    await fixture.whenStable();
    Array.from(document.body.querySelectorAll<HTMLElement>('.mat-mdc-menu-item')).find((s) => s.textContent!.trim() === 'Pravougaonik')!.click();
    await fixture.whenStable();
    expect(document.activeElement).toBe(okvir());
    const id = store.izbor()[0];
    const x = store.platno().slojevi.find((s) => s.id === id)!.x;
    taster(okvir(), 'ArrowRight');
    expect(store.platno().slojevi.find((s) => s.id === id)!.x).toBe(x + 1);
  });

  describe('prevlačenje fajla na platno (F7)', () => {
    const spusti = (fajl: File, x: number, y: number) => {
      const e = new Event('drop', { bubbles: true, cancelable: true }) as Event & Record<string, unknown>;
      e['dataTransfer'] = { files: [fajl], types: ['Files'] };
      e['clientX'] = x;
      e['clientY'] = y;
      okvir().dispatchEvent(e);
      return e;
    };

    it('PNG spušten na (100, 100) px (1 px = 1 jedinica): centar slike je (100, 100)', async () => {
      vi.spyOn(okvir().querySelector('.uz-platno')!, 'getBoundingClientRect').mockReturnValue(
        { left: 0, top: 0, width: 960, height: 540, right: 960, bottom: 540, x: 0, y: 0, toJSON: () => ({}) });
      const e = spusti(new File([new Uint8Array([137, 80])], 'a.png', { type: 'image/png' }), 100, 100);
      expect(e.defaultPrevented).toBe(true);
      await new Promise((r) => setTimeout(r)); // merenje dimenzija pre otpremanja
      otpremanje.next({ id: 'm9', naziv: 'a.png', mime: 'image/png', velicina: 2 });
      await vi.waitFor(() => expect(store.platno().slojevi.some((s) => s.tip === 'SLIKA' && s.medijId === 'm9')).toBe(true));
      const s = store.platno().slojevi.find((x) => x.tip === 'SLIKA' && x.medijId === 'm9')!;
      expect(s.x + s.sirina / 2).toBeCloseTo(100, 1);
      expect(s.y + s.visina / 2).toBeCloseTo(100, 1);
      expect(document.activeElement).toBe(okvir());
    });

    it('fajl drugog tipa (text/plain): poruka, bez otpremanja', async () => {
      spusti(new File(['x'], 'a.txt', { type: 'text/plain' }), 10, 10);
      await fixture.whenStable();
      expect(poruke.map((p) => p.tekst)).toEqual(['Prevuci sliku (PNG, JPEG, GIF ili WebP).']);
    });

    it('dragover sa fajlovima se prihvata, bez fajlova ne', () => {
      const sa = new Event('dragover', { bubbles: true, cancelable: true }) as Event & Record<string, unknown>;
      sa['dataTransfer'] = { types: ['Files'] };
      okvir().dispatchEvent(sa);
      expect(sa.defaultPrevented).toBe(true);
      const bez = new Event('dragover', { bubbles: true, cancelable: true }) as Event & Record<string, unknown>;
      bez['dataTransfer'] = { types: ['text/plain'] };
      okvir().dispatchEvent(bez);
      expect(bez.defaultPrevented).toBe(false);
    });
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
