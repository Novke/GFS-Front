import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SkenerQr } from './skener-qr.component';

/** Skener QR-a na tabu Čas (spec „Aplikacija i obaveštenja“ 4.5): putevi bez kamere; čitanje QR-a proverava `skener.pravila`. */
describe('SkenerQr', () => {
  const izvorno = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');

  afterEach(() => {
    if (izvorno) {
      Object.defineProperty(navigator, 'mediaDevices', izvorno);
    } else {
      delete (navigator as unknown as Record<string, unknown>)['mediaDevices'];
    }
  });

  function napravi() {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const f = TestBed.createComponent(SkenerQr);
    f.detectChanges();
    return { f, el: f.nativeElement as HTMLElement };
  }

  it('browser bez kamere: odmah „Slikaj tablu“, bez prijateljske poruke o dozvoli', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
    const { f, el } = napravi();
    el.querySelector<HTMLButtonElement>('[data-skeniraj]')!.click();
    await f.whenStable();
    expect(el.querySelector('[data-kamera-odbijena]')?.textContent).toContain('Slikaj tablu');
    expect(el.textContent).not.toContain('Bez brige');
  });

  it('pre dozvole kratko objašnjenje; odbijena kamera: „Bez brige: dozvoli kameru ovde“, uputstvo i „Slikaj tablu“', async () => {
    const getUserMedia = vi.fn(async () => {
      throw Object.assign(new Error('odbijeno'), { name: 'NotAllowedError' });
    });
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
    const { f, el } = napravi();
    el.querySelector<HTMLButtonElement>('[data-skeniraj]')!.click();
    await f.whenStable();
    expect(el.querySelector('[data-pre-dozvole]')?.textContent).toContain('Treba nam kamera samo za QR sa table. Slobodno dozvoli.');
    expect(getUserMedia).not.toHaveBeenCalled();
    el.querySelector<HTMLButtonElement>('[data-ukljuci-kameru]')!.click();
    await f.whenStable();
    expect(getUserMedia).toHaveBeenCalled();
    const odbijeno = el.querySelector('[data-kamera-odbijena]')!;
    expect(odbijeno.textContent).toContain('Bez brige: dozvoli kameru ovde.');
    expect(odbijeno.querySelector('[data-slikaj]')).not.toBeNull();
    const fajl = el.querySelector<HTMLInputElement>('[data-fajl]')!;
    expect(fajl.getAttribute('capture')).toBe('environment');
    expect(fajl.getAttribute('accept')).toBe('image/*');
  });
});
