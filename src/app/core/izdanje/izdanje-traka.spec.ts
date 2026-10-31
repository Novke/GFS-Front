import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { Izdanje } from './izdanje';
import { IzdanjeTraka } from './izdanje-traka';

@Component({ template: '' })
class Prazna {}

describe('IzdanjeTraka', () => {
  const novo = signal<string | null>(null);
  const osvezi = vi.fn();

  async function napravi(ucitano: string | null = 'A') {
    novo.set(null);
    osvezi.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'a', component: Prazna },
          { path: 'publika', data: { projekcija: true }, children: [{ path: '', component: Prazna }] },
        ]),
        { provide: Izdanje, useValue: { ucitano, novo, osvezi } },
      ],
    });
    const f = TestBed.createComponent(IzdanjeTraka);
    await TestBed.inject(Router).navigateByUrl('/a');
    f.detectChanges();
    return f;
  }

  const tekst = (f: { nativeElement: HTMLElement }) => f.nativeElement.textContent?.trim() ?? '';
  const dugme = (f: { nativeElement: HTMLElement }, natpis: string) =>
    [...f.nativeElement.querySelectorAll('button')].find(b => b.textContent?.trim() === natpis)!;

  it('bez novog izdanja prazna, ali status region postoji (čitač ekrana čuje kad se pojavi)', async () => {
    const f = await napravi();
    expect(tekst(f)).toBe('');
    expect(f.nativeElement.querySelector('[role="status"]')).not.toBeNull();
  });

  it('bez praćenja izdanja (nema meta oznake) nema ni status regiona', async () => {
    const f = await napravi(null);
    expect(f.nativeElement.querySelector('[role="status"]')).toBeNull();
  });

  it('novo izdanje: poruka i "Osveži" osvežava', async () => {
    const f = await napravi();
    novo.set('B');
    f.detectChanges();
    expect(tekst(f)).toContain('Dostupna je nova verzija GFS-a.');
    dugme(f, 'Osveži').click();
    expect(osvezi).toHaveBeenCalledTimes(1);
  });

  it('"Kasnije" skriva traku do sledećeg novog izdanja', async () => {
    const f = await napravi();
    novo.set('B');
    f.detectChanges();
    dugme(f, 'Kasnije').click();
    f.detectChanges();
    expect(tekst(f)).toBe('');
    novo.set('C');
    f.detectChanges();
    expect(tekst(f)).toContain('Dostupna je nova verzija');
  });

  it('na projekciji (data.projekcija) bez trake', async () => {
    const f = await napravi();
    novo.set('B');
    await TestBed.inject(Router).navigateByUrl('/publika');
    f.detectChanges();
    expect(tekst(f)).toBe('');
  });
});
