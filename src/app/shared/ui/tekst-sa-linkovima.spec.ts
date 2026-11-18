import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { TekstSaLinkovima } from './tekst-sa-linkovima';

const DRIVE = 'https://drive.google.com/drive/folders/1cbUKIFMvrJCGQMBFkKI8W_BEIuOeJTeI';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TekstSaLinkovima],
  template: `<p style="white-space: pre-wrap"><app-tekst-sa-linkovima [tekst]="tekst()" /></p>`,
})
class Domacin {
  readonly tekst = signal<string | null>(`Fajlovi (${DRIVE}):\n- 1. krug`);
}

async function napravi() {
  const f = TestBed.createComponent(Domacin);
  await f.whenStable();
  return { f, el: f.nativeElement as HTMLElement };
}

describe('TekstSaLinkovima', () => {
  it('adresa je link u novoj kartici, tekst ostaje tačno isti (i prelom reda)', async () => {
    const { el } = await napravi();
    const linkovi = el.querySelectorAll('a');
    expect(linkovi.length).toBe(1);
    const a = linkovi[0];
    expect(a.getAttribute('href')).toBe(DRIVE);
    expect(a.textContent).toBe(DRIVE);
    expect(a.target).toBe('_blank');
    expect(a.rel).toBe('noopener noreferrer');
    expect(el.querySelector('p')!.textContent).toBe(`Fajlovi (${DRIVE}):\n- 1. krug`);
  });

  it('bez adrese nema linka; null ne crta ništa', async () => {
    const { f, el } = await napravi();
    f.componentInstance.tekst.set('javascript:alert(1) i www.primer.rs');
    await f.whenStable();
    expect(el.querySelector('a')).toBeNull();
    expect(el.textContent).toBe('javascript:alert(1) i www.primer.rs');
    f.componentInstance.tekst.set(null);
    await f.whenStable();
    expect(el.querySelector('p')!.textContent).toBe('');
  });

  it('posle klika mišem link pušta fokus, posle Enter-a sa tastature ga zadržava', async () => {
    const { el } = await napravi();
    const a = el.querySelector('a')!;
    // jsdom ne otvara novu karticu, ali bi pokušao navigaciju: klik se ovde samo prijavljuje
    a.addEventListener('click', (e) => e.preventDefault());
    a.focus();
    a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 }));
    expect(document.activeElement).toBe(a);
    a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
    expect(document.activeElement).not.toBe(a);
  });
});
