import { Title } from '@angular/platform-browser';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, TitleStrategy } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { GfsTitleStrategy } from './title-strategy';

describe('GfsTitleStrategy', () => {
  const podesi = () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'predavanja', title: 'Predavanja', children: [] },
          { path: 'bez-naslova', children: [] },
        ]),
        { provide: TitleStrategy, useClass: GfsTitleStrategy },
      ],
    });
    return { router: TestBed.inject(Router), title: TestBed.inject(Title) };
  };

  it('dodaje sufiks " · GFS" na naslov rute', async () => {
    const { router, title } = podesi();
    await router.navigateByUrl('/predavanja');
    expect(title.getTitle()).toBe('Predavanja · GFS');
  });

  it('ruta bez naslova daje samo "GFS"', async () => {
    const { router, title } = podesi();
    await router.navigateByUrl('/bez-naslova');
    expect(title.getTitle()).toBe('GFS');
  });
});
