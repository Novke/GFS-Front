import { ChangeDetectionStrategy, Component, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { OblikSloj, Platno, Sloj, TekstSloj } from '../data-access/platno.models';
import { noviOblik } from '../data-access/platno-novo';
import { pasus, platnoSaAnimacijama } from '../data-access/platno-podaci.testing';
import { NotificationStore } from '../../../core/state/notification.store';
import { FokusPlatna } from './fokus-platna';
import { krajeviLinije, ugaoIDuzina } from './geometrija';
import { PlatnoEditorStore } from './platno-editor.store';
import { PlatnoOverlayComponent } from './platno-overlay.component';
import { RASPORED_KADRA } from './po-kadru';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [PlatnoEditorStore, FokusPlatna],
  imports: [PlatnoOverlayComponent],
  template: `<div class="uz-ep-platno uz-okvir" tabindex="0"><div class="uz-platno"><app-platno-overlay /></div></div>`,
})
class DomacinComponent {}

function oblik(id: string, x: number, y: number, sirina: number, visina: number): OblikSloj {
  return { ...noviOblik(id, 'NACRT', 'PRAVOUGAONIK'), x, y, sirina, visina };
}
const prazanTekst = (id: string): TekstSloj => ({
  id, naziv: null, x: 500, y: 300, sirina: 200, visina: 60, rotacija: 0, providnost: 1, zakljucan: false, senka: null,
  tip: 'TEKST', pasusi: [pasus('')], popuna: null, ivica: null,
  okvir: { unutraLevo: 7.2, unutraGore: 3.6, unutraDesno: 7.2, unutraDole: 3.6, sidro: 'VRH', prelom: true, skala: 1, skalaProreda: 1 },
});

/** A (10, 10, 200, 100), B (300, 50, 100, 100), C (800, 400, 100, 100), prazan tekst P (500, 300). */
const dok = (): Platno => platnoSaAnimacijama([], [
  oblik('A', 10, 10, 200, 100), oblik('B', 300, 50, 100, 100), oblik('C', 800, 400, 100, 100), prazanTekst('P'),
] as Sloj[]);

/** Lažan raspored kadrova: pamti zakazane funkcije, sam ne zove ništa (test zove `kadar()`). */
function lazniKadrovi() {
  const zakazani = new Map<number, () => void>();
  let sledeci = 1;
  return {
    zakazi(f: () => void): number {
      const id = sledeci++;
      zakazani.set(id, f);
      return id;
    },
    otkazi(id: number): void {
      zakazani.delete(id);
    },
    kadar(): void {
      const f = [...zakazani.values()];
      zakazani.clear();
      f.forEach((x) => x());
    },
  };
}

interface Tasteri { shift?: boolean; alt?: boolean; ctrl?: boolean; pointerId?: number; }

