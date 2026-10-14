import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { FormErrorBanner } from './form-error-banner';

@Component({ imports: [FormErrorBanner], template: `<app-form-error-banner [poruka]="poruka()" />` })
class Host {
  poruka = signal<string | null>(null);
}

describe('FormErrorBanner', () => {
  it('ne prikazuje ništa bez poruke', () => {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    expect(f.nativeElement.querySelector('[role=alert]')).toBeNull();
  });

  it('prikazuje poruku kao alert i fokusira traku', async () => {
    const f = TestBed.createComponent(Host);
    document.body.appendChild(f.nativeElement);
    f.detectChanges();
    f.componentInstance.poruka.set('Indeks već postoji.');
    f.detectChanges();
    await f.whenStable();

    const el: HTMLElement = f.nativeElement.querySelector('[role=alert]');
    expect(el.textContent).toContain('Indeks već postoji.');
    expect(document.activeElement).toBe(el);
    f.nativeElement.remove();
  });
});
