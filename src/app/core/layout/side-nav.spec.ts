import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatIconRegistry } from '@angular/material/icon';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { SideNav } from './side-nav';

@Component({ template: '', changeDetection: ChangeDetectionStrategy.OnPush })
class Prazno {}

describe('SideNav: istaknuta stavka', () => {
  async function na(url: string) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'prezentacije', component: Prazno },
          { path: 'izvodjenja/:id/pregled', component: Prazno },
          { path: 'predavanja', component: Prazno },
        ]),
      ],
    });
    // ikone se ne preuzimaju (nema HTTP-a u testu)
    vi.spyOn(TestBed.inject(MatIconRegistry), 'getNamedSvgIcon').mockReturnValue(of(document.createElementNS('http://www.w3.org/2000/svg', 'svg')));
    const f = TestBed.createComponent(SideNav);
    await TestBed.inject(Router).navigateByUrl(url);
    await f.whenStable();
    const el = f.nativeElement as HTMLElement;
    const stavka = (tekst: string) => [...el.querySelectorAll('a.stavka')].find(a => a.textContent?.includes(tekst))!;
    return { stavka };
  }

  it('pregled izvođenja (izvodjenja/:id/pregled) ističe "Prezentacije"', async () => {
    const { stavka } = await na('/izvodjenja/5/pregled');
    expect(stavka('Prezentacije').classList).toContain('aktivna');
    expect(stavka('Prezentacije').getAttribute('aria-current')).toBe('page');
    expect(stavka('Predavanja').classList).not.toContain('aktivna');
  });

  it('na prezentacijama ističe "Prezentacije", na predavanjima samo "Predavanja"', async () => {
    const { stavka } = await na('/predavanja');
    expect(stavka('Predavanja').classList).toContain('aktivna');
    expect(stavka('Prezentacije').classList).not.toContain('aktivna');
    expect(stavka('Prezentacije').getAttribute('aria-current')).toBeNull();
  });
});