describe('PlatnoOverlayComponent', () => {
  let fixture: ComponentFixture<DomacinComponent>;
  let store: InstanceType<typeof PlatnoEditorStore>;
  let izlaz: ReturnType<typeof vi.fn<(p: Platno) => void>>;
  let kadrovi: ReturnType<typeof lazniKadrovi>;
  let obavestenja: { greska: ReturnType<typeof vi.fn>; uspeh: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn> };
  const el = () => fixture.nativeElement as HTMLElement;
  const overlay = () => el().querySelector<HTMLElement>('app-platno-overlay')!;
  const okvir = () => el().querySelector<HTMLElement>('.uz-ep-platno')!;
  const rucka = (ime: string) => el().querySelector<HTMLElement>(`[data-rucka="${ime}"]`);
  const dogadjaj = (cilj: HTMLElement, tip: string, x: number, y: number, t: Tasteri | boolean = {}) => {
    const { shift = false, alt = false, ctrl = false, pointerId } = typeof t === 'boolean' ? { shift: t } : t;
    const e = new MouseEvent(tip, {
      clientX: x, clientY: y, button: 0, buttons: tip === 'pointerup' ? 0 : 1, shiftKey: shift, altKey: alt, ctrlKey: ctrl,
      bubbles: true,
    });
    // jsdom nema PointerEvent: `pointerId` se dodaje ručno (bez njega overlay ne zove setPointerCapture)
    if (pointerId !== undefined) Object.defineProperty(e, 'pointerId', { value: pointerId });
    cilj.dispatchEvent(e);
  };
  const pokazivac = (tip: string, x: number, y: number, t: Tasteri | boolean = {}) => dogadjaj(overlay(), tip, x, y, t);
  const klik = (x: number, y: number, shift = false) => {
    pokazivac('pointerdown', x, y, shift);
    pokazivac('pointerup', x, y, shift);
  };
  /** Prevlačenje od (x1, y1) do (x2, y2) kroz `koraka` pokreta; bez pointerup. */
  const vuci = (x1: number, y1: number, x2: number, y2: number, t: Tasteri = {}, koraka = 4, cilj = overlay()) => {
    dogadjaj(cilj, 'pointerdown', x1, y1, t);
    for (let i = 1; i <= koraka; i++) pokazivac('pointermove', x1 + ((x2 - x1) * i) / koraka, y1 + ((y2 - y1) * i) / koraka, t);
  };
  const prevuci = (x1: number, y1: number, x2: number, y2: number, t: Tasteri = {}, cilj = overlay()) => {
    vuci(x1, y1, x2, y2, t, 4, cilj);
    pokazivac('pointerup', x2, y2, t);
  };
  const sloj = (id: string) => store.platno().slojevi.find((s) => s.id === id)!;
  async function pocni(p: Platno) {
    store.inicijalizuj(p);
    await fixture.whenStable();
  }

  beforeEach(async () => {
    kadrovi = lazniKadrovi();
    obavestenja = { greska: vi.fn(), uspeh: vi.fn(), info: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(), { provide: RASPORED_KADRA, useValue: kadrovi },
        { provide: NotificationStore, useValue: obavestenja },
      ],
    });
    fixture = TestBed.createComponent(DomacinComponent);
    await fixture.whenStable();
    store = fixture.debugElement.children[0].injector.get(PlatnoEditorStore);
    izlaz = vi.fn<(p: Platno) => void>();
    store.postaviIzlaz(izlaz);
    fixture.debugElement.children[0].injector.get(FokusPlatna).postavi(okvir());
    // 960 x 540 px: 1 px = 1 jedinica platna
    const platnoEl = el().querySelector<HTMLElement>('.uz-platno')!;
    vi.spyOn(platnoEl, 'getBoundingClientRect').mockReturnValue(
      { left: 0, top: 0, x: 0, y: 0, width: 960, height: 540, right: 960, bottom: 540, toJSON: () => ({}) } as DOMRect);
    await pocni(dok());
  });

  afterEach(() => vi.restoreAllMocks());

  it('klik na sloj ga bira, a okvir platna dobija fokus', async () => {
    klik(60, 60);
    expect(store.izbor()).toEqual(['A']);
    expect(document.activeElement).toBe(okvir());
    await fixture.whenStable();
    const okviri = el().querySelectorAll<HTMLElement>('.uz-ep-izbor');
    expect(okviri).toHaveLength(1);
    expect(okviri[0].style.left).toBe('calc(var(--u) * 10)');
    expect(okviri[0].style.width).toBe('calc(var(--u) * 200)');
  });

  it('Shift+klik na drugi sloj ga dodaje izboru (oba okvira i isprekidan obuhvat)', async () => {
    klik(60, 60);
    klik(350, 100, true);
    expect(store.izbor()).toEqual(['A', 'B']);
    await fixture.whenStable();
    expect(el().querySelectorAll('.uz-ep-izbor')).toHaveLength(2);
    const obuhvat = el().querySelector<HTMLElement>('.uz-ep-obuhvat')!;
    expect(obuhvat.style.left).toBe('calc(var(--u) * 10)');
    expect(obuhvat.style.width).toBe('calc(var(--u) * 390)');
  });

  it('klik u prazno poništava izbor; uz Shift izbor ostaje', () => {
    klik(60, 60);
    klik(600, 20, true);
    expect(store.izbor()).toEqual(['A']);
    klik(600, 20);
    expect(store.izbor()).toEqual([]);
  });

  it('prevlačenje po praznom od (0, 0) do (700, 300) bira slojeve cele u pravougaoniku', async () => {
    pokazivac('pointerdown', 0, 0);
    pokazivac('pointermove', 350, 150);
    await fixture.whenStable();
    expect(el().querySelector('.uz-ep-pravougaonik')).not.toBeNull();
    pokazivac('pointermove', 700, 300);
    pokazivac('pointerup', 700, 300);
    expect(store.izbor()).toEqual(['A', 'B']);
    await fixture.whenStable();
    expect(el().querySelector('.uz-ep-pravougaonik')).toBeNull();
  });

  it('pravougaonik uz Shift dodaje izboru', () => {
    klik(850, 450);
    pokazivac('pointerdown', 0, 0, true);
    pokazivac('pointermove', 700, 300, true);
    pokazivac('pointerup', 700, 300, true);
    expect(store.izbor()).toEqual(['C', 'A', 'B']);
  });

  it('pomeraj od 2 px se računa kao klik', () => {
    pokazivac('pointerdown', 60, 60);
    pokazivac('pointermove', 62, 60);
    pokazivac('pointerup', 62, 60);
    expect(store.izbor()).toEqual(['A']);
  });

  it('prazan TEKST sloj ima isprekidan okvir sa natpisom "Dvoklik za tekst" (aria-hidden)', () => {
    const prazni = el().querySelectorAll<HTMLElement>('.uz-ep-prazan');
    expect(prazni).toHaveLength(1);
    expect(prazni[0].textContent!.trim()).toBe('Dvoklik za tekst');
    expect(overlay().getAttribute('aria-hidden')).toBe('true');
  });

  it('skriven sloj se ne pogađa klikom', () => {
    store.prebaciSkriven('A');
    klik(60, 60);
    expect(store.izbor()).toEqual([]);
  });
  describe('gestovi (F5)', () => {
    it('prevlačenje sloja za (+100, +50): bira ga na pointerdown, tokom gesta 0 emitovanja, posle pointerup 1 i jedan korak', async () => {
      pokazivac('pointerdown', 60, 60);
      expect(store.izbor()).toEqual(['A']);
      vuci(60, 60, 160, 110);
      kadrovi.kadar();
      expect(sloj('A').x).toBe(110);
      expect(izlaz).not.toHaveBeenCalled();
      expect(store.mozeNazad()).toBe(false);
      pokazivac('pointerup', 160, 110);
      expect(izlaz).toHaveBeenCalledTimes(1);
      expect(izlaz.mock.calls[0][0].slojevi[0]).toMatchObject({ id: 'A', x: 110, y: 60 });
      expect(store.mozeNazad()).toBe(true);
      expect(store.izbor()).toEqual(['A']);
      store.ponisti();
      expect(sloj('A')).toMatchObject({ x: 10, y: 10 });
      expect(store.mozeNazad()).toBe(false);
    });

    it('prevlačenje za (+2, 0) je klik: izbor, bez izmene i bez koraka', () => {
      prevuci(60, 60, 62, 60);
      expect(store.izbor()).toEqual(['A']);
      expect(sloj('A').x).toBe(10);
      expect(izlaz).not.toHaveBeenCalled();
      expect(store.mozeNazad()).toBe(false);
    });

    it('vođica: leva ivica prevučena na 477 prianja uz centar platna (x = 480) i crta se .uz-ep-vodjica', async () => {
      vuci(60, 60, 527, 60);
      kadrovi.kadar();
      await fixture.whenStable();
      expect(sloj('A').x).toBe(480);
      const v = el().querySelectorAll<HTMLElement>('.uz-ep-vodjica');
      expect(v).toHaveLength(1);
      expect(v[0].style.left).toBe('calc(var(--u) * 480)');
      pokazivac('pointerup', 527, 60);
      await fixture.whenStable();
      expect(izlaz.mock.calls[0][0].slojevi[0].x).toBe(480);
      expect(el().querySelector('.uz-ep-vodjica')).toBeNull();
    });

    it('uz Alt nema prianjanja: x = 477, bez vođice', async () => {
      vuci(60, 60, 527, 60, { alt: true });
      kadrovi.kadar();
      await fixture.whenStable();
      expect(el().querySelector('.uz-ep-vodjica')).toBeNull();
      pokazivac('pointerup', 527, 60, { alt: true });
      expect(sloj('A').x).toBe(477);
    });

    it('Shift ograničava na dominantnu osu: (+100, +20) -> (+100, 0)', () => {
      prevuci(60, 60, 160, 80, { shift: true });
      expect(sloj('A')).toMatchObject({ x: 110, y: 10 });
    });

    it('više izabranih se pomera zajedno; klik bez pomeraja na izabranom ostavlja samo njega', () => {
      klik(60, 60);
      klik(350, 100, true);
      prevuci(60, 60, 70, 70);
      expect(store.izbor()).toEqual(['A', 'B']);
      expect(sloj('A')).toMatchObject({ x: 20, y: 20 });
      expect(sloj('B')).toMatchObject({ x: 310, y: 60 });
      expect(izlaz).toHaveBeenCalledTimes(1);
      klik(70, 70);
      expect(store.izbor()).toEqual(['A']);
    });

    it('Shift+klik bez pomeraja na izabranom ga uklanja iz izbora (Shift+pritisak na neizabranom ga dodaje odmah)', () => {
      klik(60, 60);
      pokazivac('pointerdown', 350, 100, true);
      expect(store.izbor()).toEqual(['A', 'B']);
      pokazivac('pointerup', 350, 100, true);
      expect(store.izbor()).toEqual(['A', 'B']);
      klik(60, 60, true);
      expect(store.izbor()).toEqual(['B']);
    });

    it('ručke: 8 + rotacija za jedan izabran sloj; nema ih za dva izabrana', async () => {
      klik(60, 60);
      await fixture.whenStable();
      for (const r of ['SZ', 'S', 'SI', 'I', 'JI', 'J', 'JZ', 'Z', 'ROTACIJA']) expect(rucka(r)).not.toBeNull();
      expect(rucka('KRAJ_A')).toBeNull();
      expect(rucka('JI')!.style.cursor).toBe('nwse-resize');
      klik(350, 100, true);
      await fixture.whenStable();
      expect(el().querySelector('[data-rucka]')).toBeNull();
    });

    it('kursor ručke prati rotaciju sloja (90°: ručka I je ns-resize)', async () => {
      await pocni(platnoSaAnimacijama([], [{ ...oblik('A', 10, 10, 200, 100), rotacija: 90 }]));
      klik(110, 60);
      await fixture.whenStable();
      expect(rucka('I')!.style.cursor).toBe('ns-resize');
      expect(rucka('S')!.style.cursor).toBe('ew-resize');
    });

    it('ručka JI prevučena za (+50, +50) -> 250 x 150; uz Shift odnos 2:1 ostaje; tokom gesta bez emitovanja', async () => {
      klik(60, 60);
      await fixture.whenStable();
      vuci(210, 110, 260, 160, {}, 4, rucka('JI')!);
      kadrovi.kadar();
      expect(izlaz).not.toHaveBeenCalled();
      pokazivac('pointerup', 260, 160);
      expect(sloj('A')).toMatchObject({ x: 10, y: 10, sirina: 250, visina: 150 });
      expect(izlaz).toHaveBeenCalledTimes(1);
      store.ponisti();
      await fixture.whenStable();
      prevuci(210, 110, 260, 160, { shift: true }, rucka('JI')!);
      const a = sloj('A');
      expect(a.sirina / a.visina).toBeCloseTo(2, 5);
      expect(a.sirina).toBe(300);
    });

    it('ručka I prevučena preko leve ivice (Review Focus 4): kutija levo od sidra, širina > 0, sidro (x = 10) na mestu', async () => {
      klik(60, 60);
      await fixture.whenStable();
      prevuci(210, 60, -50, 60, {}, rucka('I')!);
      const a = sloj('A');
      expect(a.sirina).toBeGreaterThan(0);
      expect(a.x + a.sirina).toBeCloseTo(10, 5);
      expect(a.x).toBe(-50);
      expect(a).toMatchObject({ y: 10, visina: 100 });
    });

    it('Ctrl na ručki menja veličinu oko centra', async () => {
      klik(60, 60);
      await fixture.whenStable();
      prevuci(210, 110, 220, 120, { ctrl: true }, rucka('JI')!);
      expect(sloj('A')).toMatchObject({ x: 0, y: 0, sirina: 220, visina: 120 });
    });

    it('rotacija: pokazivač desno od centra -> 90; uz Shift na 47° -> 45', async () => {
      klik(60, 60);
      await fixture.whenStable();
      // centar (110, 60), ručka rotacije 20 px iznad gornje ivice: (110, -10)
      prevuci(110, -10, 300, 60, {}, rucka('ROTACIJA')!);
      expect(sloj('A').rotacija).toBe(90);
      expect(sloj('A')).toMatchObject({ x: 10, y: 10, sirina: 200, visina: 100 });
      store.ponisti();
      await fixture.whenStable();
      const u = (47 - 90) * (Math.PI / 180);
      const t = { x: 110 + 100 * Math.cos(u), y: 60 + 100 * Math.sin(u) };
      prevuci(110, -10, t.x, t.y, { shift: true }, rucka('ROTACIJA')!);
      expect(sloj('A').rotacija).toBe(45);
      store.ponisti();
      await fixture.whenStable();
      prevuci(110, -10, t.x, t.y, {}, rucka('ROTACIJA')!);
      expect(sloj('A').rotacija).toBe(47);
    });

    it('linija: krajevi KRAJ_A i KRAJ_B (bez 8 ručki); prevučen kraj -> rotacija 0, drugi kraj na mestu, novi od/do', async () => {
      const linija: OblikSloj = { ...noviOblik('L', 'NACRT', 'LINIJA'), rotacija: 30 };   // 360, 258, 240 x 24
      await pocni(platnoSaAnimacijama([], [linija]));
      const [a0, b0] = krajeviLinije(linija);
      klik(480, 270);
      await fixture.whenStable();
      expect(store.izbor()).toEqual(['L']);
      expect(rucka('JI')).toBeNull();
      expect(rucka('ROTACIJA')).toBeNull();
      expect(rucka('KRAJ_A')).not.toBeNull();
      prevuci(b0.x, b0.y, 600, 370, {}, rucka('KRAJ_B')!);
      const l = sloj('L') as OblikSloj;
      expect(l.rotacija).toBe(0);
      const [a, b] = krajeviLinije(l);
      expect(a.x).toBeCloseTo(a0.x, 1);
      expect(a.y).toBeCloseTo(a0.y, 1);
      expect(b.x).toBeCloseTo(600, 1);
      expect(b.y).toBeCloseTo(370, 1);
      expect(l.od).not.toEqual(linija.od);
      expect(izlaz).toHaveBeenCalledTimes(1);
    });

    it('linija uz Shift: ugao kraja drži na 45°', async () => {
      const linija: OblikSloj = noviOblik('L', 'NACRT', 'LINIJA');   // krajevi (360, 270) i (600, 270)
      await pocni(platnoSaAnimacijama([], [linija]));
      klik(480, 270);
      await fixture.whenStable();
      // ugao ~40° od kraja A
      prevuci(600, 270, 360 + 200 * Math.cos(0.7), 270 + 200 * Math.sin(0.7), { shift: true }, rucka('KRAJ_B')!);
      const [a, b] = krajeviLinije(sloj('L') as OblikSloj);
      expect(a.x).toBeCloseTo(360, 1);
      expect(a.y).toBeCloseTo(270, 1);
      expect(ugaoIDuzina(a, b).ugao).toBeCloseTo(45, 0);
    });

    it('Esc usred prevlačenja: dokument kao pre, bez emitovanja, mozeNazad false, izbor isti; Esc ne stiže do okvira', async () => {
      const pre = store.platno();
      const naOkviru = vi.fn();
      okvir().addEventListener('keydown', naOkviru);
      vuci(60, 60, 160, 110);
      kadrovi.kadar();
      expect(sloj('A').x).toBe(110);
      okvir().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(naOkviru).not.toHaveBeenCalled();
      expect(store.platno()).toBe(pre);
      expect(store.gest()).toBeNull();
      pokazivac('pointermove', 200, 150);
      kadrovi.kadar();
      pokazivac('pointerup', 200, 150);
      expect(store.platno()).toBe(pre);
      expect(izlaz).not.toHaveBeenCalled();
      expect(store.mozeNazad()).toBe(false);
      expect(store.izbor()).toEqual(['A']);
      // posle gesta Esc opet ide okviru (osluškivač je skinut)
      okvir().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(naOkviru).toHaveBeenCalledTimes(1);
    });

    it('pointercancel usred gesta vraća početak bez koraka', () => {
      const pre = store.platno();
      vuci(60, 60, 160, 110);
      kadrovi.kadar();
      pokazivac('pointercancel', 160, 110);
      expect(store.platno()).toBe(pre);
      expect(store.gest()).toBeNull();
      expect(store.mozeNazad()).toBe(false);
      expect(izlaz).not.toHaveBeenCalled();
    });

    it('Ctrl+Z usred gesta ne ostavlja polovičan dokument: gest teče dalje, na kraju jedan korak', () => {
      const pre = store.platno();
      vuci(60, 60, 110, 60);
      kadrovi.kadar();
      const tokom = store.platno();
      store.ponisti();
      expect(store.platno()).toBe(tokom);
      pokazivac('pointermove', 160, 110);
      pokazivac('pointerup', 160, 110);
      expect(sloj('A')).toMatchObject({ x: 110, y: 60 });
      expect(izlaz).toHaveBeenCalledTimes(1);
      store.ponisti();
      expect(store.platno()).toBe(pre);
    });

    it('pražnjenje (Ctrl+S) usred gesta upisuje gest; dalji pokreti istog pritiska ne menjaju dokument', () => {
      vuci(60, 60, 110, 60);
      kadrovi.kadar();
      store.isprazni();
      expect(izlaz).toHaveBeenCalledTimes(1);
      expect(sloj('A').x).toBe(60);
      pokazivac('pointermove', 300, 300);
      kadrovi.kadar();
      pokazivac('pointerup', 300, 300);
      expect(sloj('A').x).toBe(60);
      expect(izlaz).toHaveBeenCalledTimes(1);
    });

    it('zaključan sloj: klik ga bira; prevlačenje sa njega crta pravougaonik izbora i ne pomera ga; nema ručki, ima katanac', async () => {
      await pocni(platnoSaAnimacijama([], [{ ...oblik('A', 10, 10, 200, 100), zakljucan: true }]));
      klik(60, 60);
      expect(store.izbor()).toEqual(['A']);
      await fixture.whenStable();
      expect(el().querySelector('[data-rucka]')).toBeNull();
      expect(el().querySelector('.uz-ep-katanac')).not.toBeNull();
      vuci(60, 60, 160, 110);
      await fixture.whenStable();
      expect(el().querySelector('.uz-ep-pravougaonik')).not.toBeNull();
      expect(store.gest()).toBeNull();
      pokazivac('pointerup', 160, 110);
      expect(sloj('A').x).toBe(10);
      expect(store.izbor()).toEqual([]);   // pravougaonik (60, 60)-(160, 110) ne obuhvata ceo A
      expect(izlaz).not.toHaveBeenCalled();
      expect(obavestenja.greska).not.toHaveBeenCalled();
    });

    describe('zaključana pozadina preko celog platna', () => {
      /** Z (0, 0, 960 x 540, zaključan, na dnu), A (10, 10, 200, 100), B (300, 50, 100, 100). */
      const saPozadinom = () => platnoSaAnimacijama([], [
        { ...oblik('Z', 0, 0, 960, 540), zakljucan: true }, oblik('A', 10, 10, 200, 100), oblik('B', 300, 50, 100, 100),
      ] as Sloj[]);

      it('prevlačenje sa nje bira slojeve unutar pravougaonika, dokument se ne menja (i kad je ona sama izabrana)', async () => {
        await pocni(saPozadinom());
        const pre = store.platno();
        prevuci(5, 5, 450, 200);
        expect(store.izbor()).toEqual(['A', 'B']);
        klik(900, 500);
        expect(store.izbor()).toEqual(['Z']);
        prevuci(900, 500, 250, 20);
        expect(store.izbor()).toEqual(['B']);
        expect(store.platno()).toBe(pre);
        expect(izlaz).not.toHaveBeenCalled();
        expect(store.mozeNazad()).toBe(false);
        expect(obavestenja.greska).not.toHaveBeenCalled();
      });

      it('mešan izbor (A + zaključana Z): prevlačenje ne pomera ništa, poruka tačno jednom po pritisku, bez koraka', async () => {
        await pocni(saPozadinom());
        klik(60, 60);
        klik(900, 500, true);
        expect(store.izbor()).toEqual(['A', 'Z']);
        const pre = store.platno();
        vuci(60, 60, 200, 150, {}, 8);
        kadrovi.kadar();
        pokazivac('pointerup', 200, 150);
        expect(obavestenja.greska).toHaveBeenCalledTimes(1);
        expect(obavestenja.greska).toHaveBeenCalledWith('Sloj je zaključan.');
        // pritisak na zaključanu Z koja je u izboru uz otključan A: isto pravilo (b), nov pritisak = nova poruka
        prevuci(900, 500, 800, 400);
        expect(obavestenja.greska).toHaveBeenCalledTimes(2);
        expect(store.platno()).toBe(pre);
        expect(store.gest()).toBeNull();
        expect(izlaz).not.toHaveBeenCalled();
        expect(store.mozeNazad()).toBe(false);
        expect(store.izbor()).toEqual(['A', 'Z']);
        expect(el().querySelector('.uz-ep-pravougaonik')).toBeNull();
      });
    });

    it('ručka sloja koji se zaključa posle pritiska: poruka jednom, bez gesta (sloj se čita na pragu)', async () => {
      klik(60, 60);
      await fixture.whenStable();
      const ji = rucka('JI')!;
      dogadjaj(ji, 'pointerdown', 210, 110);
      store.zakljucaj('A', true);
      const posleZakljucavanja = store.platno();
      for (let i = 1; i <= 5; i++) pokazivac('pointermove', 210 + 10 * i, 110 + 10 * i);
      kadrovi.kadar();
      pokazivac('pointerup', 260, 160);
      expect(obavestenja.greska).toHaveBeenCalledTimes(1);
      expect(store.platno()).toBe(posleZakljucavanja);
      expect(sloj('A')).toMatchObject({ sirina: 200, visina: 100 });
    });

    it('ručka: sloj se uzima iz dokumenta na pragu, ne sa pritiska (Minor 3)', async () => {
      klik(60, 60);
      await fixture.whenStable();
      const ji = rucka('JI')!;
      dogadjaj(ji, 'pointerdown', 210, 110);
      store.pomeriIzabrane(5, 0);   // dokument se menja pre praga (A: x = 15)
      for (let i = 1; i <= 5; i++) pokazivac('pointermove', 210 + 10 * i, 110 + 10 * i);
      pokazivac('pointerup', 260, 160);
      expect(sloj('A')).toMatchObject({ x: 15, y: 10, sirina: 250, visina: 150 });
    });

    it('miš i strelice daju isti rezultat i sa skrivenim izabranim slojem (Minor 2)', async () => {
      store.prebaciSkriven('B');
      store.izaberi(['A', 'B']);
      await fixture.whenStable();
      expect(el().querySelector('[data-rucka]')).toBeNull();   // izabrana su dva sloja (jedan skriven)
      prevuci(60, 60, 70, 70);
      const mis = store.platno();
      store.ponisti();
      store.pomeriIzabrane(10, 0);
      store.pomeriIzabrane(0, 10);
      expect(store.platno().slojevi.map((s) => [s.x, s.y])).toEqual(mis.slojevi.map((s) => [s.x, s.y]));
      expect(sloj('B')).toMatchObject({ x: 310, y: 60 });
    });

    it('skriven zaključan sloj u izboru: miš ne pomera ništa i javlja poruku, kao strelice', async () => {
      await pocni(platnoSaAnimacijama([], [oblik('A', 10, 10, 200, 100), { ...oblik('B', 300, 50, 100, 100), zakljucan: true }]));
      store.prebaciSkriven('B');
      store.izaberi(['A', 'B']);
      const pre = store.platno();
      prevuci(60, 60, 160, 110);
      expect(store.platno()).toBe(pre);
      expect(obavestenja.greska).toHaveBeenCalledTimes(1);
      store.pomeriIzabrane(1, 0);
      expect(obavestenja.greska).toHaveBeenCalledTimes(2);
      expect(store.platno()).toBe(pre);
    });

    it('drugi pokazivač usred gesta ne prekida i ne počinje gest; njegovi pokreti se ignorišu (Minor 1)', () => {
      vuci(60, 60, 110, 60, { pointerId: 1 });
      dogadjaj(overlay(), 'pointerdown', 850, 450, { pointerId: 2 });
      expect(store.izbor()).toEqual(['A']);
      expect(store.gest()).not.toBeNull();
      pokazivac('pointermove', 900, 500, { pointerId: 2 });
      pokazivac('pointerup', 900, 500, { pointerId: 2 });
      pokazivac('pointercancel', 900, 500, { pointerId: 2 });
      overlay().dispatchEvent(Object.defineProperty(new MouseEvent('lostpointercapture'), 'pointerId', { value: 2 }));
      expect(store.gest()).not.toBeNull();
      pokazivac('pointermove', 160, 110, { pointerId: 1 });
      pokazivac('pointerup', 160, 110, { pointerId: 1 });
      expect(store.gest()).toBeNull();
      expect(sloj('A')).toMatchObject({ x: 110, y: 60 });
      expect(sloj('C')).toMatchObject({ x: 800, y: 400 });
      expect(izlaz).toHaveBeenCalledTimes(1);
      expect(store.izbor()).toEqual(['A']);
    });

    it('lostpointercapture bez pointerup prekida gest kao pointercancel (Minor 6)', () => {
      const pre = store.platno();
      vuci(60, 60, 160, 110, { pointerId: 1 });
      kadrovi.kadar();
      expect(sloj('A').x).toBe(110);
      overlay().dispatchEvent(Object.defineProperty(new MouseEvent('lostpointercapture'), 'pointerId', { value: 1 }));
      expect(store.platno()).toBe(pre);
      expect(store.gest()).toBeNull();
      expect(store.imaOtvoreno()).toBe(false);
      pokazivac('pointerup', 160, 110, { pointerId: 1 });
      expect(store.platno()).toBe(pre);
      expect(izlaz).not.toHaveBeenCalled();
      expect(store.mozeNazad()).toBe(false);
    });

    it('300 slojeva (odluka 33): 60 pokreta bez kadra -> 0 izmena; kadar -> 1; pointerup odmah -> tačan kraj, jedan korak', async () => {
      const slojevi: Sloj[] = Array.from({ length: 300 }, (_, i) =>
        ({ ...noviOblik(`s${i + 1}`, 'NACRT', 'PRAVOUGAONIK'), x: (i % 30) * 31, y: Math.floor(i / 30) * 50, sirina: 20, visina: 20 }));
      await pocni(platnoSaAnimacijama([], slojevi));
      const pocetak = store.platno();
      const izmene: Platno[] = [];
      const azuriraj = store.azurirajGest.bind(store);
      vi.spyOn(store, 'azurirajGest').mockImplementation((f) => {
        azuriraj(f);
        izmene.push(store.platno());
      });
      // s1 (0, 0, 20 x 20): pritisak u (10, 10), 30 pokreta do (110, 10)
      vuci(10, 10, 110, 10, { alt: true }, 30);
      expect(izmene).toHaveLength(0);
      expect(store.platno()).toBe(pocetak);
      kadrovi.kadar();
      expect(izmene).toHaveLength(1);
      expect(sloj('s1').x).toBe(100);
      // još 30 pokreta do (210, 10), pa pointerup bez kadra: poslednji pokret nije izgubljen
      for (let i = 1; i <= 30; i++) pokazivac('pointermove', 110 + (100 * i) / 30, 10, { alt: true });
      expect(izmene).toHaveLength(1);
      pokazivac('pointerup', 210, 10, { alt: true });
      expect(izmene).toHaveLength(2);
      expect(sloj('s1').x).toBe(200);
      expect(izlaz).toHaveBeenCalledTimes(1);
      store.ponisti();
      expect(store.platno()).toBe(pocetak);
      expect(store.mozeNazad()).toBe(false);
    });
  });
});
