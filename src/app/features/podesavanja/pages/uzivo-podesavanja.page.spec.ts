import { TestBed } from '@angular/core/testing';

import { RANIJE_CRTEZI_KLJUC, RanijiCrteziPodesavanje } from '../../uzivo/crtanje/ranije-podesavanje';
import { UzivoPodesavanjaPage } from './uzivo-podesavanja.page';

describe('Podešavanja -> Uživo (ranije crteže na slajdu)', () => {
  beforeEach(() => localStorage.clear());

  function otvori() {
    const f = TestBed.createComponent(UzivoPodesavanjaPage);
    f.detectChanges();
    return f;
  }
  const prekidac = (el: HTMLElement) => el.querySelector<HTMLButtonElement>('[data-ranije-crteze] button[role="switch"]')!;

  it('podrazumevano uključeno; isključivanje se pamti u ovom pregledaču (van gfs.prefs.v1)', () => {
    const f = otvori();
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Nudi ranije crteže na slajdu');
    expect(el.textContent).toContain('crteži se i dalje čuvaju i vide se u pregledu izvođenja');
    expect(prekidac(el).getAttribute('aria-checked')).toBe('true');
    prekidac(el).click();
    f.detectChanges();
    expect(prekidac(el).getAttribute('aria-checked')).toBe('false');
    expect(localStorage.getItem(RANIJE_CRTEZI_KLJUC)).toBe('0');
    expect(TestBed.inject(RanijiCrteziPodesavanje).ukljuceno()).toBe(false);
    expect(localStorage.getItem('gfs.prefs.v1')).toBeNull();
  });

  it('sačuvano isključeno se čita pri otvaranju; ponovno uključivanje upisuje 1', () => {
    localStorage.setItem(RANIJE_CRTEZI_KLJUC, '0');
    const f = otvori();
    const el = f.nativeElement as HTMLElement;
    expect(prekidac(el).getAttribute('aria-checked')).toBe('false');
    prekidac(el).click();
    expect(localStorage.getItem(RANIJE_CRTEZI_KLJUC)).toBe('1');
  });
});
