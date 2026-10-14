import { ChangeDetectionStrategy, Component, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import type { Sloj } from '../data-access/platno.models';
import { noviOblik } from '../data-access/platno-novo';
import { animacija, platnoSaAnimacijama } from '../data-access/platno-podaci.testing';
import { pomeriSat, saLaznimSatom } from '../lazni-sat.testing';
import { PlatnoEditorStore } from './platno-editor.store';
import { PregledPlatnaComponent } from './pregled-platna.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [PlatnoEditorStore],
  imports: [PregledPlatnaComponent],
  template: `<app-pregled-platna />`,
})
class DomacinComponent {}

/** Grupa 0 (FADE 500, kreće sama), KLIK 500, KLIK 300: plan "Pusti slajd" je korak 1 posle 900 ms, korak 2 posle još 900. */
const dok = () => platnoSaAnimacijama([
  animacija('a0', 's1', { okidac: 'POSLE_PRETHODNOG' }),
  animacija('a1', 's2'),
  animacija('a2', 's3', { trajanjeMs: 300 }),
], ['s1', 's2', 's3'].map((id) => noviOblik(id, 'NACRT', 'PRAVOUGAONIK')) as Sloj[]);

describe('PregledPlatnaComponent (F18)', () => {
  let fixture: ComponentFixture<DomacinComponent>;
  let store: InstanceType<typeof PlatnoEditorStore>;
  let animate: ReturnType<typeof vi.fn>;
  const el = () => fixture.nativeElement as HTMLElement;
  const status = () => el().querySelector('.uz-ep-korak')!.textContent!.trim();
  const dugme = (tekst: string) =>
    [...el().querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes(tekst))!;
  const osvezi = () => {
    fixture.detectChanges();
    TestBed.tick();
  };
  const klik = (tekst: string) => {
    dugme(tekst).click();
    osvezi();
  };
  const sat = async (ms: number) => {
    await pomeriSat(ms);
    osvezi();
  };

  beforeEach(() => {
    // jsdom nema Web Animations API (kao platno-prikaz-animacije.spec)
    animate = vi.fn(() => ({ cancel: vi.fn(), finished: Promise.resolve() }));
    Object.defineProperty(Element.prototype, 'animate', { configurable: true, writable: true, value: animate });
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } }],
    });
    fixture = TestBed.createComponent(DomacinComponent);
    store = fixture.debugElement.injector.get(PlatnoEditorStore);
    store.inicijalizuj(dok());
    osvezi();
  });

  afterEach(() => {
    fixture.destroy();
    delete (Element.prototype as Partial<Element>).animate;
  });

  it('crta pun dokument sa koracima: status "Korak 0 / 2" (role status), Korak nazad na 0 onemogućen', () => {
    expect(status()).toBe('Korak 0 / 2');
    expect(el().querySelector('.uz-ep-korak')!.getAttribute('role')).toBe('status');
    // pun dokument sa animacijama: posle grupe 0 vidi se s1, a s2 i s3 (ULAZ na klik) još ne
    const vidljivost = (id: string) => el().querySelector<HTMLElement>(`.uz-ep-pregled [data-sloj="${id}"]`)!.style.visibility;
    expect(['s1', 's2', 's3'].map(vidljivost)).toEqual(['', 'hidden', 'hidden']);
    expect(dugme('Korak nazad').getAttribute('aria-disabled')).toBe('true');
    expect(dugme('Pusti od izabrane').getAttribute('aria-disabled')).toBe('true');
  });

  it('Korak napred pušta grupu novog koraka (Element.animate), Korak nazad ne; napred na kraju ništa', () => {
    klik('Korak napred');
    expect(status()).toBe('Korak 1 / 2');
    expect(animate).toHaveBeenCalled();
    expect(dugme('Korak nazad').getAttribute('aria-disabled')).not.toBe('true');
    klik('Korak napred');
    animate.mockClear();
    klik('Korak napred');
    expect(status()).toBe('Korak 2 / 2');
    expect(dugme('Korak napred').getAttribute('aria-disabled')).toBe('true');
    expect(animate).not.toHaveBeenCalled();
    klik('Korak nazad');
    expect(status()).toBe('Korak 1 / 2');
    expect(animate).not.toHaveBeenCalled();
  });

  it('Pusti slajd: grupa 0 odmah, korak 1 posle 900 ms, korak 2 posle još 900 ms, pa nema tajmera', saLaznimSatom(async () => {
    klik('Korak napred');
    animate.mockClear();
    klik('Pusti slajd');
    expect(status()).toBe('Korak 0 / 2');
    expect(animate).toHaveBeenCalled(); // grupa 0 kreće sama
    await sat(899);
    expect(status()).toBe('Korak 0 / 2');
    await sat(1);
    expect(status()).toBe('Korak 1 / 2');
    await sat(900);
    expect(status()).toBe('Korak 2 / 2');
    expect(vi.getTimerCount()).toBe(0);
  }));

  it('Zaustavi posle 100 ms: nijedan korak dalje', saLaznimSatom(async () => {
    klik('Pusti slajd');
    await sat(100);
    klik('Zaustavi');
    await sat(5000);
    expect(status()).toBe('Korak 0 / 2');
    expect(vi.getTimerCount()).toBe(0);
  }));

  it('Esc (bilo gde u dokumentu) i uništavanje gase tajmere', saLaznimSatom(async () => {
    klik('Pusti slajd');
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sat(5000);
    expect(status()).toBe('Korak 0 / 2');
    klik('Pusti slajd');
    fixture.destroy();
    expect(vi.getTimerCount()).toBe(0);
  }));

  it('Pusti od izabrane (animacija grupe 2): odmah korak 1, posle 400 ms korak 2', saLaznimSatom(async () => {
    store.izaberiAnimaciju('a2');
    osvezi();
    expect(dugme('Pusti od izabrane').getAttribute('aria-disabled')).not.toBe('true');
    klik('Pusti od izabrane');
    expect(status()).toBe('Korak 1 / 2');
    await sat(399);
    expect(status()).toBe('Korak 1 / 2');
    await sat(1);
    expect(status()).toBe('Korak 2 / 2');
    expect(vi.getTimerCount()).toBe(0);
  }));
});
