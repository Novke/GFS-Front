import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FONTOVI_PLATNA, cssFonta } from '../ui/platno-fontovi';
import { IzborFontaComponent } from './izbor-fonta.component';
import { type LazniSat, provajderiSvojstava } from './svojstva.testing';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IzborFontaComponent],
  template: `<app-izbor-fonta [vrednost]="vrednost()" (izbor)="izabrano.push($event)" />`,
})
class DomacinComponent {
  readonly vrednost = signal<string | null>('Carlito');
  readonly izabrano: string[] = [];
}

/** `font-family` kako ga pregledač normalizuje (navodnici), za poređenje sa `cssFonta`. */
function porodica(css: string): string {
  const s = document.createElement('span');
  s.style.fontFamily = css;
  return s.style.fontFamily;
}

describe('IzborFontaComponent', () => {
  let fixture: ComponentFixture<DomacinComponent>;
  const el = () => fixture.nativeElement as HTMLElement;
  const opcije = () => Array.from(document.querySelectorAll<HTMLElement>('mat-option'));

  async function otvori() {
    el().querySelector<HTMLElement>('.mat-mdc-select-trigger')!.click();
    await fixture.whenStable();
  }

  beforeEach(async () => {
    const sat: LazniSat = { t: 0 };
    TestBed.configureTestingModule({ providers: provajderiSvojstava(sat) });
    fixture = TestBed.createComponent(DomacinComponent);
    await fixture.whenStable();
  });

  afterEach(() => document.body.querySelectorAll('.cdk-overlay-container').forEach((o) => (o.innerHTML = '')));

  it('8 opcija iz kataloga, svaka u svom fontu (font-family iz cssFonta)', async () => {
    await otvori();
    const o = opcije();
    expect(o.map((x) => x.textContent!.trim())).toEqual(FONTOVI_PLATNA.map((f) => f.naziv));
    expect(o).toHaveLength(8);
    for (const [i, f] of FONTOVI_PLATNA.entries()) expect(o[i].style.fontFamily).toBe(porodica(cssFonta(f.naziv)));
  });

  it('polje ima labelu "Font", prikazuje izabrani font u njegovom pismu; izbor emituje naziv', async () => {
    expect(el().querySelector('mat-label')!.textContent!.trim()).toBe('Font');
    expect(el().querySelector('.mat-mdc-select-value')!.textContent!.trim()).toBe('Carlito');
    expect(el().querySelector<HTMLElement>('mat-select')!.style.fontFamily).toBe(porodica(cssFonta('Carlito')));
    await otvori();
    opcije().find((o) => o.textContent!.trim() === 'Tinos')!.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.izabrano).toEqual(['Tinos']);
  });

  it('mešani fontovi (null): prazno polje sa natpisom "Različiti"', async () => {
    fixture.componentInstance.vrednost.set(null);
    await fixture.whenStable();
    expect(el().querySelector('.mat-mdc-select-placeholder')!.textContent!.trim()).toBe('Različiti');
  });
});
