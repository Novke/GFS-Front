import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { OblikSloj, Platno } from '../data-access/platno.models';
import { noviOblik } from '../data-access/platno-novo';
import { platnoSaAnimacijama } from '../data-access/platno-podaci.testing';
import { procitajBroj } from './brojcano-polje';
import { PlatnoEditorStore } from './platno-editor.store';
import { SvojstvaSlojaComponent } from './svojstva-sloja.component';
import { type LazniSat, dugme, oznakePolja, polje, provajderiSvojstava, upisi } from './svojstva.testing';

describe('procitajBroj', () => {
  it.each([
    ['12,5', 0, 100, 12.5],
    ['12.5', 0, 100, 12.5],
    ['  7 ', 0, 100, 7],
    ['-3,25', -10, 10, -3.25],
    ['1e3', 0, 5000, null],
    ['150', 0, 100, 100],
    ['-5', 0, 100, 0],
    ['', 0, 100, null],
    ['   ', 0, 100, null],
    ['abc', 0, 100, null],
    ['1,2,3', 0, 100, null],
    ['3.14159', 0, 100, 3.14],
    ['2,675', 0, 100, 2.68],
    ['Infinity', 0, 100, null],
  ])('%j u [%d, %d] -> %j', (tekst, min, max, ocekivano) => {
    expect(procitajBroj(tekst, min, max)).toBe(ocekivano);
  });

  it.each([
    ['401', null], ['0', null], ['0,5', null], ['400', 400], ['1', 1], ['12,345', 12.35],
  ])('bez stezanja (veličina slova, F13): %j u [1, 400] -> %j', (tekst, ocekivano) => {
    expect(procitajBroj(tekst, 1, 400, false)).toBe(ocekivano);
  });
});

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [PlatnoEditorStore],
  imports: [SvojstvaSlojaComponent],
  template: `<app-svojstva-sloja tema="NACRT" />`,
})
class DomacinComponent {}

function oblik(id: string, deo: Partial<OblikSloj> = {}): OblikSloj {
  return { ...noviOblik(id, 'NACRT', 'PRAVOUGAONIK'), x: 100, y: 50, sirina: 200, visina: 100, ...deo };
}

