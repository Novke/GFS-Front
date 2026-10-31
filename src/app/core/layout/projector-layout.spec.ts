import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { Okruzenje } from './okruzenje';
import { ProjectorLayout } from './projector-layout';
import { RezimProjektora } from './rezim-projektora';

describe('ProjectorLayout', () => {
  async function prikazi(pratiRezim?: boolean, odStrane = false) {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: Okruzenje, useValue: { jeStaging: signal(true) } }],
    });
    TestBed.inject(RezimProjektora).pratiRezim.set(odStrane);
    const f = TestBed.createComponent(ProjectorLayout);
    if (pratiRezim !== undefined) f.componentRef.setInput('pratiRezim', pratiRezim);
    f.detectChanges();
    await f.whenStable();
    return f.nativeElement as HTMLElement;
  }

  it('bez ulaza je uvek svetao (rezim-dan)', async () => {
    const el = await prikazi();
    expect(el.classList).toContain('rezim-dan');
  });

  it('pratiRezim: bez rezim-dan (prati dan/noć aplikacije)', async () => {
    const el = await prikazi(true);
    expect(el.classList).not.toContain('rezim-dan');
  });

  it('stranica traži praćenje (završni ekran konzole): bez rezim-dan', async () => {
    const el = await prikazi(undefined, true);
    expect(el.classList).not.toContain('rezim-dan');
  });

  it('traka STAGING ostaje i uz pratiRezim', async () => {
    const el = await prikazi(true);
    expect(el.querySelector('.traka-okruzenja')?.textContent).toContain('STAGING');
  });
});
