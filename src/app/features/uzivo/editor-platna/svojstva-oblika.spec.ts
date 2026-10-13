import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { OblikSloj, Platno, TekstSloj } from '../data-access/platno.models';
import { noviOblik, noviTekst } from '../data-access/platno-novo';
import { platnoSaAnimacijama } from '../data-access/platno-podaci.testing';
import { krajeviLinije } from './geometrija';
import { PanelSvojstvaComponent } from './panel-svojstva.component';
import { PlatnoEditorStore } from './platno-editor.store';
import { type LazniSat, dugme, oznakePolja, polje, provajderiSvojstava, upisi } from './svojstva.testing';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [PlatnoEditorStore],
  imports: [PanelSvojstvaComponent],
  template: `<app-panel-svojstva tema="NACRT" />`,
})
class DomacinComponent {}

/** Linija (100, 112) - (340, 112) iz fabrike (okvir 240 x 24 na (100, 100), krajevi na sredini visine). */
function linija(id: string): OblikSloj {
  return { ...noviOblik(id, 'NACRT', 'LINIJA'), x: 100, y: 100 };
}

describe('SvojstvaOblikaComponent (kroz panel Svojstva)', () => {
  let fixture: ComponentFixture<DomacinComponent>;
  let store: PlatnoEditorStore;
  const sat: LazniSat = { t: 0 };
  const el = () => fixture.nativeElement as HTMLElement;
  const sloj = <T = OblikSloj>(id: string) => store.platno().slojevi.find((s) => s.id === id) as T;
  const opcije = () => Array.from(document.querySelectorAll<HTMLElement>('mat-option'));

  async function pocni(slojevi: Platno['slojevi'], izbor: string[]) {
    store.inicijalizuj(platnoSaAnimacijama([], slojevi));
    store.izaberi(izbor);
    await fixture.whenStable();
  }

  /** Otvara `mat-select` sa labelom `oznaka` i bira opciju po tekstu. */
  async function izaberiOpciju(oznaka: string, tekst: string) {
    const polja = Array.from(el().querySelectorAll<HTMLElement>('mat-form-field'));
    const f = polja.find((p) => p.querySelector('mat-label')?.textContent?.trim() === oznaka)!;
    f.querySelector<HTMLElement>('.mat-mdc-select-trigger')!.click();
    await fixture.whenStable();
    opcije().find((o) => o.textContent!.trim() === tekst)!.click();
    await fixture.whenStable();
  }

  /** Otvara paletu boje `oznaka` i bira uzorak po aria-label-u (ili "Bez"). */
  async function izaberiBoju(oznaka: string, uzorak: string) {
    const okidac = Array.from(el().querySelectorAll<HTMLButtonElement>('app-izbor-boje button'))
      .find((b) => b.getAttribute('aria-label')!.startsWith(`${oznaka}: `))!;
    okidac.click();
    await fixture.whenStable();
    const paleta = document.querySelector<HTMLElement>(`.uz-ep-paleta[aria-label="${oznaka}"]`)!;
    dugme(paleta, uzorak)!.click();
    await fixture.whenStable();
  }

  beforeEach(() => {
    sat.t = 0;
    localStorage.clear();
    TestBed.configureTestingModule({ providers: provajderiSvojstava(sat) });
    fixture = TestBed.createComponent(DomacinComponent);
    store = fixture.debugElement.children[0].injector.get(PlatnoEditorStore);
    store.postaviIzlaz(vi.fn());
  });

  it('"Vrsta" menja zatvoren oblik među zatvorenim: ELIPSA -> TROUGAO', async () => {
    await pocni([noviOblik('s1', 'NACRT', 'ELIPSA')], ['s1']);
    await izaberiOpciju('Vrsta', 'Trougao');
    expect(sloj('s1').oblik).toBe('TROUGAO');
    // zatvoreni oblici se ne menjaju u linijske
    const polja = Array.from(el().querySelectorAll<HTMLElement>('mat-form-field'));
    polja.find((p) => p.querySelector('mat-label')?.textContent?.trim() === 'Vrsta')!
      .querySelector<HTMLElement>('.mat-mdc-select-trigger')!.click();
    await fixture.whenStable();
    expect(opcije().map((o) => o.textContent!.trim())).toEqual(['Pravougaonik', 'Zaobljeni pravougaonik', 'Elipsa', 'Trougao']);
  });

  it('linijski oblici se menjaju među linijskim; linija nema "Popuna" ni polja Širina/Visina/Rotacija', async () => {
    await pocni([linija('s1')], ['s1']);
    expect(el().querySelector('app-izbor-boje button[aria-label^="Popuna"]')).toBeNull();
    const oznake = oznakePolja(el());
    for (const o of ['X', 'Y', 'Širina', 'Visina', 'Rotacija']) expect(oznake).not.toContain(o);
    expect(oznake).toEqual(expect.arrayContaining(['Početak X', 'Početak Y', 'Kraj X', 'Kraj Y', 'Dužina', 'Ugao', 'Providnost']));
    await izaberiOpciju('Vrsta', 'Strelica');
    expect(sloj('s1').oblik).toBe('STRELICA');
    expect(opcije()).toHaveLength(0);
    const polja = Array.from(el().querySelectorAll<HTMLElement>('mat-form-field'));
    polja.find((p) => p.querySelector('mat-label')?.textContent?.trim() === 'Vrsta')!
      .querySelector<HTMLElement>('.mat-mdc-select-trigger')!.click();
    await fixture.whenStable();
    expect(opcije().map((o) => o.textContent!.trim())).toEqual(['Linija', 'Strelica', 'Dvostruka strelica']);
  });

  it('"Popuna" iz teme i "Bez"; ivica: crtica, "Bez" -> null, debljina 25 -> 20', async () => {
    await pocni([noviOblik('s1', 'NACRT', 'PRAVOUGAONIK')], ['s1']);
    await izaberiBoju('Popuna', 'Akcent 2, #F0A23B');
    expect(sloj('s1').popuna).toBe('#F0A23B');
    await izaberiBoju('Popuna', 'Bez');
    expect(sloj('s1').popuna).toBeNull();

    await izaberiOpciju('Crtica', 'Tačkasta');
    expect(sloj('s1').ivica!.crtica).toBe('TACKASTA');
    await upisi(fixture, polje(el(), 'Debljina')!, '25');
    expect(sloj('s1').ivica!.debljina).toBe(20);
    await upisi(fixture, polje(el(), 'Debljina')!, '0,1');
    expect(sloj('s1').ivica!.debljina).toBe(0.25);

    await izaberiBoju('Ivica', 'Bez');
    expect(sloj('s1').ivica).toBeNull();
    expect(polje(el(), 'Debljina')!.disabled).toBe(true);
    await izaberiBoju('Ivica', 'Tekst, #121A2A');
    expect(sloj('s1').ivica).toEqual({ boja: '#121A2A', debljina: 1, crtica: 'PUNA' });
  });

  it('linija (100, 112)-(340, 112): Početak, Kraj, Dužina 240, Ugao 0; Ugao 90 i Kraj X 400 pomeraju kraj', async () => {
    await pocni([linija('s1')], ['s1']);
    expect(polje(el(), 'Početak X')!.value).toBe('100');
    expect(polje(el(), 'Početak Y')!.value).toBe('112');
    expect(polje(el(), 'Kraj X')!.value).toBe('340');
    expect(polje(el(), 'Kraj Y')!.value).toBe('112');
    expect(polje(el(), 'Dužina')!.value).toBe('240');
    expect(polje(el(), 'Ugao')!.value).toBe('0');

    await upisi(fixture, polje(el(), 'Ugao')!, '90');
    expect(krajeviLinije(sloj('s1'))).toEqual([{ x: 100, y: 112 }, { x: 100, y: 352 }]);
    expect(sloj('s1').rotacija).toBe(0);
    expect(polje(el(), 'Kraj Y')!.value).toBe('352');

    await upisi(fixture, polje(el(), 'Kraj X')!, '400');
    const s = sloj('s1');
    expect(krajeviLinije(s)).toEqual([{ x: 100, y: 112 }, { x: 400, y: 352 }]);
    // nova kutija oko krajeva (margina max(6, 3 * debljina) = 9)
    expect(s).toMatchObject({ x: 91, y: 103, sirina: 318, visina: 258, rotacija: 0 });

    await upisi(fixture, polje(el(), 'Dužina')!, '100');
    const [a, b] = krajeviLinije(sloj('s1'));
    expect(a.x).toBeCloseTo(100, 6);
    expect(a.y).toBeCloseTo(112, 6);
    expect(polje(el(), 'Dužina')!.value).toBe('100');
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(100, 1);
  });

  it('TEKST (4a): samo "Popuna" i "Ivica" okvira, bez "Vrsta"', async () => {
    const t: TekstSloj = noviTekst('s1', 'NACRT', { x: 10, y: 10, sirina: 300, visina: 80 });
    await pocni([t], ['s1']);
    expect(oznakePolja(el())).not.toContain('Vrsta');
    await izaberiBoju('Popuna', 'Akcent 1, #2456A6');
    expect(sloj<TekstSloj>('s1').popuna).toBe('#2456A6');
    await izaberiBoju('Ivica', 'Akcent 3, #1D7A55');
    expect(sloj<TekstSloj>('s1').ivica).toEqual({ boja: '#1D7A55', debljina: 1, crtica: 'PUNA' });
  });

  it('zaključan oblik: "Vrsta", boje i debljina su onemogućeni', async () => {
    await pocni([{ ...noviOblik('s1', 'NACRT', 'PRAVOUGAONIK'), zakljucan: true }], ['s1']);
    for (const b of el().querySelectorAll<HTMLButtonElement>('app-izbor-boje button')) expect(b.disabled).toBe(true);
    expect(polje(el(), 'Debljina')!.disabled).toBe(true);
    expect(el().querySelector('mat-select')!.getAttribute('aria-disabled')).toBe('true');
  });
});