describe('SvojstvaSlojaComponent', () => {
  let fixture: ComponentFixture<DomacinComponent>;
  let store: PlatnoEditorStore;
  let izlaz: ReturnType<typeof vi.fn<(p: Platno) => void>>;
  const sat: LazniSat = { t: 0 };
  const el = () => fixture.nativeElement as HTMLElement;
  const sloj = (id: string) => store.platno().slojevi.find((s) => s.id === id)!;

  async function pocni(slojevi: Platno['slojevi'], izbor: string[]) {
    store.inicijalizuj(platnoSaAnimacijama([], slojevi));
    store.izaberi(izbor);
    await fixture.whenStable();
  }

  beforeEach(() => {
    sat.t = 0;
    TestBed.configureTestingModule({ providers: provajderiSvojstava(sat) });
    fixture = TestBed.createComponent(DomacinComponent);
    store = fixture.debugElement.children[0].injector.get(PlatnoEditorStore);
    izlaz = vi.fn<(p: Platno) => void>();
    store.postaviIzlaz(izlaz);
  });

  it('jedan izabran sloj: polja pokazuju položaj, veličinu, rotaciju i providnost (u %)', async () => {
    await pocni([oblik('s1', { x: 12.5, rotacija: 30, providnost: 0.75 })], ['s1']);
    expect(oznakePolja(el())).toEqual(['X', 'Y', 'Širina', 'Visina', 'Rotacija', 'Providnost']);
    expect(polje(el(), 'X')!.value).toBe('12,5');
    expect(polje(el(), 'Y')!.value).toBe('50');
    expect(polje(el(), 'Širina')!.value).toBe('200');
    expect(polje(el(), 'Visina')!.value).toBe('100');
    expect(polje(el(), 'Rotacija')!.value).toBe('30');
    expect(polje(el(), 'Providnost')!.value).toBe('75');
  });

  it('"Širina" 250 + Enter: postaviKutiju sa širinom 250, jedan korak i jedna predaja', async () => {
    await pocni([oblik('s1')], ['s1']);
    await upisi(fixture, polje(el(), 'Širina')!, '250');
    expect(sloj('s1')).toMatchObject({ x: 100, y: 50, sirina: 250, visina: 100 });
    expect(izlaz).toHaveBeenCalledTimes(1);
    expect(store.mozeNazad()).toBe(true);
    store.ponisti();
    expect(sloj('s1').sirina).toBe(200);
    expect(store.mozeNazad()).toBe(false);
  });

  it('izlazak iz polja (blur) primenjuje kao Enter; Enter pa blur je jedna izmena', async () => {
    await pocni([oblik('s1')], ['s1']);
    await upisi(fixture, polje(el(), 'X')!, '40', 'blur');
    expect(sloj('s1').x).toBe(40);
    await upisi(fixture, polje(el(), 'Y')!, '60');
    polje(el(), 'Y')!.dispatchEvent(new FocusEvent('blur'));
    await fixture.whenStable();
    expect(sloj('s1').y).toBe(60);
    expect(izlaz).toHaveBeenCalledTimes(2);
  });

  it('dva upisa u isto polje u roku od 1 s su jedan korak istorije; posle 1 s nov korak', async () => {
    await pocni([oblik('s1')], ['s1']);
    await upisi(fixture, polje(el(), 'Širina')!, '250');
    sat.t = 500;
    await upisi(fixture, polje(el(), 'Širina')!, '300');
    expect(sloj('s1').sirina).toBe(300);
    store.ponisti();
    expect(sloj('s1').sirina).toBe(200);
    expect(store.mozeNazad()).toBe(false);

    store.ponovi();
    sat.t = 5000;
    await fixture.whenStable();
    await upisi(fixture, polje(el(), 'Širina')!, '320');
    store.ponisti();
    expect(sloj('s1').sirina).toBe(300);
  });

  it('neispravan unos: aria-invalid dok se kuca, a Enter vraća prikazanu vrednost bez izmene', async () => {
    await pocni([oblik('s1')], ['s1']);
    const x = polje(el(), 'X')!;
    x.value = '12abc';
    x.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
    expect(x.getAttribute('aria-invalid')).toBe('true');
    x.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await fixture.whenStable();
    expect(x.value).toBe('100');
    expect(x.getAttribute('aria-invalid')).toBe('false');
    expect(izlaz).not.toHaveBeenCalled();
  });

  it('vrednost van granica se steže (Širina 5000 -> 2880), rotacija u [0, 360)', async () => {
    await pocni([oblik('s1')], ['s1']);
    await upisi(fixture, polje(el(), 'Širina')!, '5000');
    expect(sloj('s1').sirina).toBe(2880);
    expect(polje(el(), 'Širina')!.value).toBe('2880');
    await upisi(fixture, polje(el(), 'Rotacija')!, '-90');
    expect(sloj('s1').rotacija).toBe(270);
    await upisi(fixture, polje(el(), 'Rotacija')!, '360');
    expect(sloj('s1').rotacija).toBe(0);
  });

  it('"Providnost" 50 -> 0.5', async () => {
    await pocni([oblik('s1')], ['s1']);
    await upisi(fixture, polje(el(), 'Providnost')!, '50');
    expect(sloj('s1').providnost).toBe(0.5);
  });

  it('dva izabrana: vidljivi samo X, Y (obuhvat) i Providnost; X + 10 pomera oba', async () => {
    await pocni([oblik('s1', { x: 100, y: 50 }), oblik('s2', { x: 300, y: 20 })], ['s1', 's2']);
    expect(oznakePolja(el())).toEqual(['X', 'Y', 'Providnost']);
    expect(polje(el(), 'X')!.value).toBe('100');
    expect(polje(el(), 'Y')!.value).toBe('20');
    await upisi(fixture, polje(el(), 'X')!, '110');
    expect(sloj('s1').x).toBe(110);
    expect(sloj('s2').x).toBe(310);
    expect(sloj('s1').y).toBe(50);
    expect(izlaz).toHaveBeenCalledTimes(1);
    await upisi(fixture, polje(el(), 'Providnost')!, '40');
    expect(sloj('s1').providnost).toBe(0.4);
    expect(sloj('s2').providnost).toBe(0.4);
  });

  it('zaključan sloj: sva polja disabled, jedino dugme "Otključaj" otključava', async () => {
    await pocni([oblik('s1', { zakljucan: true })], ['s1']);
    const polja = Array.from(el().querySelectorAll<HTMLInputElement>('input'));
    expect(polja.length).toBeGreaterThan(0);
    for (const p of polja) expect(p.disabled).toBe(true);
    const dugmad = Array.from(el().querySelectorAll<HTMLButtonElement>('button')).filter((b) => !b.disabled);
    expect(dugmad.map((b) => b.textContent!.trim())).toEqual(['Otključaj']);
    expect(el().textContent).toContain('Sloj je zaključan.');
    dugme(el(), 'Otključaj')!.click();
    await fixture.whenStable();
    expect(sloj('s1').zakljucan).toBe(false);
    expect(polje(el(), 'X')!.disabled).toBe(false);
  });

  it('Senka: uključena -> podrazumevane vrednosti, polja senke menjaju senku, isključena -> null', async () => {
    await pocni([oblik('s1')], ['s1']);
    const prekidac = () => el().querySelector<HTMLButtonElement>('mat-slide-toggle button[role="switch"]')!;
    expect(prekidac().getAttribute('aria-checked')).toBe('false');
    expect(polje(el(), 'Pomeraj X')).toBeNull();
    prekidac().click();
    await fixture.whenStable();
    expect(sloj('s1').senka).toEqual({ boja: '#000000', pomerajX: 3, pomerajY: 3, zamucenje: 4 });
    await upisi(fixture, polje(el(), 'Pomeraj X')!, '-150');
    await upisi(fixture, polje(el(), 'Zamućenje')!, '12,5');
    expect(sloj('s1').senka).toEqual({ boja: '#000000', pomerajX: -100, pomerajY: 3, zamucenje: 12.5 });
    expect(el().querySelector('app-izbor-boje')).not.toBeNull();
    prekidac().click();
    await fixture.whenStable();
    expect(sloj('s1').senka).toBeNull();
  });
});
