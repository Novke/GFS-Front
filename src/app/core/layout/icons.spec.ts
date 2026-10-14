import { SecurityContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { describe, expect, it, vi } from 'vitest';

import { IKONE, registrujIkone } from './icons';

describe('registrujIkone', () => {
  it('registruje svaku ikonu iz liste kao svgIcon sa relativnom putanjom', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    const registry = TestBed.inject(MatIconRegistry);
    const sanitizer = TestBed.inject(DomSanitizer);
    const dodaj = vi.spyOn(registry, 'addSvgIcon');

    registrujIkone(registry, sanitizer);

    expect(dodaj).toHaveBeenCalledTimes(IKONE.length);
    const putanje = dodaj.mock.calls.map(([ime, url]) => [ime, sanitizer.sanitize(SecurityContext.RESOURCE_URL, url)]);
    expect(putanje).toContainEqual(['home', 'assets/icons/home.svg']);
    expect(putanje).toContainEqual(['expand_more', 'assets/icons/expand_more.svg']);
    expect(new Set(IKONE).size).toBe(IKONE.length);
  });
});
