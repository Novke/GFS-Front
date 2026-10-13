import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PreferencesStore } from '../../../core/state/preferences.store';
import { IzborBojeComponent } from './izbor-boje.component';
import { type LazniSat, dugme, provajderiSvojstava } from './svojstva.testing';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IzborBojeComponent],
  template: `<app-izbor-boje oznaka="Popuna" tema="BELA" [vrednost]="vrednost()" [dozvoliPrazno]="prazno()"
                             (izbor)="izabrano.push($event)" />`,
})
class DomacinComponent {
  readonly vrednost = signal<string | null>('#4472C4');
  readonly prazno = signal(false);
  readonly izabrano: (string | null)[] = [];
}

describe('IzborBojeComponent', () => {
  let fixture: ComponentFixture<DomacinComponent>;
  let domacin: DomacinComponent;
  const el = () => fixture.nativeElement as HTMLElement;
  const okidac = () => el().querySelector<HTMLButtonElement>('button.uz-ep-boja')!;
  const paleta = () => document.querySelector<HTMLElement>('.uz-ep-paleta');
  const hex = () => paleta()!.querySelector<HTMLInputElement>('input[type="text"]')!;

  async function otvori() {
    okidac().click();
    await fixture.whenStable();
  }

  beforeEach(async () => {
    localStorage.clear();
    const sat: LazniSat = { t: 0 };
    TestBed.configureTestingModule({ providers: provajderiSvojstava(sat) });
    fixture = TestBed.createComponent(DomacinComponent);
    domacin = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('dugme: uzorak, aria-label "<oznaka>: <boja>", aria-haspopup i aria-expanded', async () => {
    expect(okidac().getAttribute('aria-label')).toBe('Popuna: #4472C4');
    expect(okidac().getAttribute('aria-haspopup')).toBe('dialog');
    expect(okidac().getAttribute('aria-expanded')).toBe('false');
    expect(okidac().querySelector<HTMLElement>('.uz-ep-uzorak')!.style.backgroundColor).toBe('rgb(68, 114, 196)');
    domacin.vrednost.set(null);
    await fixture.whenStable();
    expect(okidac().getAttribute('aria-label')).toBe('Popuna: Bez');
    await otvori();
    expect(okidac().getAttribute('aria-expanded')).toBe('true');
  });

  it('popover je dijalog sa 9 uzoraka teme sa tačnim aria-label-ima; "Poslednje" je skriveno bez istorije', async () => {
    await otvori();
    const p = paleta()!;
    expect(p.getAttribute('role')).toBe('dialog');
    expect(p.getAttribute('aria-label')).toBe('Popuna');
    const tema = Array.from(p.querySelectorAll<HTMLButtonElement>('[data-red="tema"] button'));
    expect(tema.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Pozadina, #FFFFFF', 'Tekst, #000000', 'Naslov, #000000', 'Akcent 1, #4472C4', 'Akcent 2, #ED7D31',
      'Akcent 3, #A5A5A5', 'Akcent 4, #FFC000', 'Akcent 5, #5B9BD5', 'Akcent 6, #70AD47',
    ]);
    expect(tema[4].querySelector<HTMLElement>('.uz-ep-uzorak')!.style.backgroundColor).toBe('rgb(237, 125, 49)');
    expect(p.querySelector('[data-red="poslednje"]')).toBeNull();
  });

  it('izbor uzorka emituje boju, pamti je u poslednjim i zatvara; sledeći put "Poslednje" je vidljivo', async () => {
    await otvori();
    dugme(paleta()!, 'Akcent 2, #ED7D31')!.click();
    await fixture.whenStable();
    expect(domacin.izabrano).toEqual(['#ED7D31']);
    expect(TestBed.inject(PreferencesStore).poslednjeBoje()).toEqual(['#ED7D31']);
    expect(paleta()).toBeNull();
    await otvori();
    const poslednje = Array.from(paleta()!.querySelectorAll<HTMLButtonElement>('[data-red="poslednje"] button'));
    expect(poslednje.map((b) => b.getAttribute('aria-label'))).toEqual(['#ED7D31']);
  });

  it('kucanje u polje #RRGGBB: nijedan znak nije progutan, popover ostaje otvoren, Enter primenjuje', async () => {
    await otvori();
    const polje = hex();
    polje.focus();
    polje.value = '';
    for (const znak of '#12ab34') {
      const dole = new KeyboardEvent('keydown', { key: znak, bubbles: true, cancelable: true });
      polje.dispatchEvent(dole);
      expect(dole.defaultPrevented).toBe(false);
      polje.value += znak;
      polje.dispatchEvent(new Event('input', { bubbles: true }));
      await fixture.whenStable();
      expect(paleta()).not.toBeNull();
    }
    expect(hex().value).toBe('#12ab34');
    expect(document.activeElement).toBe(hex());
    hex().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect(domacin.izabrano).toEqual(['#12AB34']);
    expect(TestBed.inject(PreferencesStore).poslednjeBoje()).toEqual(['#12AB34']);
    expect(paleta()).toBeNull();
  });

  it('neispravna boja (#12ab3): "Primeni" onemogućeno, Enter ne radi ništa', async () => {
    await otvori();
    hex().value = '#12ab3';
    hex().dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
    expect(dugme(paleta()!, 'Primeni')!.disabled).toBe(true);
    hex().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect(domacin.izabrano).toEqual([]);
    expect(paleta()).not.toBeNull();
    hex().value = '#12ab34';
    hex().dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
    expect(dugme(paleta()!, 'Primeni')!.disabled).toBe(false);
    dugme(paleta()!, 'Primeni')!.click();
    await fixture.whenStable();
    expect(domacin.izabrano).toEqual(['#12AB34']);
  });

  it('izbornik boje (input color) upisuje boju u polje', async () => {
    await otvori();
    const boja = paleta()!.querySelector<HTMLInputElement>('input[type="color"]')!;
    boja.value = '#aa0011';
    boja.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
    expect(hex().value).toBe('#AA0011');
  });

  it('"Bez" postoji samo uz dozvoliPrazno i emituje null (bez pamćenja)', async () => {
    await otvori();
    expect(dugme(paleta()!, 'Bez')).toBeNull();
    paleta()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    domacin.prazno.set(true);
    await fixture.whenStable();
    await otvori();
    dugme(paleta()!, 'Bez')!.click();
    await fixture.whenStable();
    expect(domacin.izabrano).toEqual([null]);
    expect(TestBed.inject(PreferencesStore).poslednjeBoje()).toEqual([]);
  });

  it('Esc zatvara i fokus je na dugmetu', async () => {
    await otvori();
    hex().focus();
    hex().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect(paleta()).toBeNull();
    expect(document.activeElement).toBe(okidac());
    expect(okidac().getAttribute('aria-expanded')).toBe('false');
    expect(domacin.izabrano).toEqual([]);
  });

  it('klik na pozadinu zatvara bez izbora i vraća fokus na dugme', async () => {
    await otvori();
    document.querySelector<HTMLElement>('.cdk-overlay-backdrop')!.click();
    await fixture.whenStable();
    expect(paleta()).toBeNull();
    expect(document.activeElement).toBe(okidac());
    expect(domacin.izabrano).toEqual([]);
  });
});
