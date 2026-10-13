import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { Subject } from 'rxjs';
import { NotificationStore, type Poruka } from '../../../core/state/notification.store';
import { EditorStore } from '../data-access/editor.store';
import type { Platno, TekstSloj } from '../data-access/platno.models';
import { pasus, platno } from '../data-access/platno-podaci.testing';
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
    registrujPraznjenje: ReturnType<typeof vi.fn<(f: () => void, o?: () => boolean) => () => void>>;
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
      registrujPraznjenje: vi.fn<(f: () => void, o?: () => boolean) => () => void>(() => odjava),
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
    const opis = el().querySelector('#' + o.getAttribute('aria-describedby'))!.textContent;
    expect(opis).toContain('Delete briše');
    expect(opis).toContain('Ctrl+Z i Ctrl+Y rade i iz panela');
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

  describe('Ctrl+Z, Ctrl+Shift+Z i Ctrl+Y na korenu editora (i iz panela); ostale prečice samo na okviru', () => {
    const oblikSloj = () => store.platno().slojevi.find((s) => s.id === 'oblik')!;
    const prekidacSenke = () => el().querySelector<HTMLButtonElement>('app-svojstva-sloja .uz-ep-senka button[role="switch"]')!;
    const dugmeBoje = () => el().querySelector<HTMLButtonElement>('app-svojstva-oblika button[aria-haspopup="dialog"]')!;
    async function izaberiOblik() {
      store.izaberi(['oblik']);
      await fixture.whenStable();
    }

    it('fokus na prekidaču senke posle izmene: Ctrl+Z poništava, Ctrl+Shift+Z i Ctrl+Y ponavljaju', async () => {
      await izaberiOblik();
      const pre = store.platno();
      prekidacSenke().click();
      await fixture.whenStable();
      expect(oblikSloj().senka).not.toBeNull();
      const posle = store.platno();

      const e = taster(prekidacSenke(), 'z', { ctrlKey: true });
      expect(e.defaultPrevented).toBe(true);
      expect(store.platno()).toBe(pre);
      expect(lazni.izmeniPlatno).toHaveBeenLastCalledWith(12, pre);
      taster(prekidacSenke(), 'z', { ctrlKey: true, shiftKey: true });
      expect(store.platno()).toBe(posle);
      taster(prekidacSenke(), 'z', { ctrlKey: true });
      expect(store.platno()).toBe(pre);
      taster(prekidacSenke(), 'y', { ctrlKey: true });
      expect(store.platno()).toBe(posle);
      expect(lazni.izmeniPlatno).toHaveBeenCalledTimes(5);
    });

    it('fokus na dugmetu boje posle izmene: Ctrl+Z poništava; strelice i Delete tu ne rade', async () => {
      await izaberiOblik();
      const pre = store.platno();
      store.pomeriIzabrane(5, 0);
      await fixture.whenStable();
      const posle = store.platno();
      dugmeBoje().focus();

      for (const [key, o] of [['ArrowRight', {}], ['Delete', {}], ['d', { ctrlKey: true }], ['a', { ctrlKey: true }]] as const) {
        const e = taster(dugmeBoje(), key, o);
        expect(e.defaultPrevented).toBe(false);
      }
      expect(store.platno()).toBe(posle);
      expect(store.izbor()).toEqual(['oblik']);

      taster(dugmeBoje(), 'z', { ctrlKey: true });
      expect(store.platno()).toBe(pre);
    });

    it('zatvoren mat-select (Vrsta) posle izmene: Ctrl+Z poništava', async () => {
      await izaberiOblik();
      const pre = store.platno();
      store.pomeriIzabrane(5, 0);
      await fixture.whenStable();
      const izbornik = el().querySelector<HTMLElement>('app-svojstva-oblika mat-select')!;
      expect(izbornik.getAttribute('role')).toBe('combobox');
      expect(izbornik.getAttribute('aria-expanded')).toBe('false');
      const e = taster(izbornik, 'z', { ctrlKey: true });
      expect(e.defaultPrevented).toBe(true);
      expect(store.platno()).toBe(pre);
    });

    // Zatvoren mat-select pušta Shift (+Ctrl/Meta) u typeahead: "Z" iz Ctrl+Shift+Z bi posle debounce-a (200 ms)
    // izabrao "Zaobljeni pravougaonik". Koren zato undo/redo nad zatvorenim izbornikom obrađuje u capture fazi.
    const sacekaj = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    async function nizNaIzborniku(izbornik: HTMLElement, mod: 'ctrlKey' | 'metaKey') {
      const pre = store.platno();
      store.pomeriIzabrane(5, 0);
      await fixture.whenStable();
      const posle = store.platno();
      const dogadjaji = [
        taster(izbornik, 'z', { [mod]: true }),
        taster(izbornik, 'Z', { [mod]: true, shiftKey: true }),
        taster(izbornik, 'z', { [mod]: true }),
      ];
      expect(dogadjaji.map((e) => e.defaultPrevented)).toEqual([true, true, true]);
      await sacekaj(350);   // duže od typeahead debounce-a mat-select-a
      await fixture.whenStable();
      return { pre, posle };
    }

    it('zatvoren "Vrsta": Ctrl+Z, Ctrl+Shift+Z, Ctrl+Z ne puštaju "Z" u typeahead (oblik ostaje Elipsa)', async () => {
      await izaberiOblik();
      const izbornik = el().querySelector<HTMLElement>('app-svojstva-oblika mat-select')!;
      const { pre } = await nizNaIzborniku(izbornik, 'ctrlKey');
      expect(store.platno()).toBe(pre);
      expect((oblikSloj() as { oblik: string }).oblik).toBe('ELIPSA');
      expect([store.mozeNazad(), store.mozeNapred()]).toEqual([false, true]);
    });

    it('zatvoren "Vrsta" i Cmd (Meta)+Shift+Z: redo bez izbora opcije', async () => {
      await izaberiOblik();
      const izbornik = el().querySelector<HTMLElement>('app-svojstva-oblika mat-select')!;
      const { posle } = await nizNaIzborniku(izbornik, 'metaKey');
      taster(izbornik, 'Z', { metaKey: true, shiftKey: true });
      await sacekaj(350);
      await fixture.whenStable();
      expect(store.platno()).toBe(posle);
      expect((oblikSloj() as { oblik: string }).oblik).toBe('ELIPSA');
      expect(store.mozeNapred()).toBe(false);
    });

    it('zatvoren "Crtica" (ivica postoji): isti put, crtica i dokument tačni', async () => {
      const p = store.platno();
      store.inicijalizuj({
        ...p,
        slojevi: p.slojevi.map((s) => (s.id === 'oblik' ? { ...s, ivica: { boja: '#000000', debljina: 1, crtica: 'PUNA' } } : s)),
      } as typeof p);
      await izaberiOblik();
      const izbornici = el().querySelectorAll<HTMLElement>('app-svojstva-oblika mat-select');
      const crtica = izbornici[izbornici.length - 1];
      expect(crtica.getAttribute('aria-disabled')).toBe('false');
      const { pre } = await nizNaIzborniku(crtica, 'ctrlKey');
      expect(store.platno()).toBe(pre);
      expect((oblikSloj() as { ivica: { crtica: string } }).ivica.crtica).toBe('PUNA');
    });

    it('Ctrl+Z u polju za unos panela ne menja dokument (polje zadržava svoje poništavanje)', async () => {
      await izaberiOblik();
      store.pomeriIzabrane(5, 0);
      await fixture.whenStable();
      const posle = store.platno();
      const x = Array.from(el().querySelectorAll<HTMLElement>('app-svojstva-sloja mat-form-field'))
        .find((f) => f.querySelector('mat-label')?.textContent?.trim() === 'X')!.querySelector('input')!;
      for (const key of ['z', 'y']) {
        const e = taster(x, key, { ctrlKey: true });
        expect(e.defaultPrevented).toBe(false);
      }
      expect(taster(x, 'z', { ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(false);
      expect(store.platno()).toBe(posle);
      expect(store.mozeNazad()).toBe(true);
    });

    it('Ctrl+Z na okviru poništava tačno jednom (koren ne ponavlja komandu okvira)', async () => {
      await izaberiOblik();
      store.pomeriIzabrane(5, 0);
      store.pomeriIzabrane(0, 5);
      const ponisti = vi.spyOn(store, 'ponisti');
      const ponovi = vi.spyOn(store, 'ponovi');
      taster(okvir(), 'z', { ctrlKey: true });
      expect(ponisti).toHaveBeenCalledTimes(1);
      taster(okvir(), 'y', { ctrlKey: true });
      expect(ponovi).toHaveBeenCalledTimes(1);
      expect(store.mozeNazad()).toBe(true);
    });
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

  it('registruje pražnjenje u ngOnInit (dve funkcije), a pri uništavanju prvo prazni pa zove SVOJU odjavu', () => {
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
  describe('uređivanje teksta (F12)', () => {
    const overlay = () => el().querySelector<HTMLElement>('app-platno-overlay')!;
    const uredjivac = () => el().querySelector<HTMLElement>('.uz-ep-uredjivanje [contenteditable]');
    const dvoklik = (x: number, y: number) =>
      overlay().dispatchEvent(new MouseEvent('dblclick', { clientX: x, clientY: y, bubbles: true }));
    /** Samo TEKST sloj (10, 10, 200 x 100) je vidljiv: ostali slojevi fiksture leže preko njega. */
    async function samoTekst() {
      for (const id of ['slika', 'oblik', 'tabela', 'formula', 'crtez']) store.prebaciSkriven(id);
      await fixture.whenStable();
    }
    const pasusIz = (t: string) => pasus(t);
    const tab = (ime: string) => Array.from(el().querySelectorAll<HTMLElement>('[role="tab"]')).find((t) => t.textContent!.trim() === ime)!;

    it('dvoklik na TEKST sloj: uređivač (contenteditable) u sloju za uređivanje, a prikaz nema taj sloj', async () => {
      await samoTekst();
      dvoklik(50, 50);
      await fixture.whenStable();
      expect(uredjivac()).not.toBeNull();
      expect(uredjivac()!.getAttribute('aria-label')).toBe('Tekst sloja Tekst: Prvi');
      expect(el().querySelector('app-platno-prikaz [data-sloj="tekst"]')).toBeNull();
      // sloj za uređivanje je UNUTAR okvira platna (Ctrl+S okvira važi i u tekstu)
      expect(okvir().contains(uredjivac())).toBe(true);
      expect(document.activeElement).toBe(uredjivac());
    });

    it('Enter na izabranom TEKST sloju radi isto (F2 takođe)', async () => {
      store.izaberi(['tekst']);
      expect(taster(okvir(), 'Enter').defaultPrevented).toBe(true);
      await fixture.whenStable();
      expect(store.uredjivanje()).toEqual({ slojId: 'tekst', celija: null });
      expect(uredjivac()).not.toBeNull();
      taster(uredjivac()!, 'Escape');
      await fixture.whenStable();
      store.izaberi(['tekst']);
      taster(okvir(), 'F2');
      expect(store.uredjivanje()?.slojId).toBe('tekst');
    });

    it('Enter na izabranom oblik sloju: ništa', () => {
      store.izaberi(['oblik']);
      taster(okvir(), 'Enter');
      expect(store.uredjivanje()).toBeNull();
    });

    it('"Tekst" iz trake: nov sloj u uređivanju sa fontom teme', async () => {
      Array.from(el().querySelectorAll<HTMLButtonElement>('button')).find((b) => b.getAttribute('aria-label') === 'Tekst')!.click();
      await fixture.whenStable();
      const id = store.uredjivanje()!.slojId;
      expect(store.platno().slojevi.at(-1)!.id).toBe(id);
      expect(uredjivac()).not.toBeNull();
      expect(uredjivac()!.querySelector<HTMLElement>('p')!.getAttribute('style') ?? '').toContain('IBM Plex Sans');
      expect(document.activeElement).toBe(uredjivac());
    });

    it('Note F4b RF3: uPoljuZaUnos za contenteditable UNUTAR okvira: Delete, strelice i Ctrl+Z u tekstu ne diraju platno', async () => {
      await samoTekst();
      dvoklik(50, 50);
      await fixture.whenStable();
      lazni.izmeniPlatno.mockClear();
      const pre = store.platno();
      const cilj = uredjivac()!;
      expect(okvir().contains(cilj)).toBe(true);
      taster(cilj, 'Delete');
      taster(cilj, 'ArrowRight');
      taster(cilj, 'z', { ctrlKey: true });
      taster(cilj, 'a', { ctrlKey: true });
      expect(store.platno()).toBe(pre);
      expect(store.izbor()).toEqual(['tekst']);
      expect(store.uredjivanje()).not.toBeNull();
      expect(lazni.izmeniPlatno).not.toHaveBeenCalled();
    });

    it('Ctrl+S u tekstu: otvoren tekst ide u dokument (izlaz), sesija ostaje, događaj ide do stranice', async () => {
      await samoTekst();
      dvoklik(50, 50);
      await fixture.whenStable();
      lazni.izmeniPlatno.mockClear();
      const k = store.aktivniUredjivac()!;
      vi.spyOn(k, 'presek').mockReturnValueOnce({ pasusi: [pasusIz('Sačuvano')], mapa: [0, null] });
      const e = taster(uredjivac()!, 's', { ctrlKey: true });
      expect(e.defaultPrevented).toBe(false);
      expect(lazni.izmeniPlatno).toHaveBeenCalledTimes(1);
      expect(store.uredjivanje()).not.toBeNull();
    });

    it('F13: panel teksta tokom uređivanja: Ctrl+A, pa B iz panela (fokus ostaje u tekstu), pa Esc -> tekst podebljan', async () => {
      await samoTekst();
      dvoklik(50, 50);
      await fixture.whenStable();
      taster(uredjivac()!, 'a', { ctrlKey: true });
      const b = Array.from(el().querySelectorAll<HTMLButtonElement>('app-svojstva-teksta button'))
        .find((x) => x.getAttribute('aria-label') === 'Podebljano')!;
      expect(b.getAttribute('aria-pressed')).toBe('false');
      const pritisak = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
      b.dispatchEvent(pritisak);
      expect(pritisak.defaultPrevented).toBe(true);
      b.click();
      await fixture.whenStable();
      expect(b.getAttribute('aria-pressed')).toBe('true');
      expect(document.activeElement).toBe(uredjivac());
      taster(uredjivac()!, 'Escape');
      await fixture.whenStable();
      const t = store.platno().slojevi.find((s) => s.id === 'tekst') as TekstSloj;
      expect(t.pasusi.flatMap((p) => p.delovi).every((d) => d.podebljano)).toBe(true);
    });

    it('klik van sloja završava uređivanje (izlaz jednom), fokus je na okviru platna', async () => {
      await samoTekst();
      dvoklik(50, 50);
      await fixture.whenStable();
      const k = store.aktivniUredjivac()!;
      vi.spyOn(k, 'presek').mockReturnValueOnce({ pasusi: [pasusIz('Novo')], mapa: [0, null] });
      lazni.izmeniPlatno.mockClear();
      overlay().dispatchEvent(new MouseEvent('pointerdown', { clientX: 700, clientY: 400, button: 0, bubbles: true }));
      overlay().dispatchEvent(new MouseEvent('pointerup', { clientX: 700, clientY: 400, button: 0, bubbles: true }));
      await fixture.whenStable();
      expect(store.uredjivanje()).toBeNull();
      expect(uredjivac()).toBeNull();
      expect(lazni.izmeniPlatno).toHaveBeenCalledTimes(1);
      expect(document.activeElement).toBe(okvir());
      expect(el().querySelector('app-platno-prikaz [data-sloj="tekst"]')).not.toBeNull();
    });

    it('Esc u tekstu završava uređivanje i vraća fokus na okvir platna', async () => {
      await samoTekst();
      dvoklik(50, 50);
      await fixture.whenStable();
      taster(uredjivac()!, 'Escape');
      await fixture.whenStable();
      expect(store.uredjivanje()).toBeNull();
      expect(uredjivac()).toBeNull();
      expect(document.activeElement).toBe(okvir());
    });

    it('Fix 1/4: Enter (i F2) na okviru dok je sesija istog sloja otvorena vraća fokus u tekst', async () => {
      await samoTekst();
      dvoklik(50, 50);
      await fixture.whenStable();
      okvir().focus();
      expect(document.activeElement).toBe(okvir());
      taster(okvir(), 'Enter');
      expect(document.activeElement).toBe(uredjivac());
      okvir().focus();
      taster(okvir(), 'F2');
      expect(document.activeElement).toBe(uredjivac());
      expect(store.uredjivanje()?.slojId).toBe('tekst');
    });

    it('Fix 1/1: oblik iz trake tokom sesije zatvara uređivanje (panel, tab Slojevi, imaOtvoreno)', async () => {
      await samoTekst();
      dvoklik(50, 50);
      await fixture.whenStable();
      Array.from(el().querySelectorAll<HTMLButtonElement>('button')).find((b) => b.getAttribute('aria-label') === 'Oblik')!.click();
      await fixture.whenStable();
      Array.from(document.body.querySelectorAll<HTMLElement>('.mat-mdc-menu-item')).find((x) => x.textContent!.trim() === 'Elipsa')!.click();
      await fixture.whenStable();
      expect(store.uredjivanje()).toBeNull();
      expect(uredjivac()).toBeNull();
      expect(store.imaOtvoreno()).toBe(false);
      expect(tab('Slojevi').getAttribute('aria-disabled')).not.toBe('true');
      expect(el().querySelector('app-panel-svojstva')!.textContent).not.toContain('Uređuje se tekst');
      expect(document.activeElement).toBe(okvir());
    });

    it('tokom uređivanja: tab Slojevi je onemogućen, Svojstva ima "Završi uređivanje (Esc)" i napomenu', async () => {
      store.postaviTab('SLOJEVI');
      await samoTekst();
      dvoklik(50, 50);
      await fixture.whenStable();
      expect(store.tab()).toBe('SVOJSTVA');
      expect(tab('Slojevi').getAttribute('aria-disabled')).toBe('true');
      expect(el().querySelector('app-panel-svojstva')!.textContent).toContain('Završi uređivanje teksta (Esc).');
      const zavrsi = Array.from(el().querySelectorAll<HTMLButtonElement>('app-panel-svojstva button'))
        .find((b) => b.textContent!.includes('Završi uređivanje (Esc)'))!;
      zavrsi.click();
      await fixture.whenStable();
      expect(store.uredjivanje()).toBeNull();
      expect(tab('Slojevi').getAttribute('aria-disabled')).not.toBe('true');
      expect(document.activeElement).toBe(okvir());
    });

    it('uništavanje editora usred uređivanja: tekst ide u izlaz pre odjave', async () => {
      await samoTekst();
      dvoklik(50, 50);
      await fixture.whenStable();
      vi.spyOn(store.aktivniUredjivac()!, 'presek').mockReturnValueOnce({ pasusi: [pasusIz('Kraj')], mapa: [0, null] });
      lazni.izmeniPlatno.mockClear();
      fixture.destroy();
      expect(lazni.izmeniPlatno).toHaveBeenCalledTimes(1);
      expect(lazni.izmeniPlatno.mock.invocationCallOrder[0]).toBeLessThan(odjava.mock.invocationCallOrder[0]);
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
