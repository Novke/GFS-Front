import { ChangeDetectionStrategy, Component, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { OblikSloj, Platno, Sloj, TekstSloj } from '../data-access/platno.models';
import { noviOblik } from '../data-access/platno-novo';
import { pasus, platnoSaAnimacijama } from '../data-access/platno-podaci.testing';
import { FokusPlatna } from './fokus-platna';
import { PlatnoEditorStore } from './platno-editor.store';
import { PlatnoOverlayComponent } from './platno-overlay.component';

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

describe('PlatnoOverlayComponent', () => {
  let fixture: ComponentFixture<DomacinComponent>;
  let store: InstanceType<typeof PlatnoEditorStore>;
  const el = () => fixture.nativeElement as HTMLElement;
  const overlay = () => el().querySelector<HTMLElement>('app-platno-overlay')!;
  const okvir = () => el().querySelector<HTMLElement>('.uz-ep-platno')!;
  const pokazivac = (tip: string, x: number, y: number, shiftKey = false) =>
    overlay().dispatchEvent(new MouseEvent(tip, { clientX: x, clientY: y, button: 0, buttons: tip === 'pointerup' ? 0 : 1, shiftKey, bubbles: true }));
  const klik = (x: number, y: number, shift = false) => {
    pokazivac('pointerdown', x, y, shift);
    pokazivac('pointerup', x, y, shift);
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(DomacinComponent);
    await fixture.whenStable();
    store = fixture.debugElement.children[0].injector.get(PlatnoEditorStore);
    fixture.debugElement.children[0].injector.get(FokusPlatna).postavi(okvir());
    // 960 x 540 px: 1 px = 1 jedinica platna
    const platnoEl = el().querySelector<HTMLElement>('.uz-platno')!;
    vi.spyOn(platnoEl, 'getBoundingClientRect').mockReturnValue(
      { left: 0, top: 0, x: 0, y: 0, width: 960, height: 540, right: 960, bottom: 540, toJSON: () => ({}) } as DOMRect);
    store.inicijalizuj(dok());
    await fixture.whenStable();
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
});
