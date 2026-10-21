import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { type LazniSat, dugme, polje, provajderiSvojstava } from './svojstva.testing';
import { UbaciTabeluComponent, type VelicinaTabele } from './ubaci-tabelu.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UbaciTabeluComponent],
  template: `<app-ubaci-tabelu (ubaci)="ubaceno.push($event)" />`,
})
class DomacinComponent {
  readonly ubaceno: VelicinaTabele[] = [];
}

describe('UbaciTabeluComponent', () => {
  let fixture: ComponentFixture<DomacinComponent>;
  const el = () => fixture.nativeElement as HTMLElement;
  const okidac = () => dugme(el(), 'Tabela')!;
  const dijalog = () => document.querySelector<HTMLElement>('.uz-ep-ubaci-tabelu');

  async function otvori() {
    okidac().click();
    await fixture.whenStable();
  }

  /** Kuca znak po znak (keydown + input): nijedan znak ne sme biti progutan, popover ostaje otvoren. */
  async function kucaj(cilj: HTMLInputElement, tekst: string) {
    cilj.focus();
    cilj.value = '';
    for (const znak of tekst) {
      const dole = new KeyboardEvent('keydown', { key: znak, bubbles: true, cancelable: true });
      cilj.dispatchEvent(dole);
      expect(dole.defaultPrevented).toBe(false);
      cilj.value += znak;
      cilj.dispatchEvent(new Event('input', { bubbles: true }));
      await fixture.whenStable();
      expect(dijalog()).not.toBeNull();
    }
  }

  beforeEach(async () => {
    const sat: LazniSat = { t: 0 };
    TestBed.configureTestingModule({ providers: provajderiSvojstava(sat) });
    fixture = TestBed.createComponent(DomacinComponent);
    await fixture.whenStable();
  });

  afterEach(() => document.body.querySelectorAll('.cdk-overlay-container').forEach((o) => (o.innerHTML = '')));

  it('"Tabela" otvara dijalog sa poljima Redova i Kolona (podrazumevano 3 x 3)', async () => {
    expect(okidac().getAttribute('aria-haspopup')).toBe('dialog');
    await otvori();
    expect(okidac().getAttribute('aria-expanded')).toBe('true');
    expect(dijalog()!.getAttribute('role')).toBe('dialog');
    expect(dijalog()!.getAttribute('aria-label')).toBe('Ubaci tabelu');
    expect(polje(dijalog()!, 'Redova')!.value).toBe('3');
    expect(polje(dijalog()!, 'Kolona')!.value).toBe('3');
  });

  it('Fix m6: na otvaranju je sadržaj polja Redova izabran (kucanje "5" ga zamenjuje, ne daje "35")', async () => {
    const izbor = vi.spyOn(HTMLInputElement.prototype, 'select');
    await otvori();
    expect(document.activeElement).toBe(polje(dijalog()!, 'Redova'));
    expect(izbor.mock.contexts).toContain(polje(dijalog()!, 'Redova'));
    izbor.mockRestore();
  });

  it('kucanje "5" u Redova i "4" u Kolona ostaje u poljima, Enter ubacuje 5 x 4 i zatvara', async () => {
    await otvori();
    await kucaj(polje(dijalog()!, 'Redova')!, '5');
    await kucaj(polje(dijalog()!, 'Kolona')!, '4');
    expect(polje(dijalog()!, 'Redova')!.value).toBe('5');
    polje(dijalog()!, 'Kolona')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect(fixture.componentInstance.ubaceno).toEqual([{ redova: 5, kolona: 4 }]);
    expect(dijalog()).toBeNull();
  });

  it('31 redova: "Ubaci" je onemogućeno, a Enter ne radi ništa', async () => {
    await otvori();
    await kucaj(polje(dijalog()!, 'Redova')!, '31');
    expect(dugme(dijalog()!, 'Ubaci')!.disabled).toBe(true);
    polje(dijalog()!, 'Redova')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect(fixture.componentInstance.ubaceno).toEqual([]);
    expect(dijalog()).not.toBeNull();
  });

  it('Esc zatvara i vraća fokus na dugme "Tabela"', async () => {
    await otvori();
    const p = polje(dijalog()!, 'Redova')!;
    p.focus();
    p.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect(dijalog()).toBeNull();
    expect(document.activeElement).toBe(okidac());
    expect(fixture.componentInstance.ubaceno).toEqual([]);
  });
});
