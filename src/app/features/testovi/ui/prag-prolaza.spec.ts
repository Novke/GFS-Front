import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { PragProlaza } from './prag-prolaza';

@Component({
  imports: [PragProlaza],
  template: `<app-prag-prolaza [kljuc]="kljuc()" [prag]="prag()" [max]="30" [cuvaj]="cuvaj" />`,
})
class Host {
  readonly kljuc = signal(5);
  readonly prag = signal<number | null>(15);
  odgovori: ((g: string | null) => void)[] = [];
  readonly cuvaj = vi.fn((p: number | null) => new Promise<string | null>(r => this.odgovori.push(g => { if (!g) { this.prag.set(p); } r(g); })));
}

describe('PragProlaza', () => {
  function napravi() {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const polje = () => f.nativeElement.querySelector('input[data-prag]') as HTMLInputElement;
    const unesi = (v: string) => {
      polje().value = v;
      polje().dispatchEvent(new Event('input'));
      f.detectChanges();
    };
    return { f, polje, unesi, host: f.componentInstance };
  }

  it('blur i Enter dok čuvanje traje ne šalju ponovo', async () => {
    const { f, polje, unesi, host } = napravi();
    unesi('10');
    polje().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    polje().dispatchEvent(new Event('blur'));
    polje().dispatchEvent(new Event('blur'));
    expect(host.cuvaj).toHaveBeenCalledTimes(1);
    expect(host.cuvaj).toHaveBeenCalledWith(10);
    host.odgovori[0](null);
    await f.whenStable();
    f.detectChanges();
    expect(polje().value).toBe('10');
  });

  it('drugi test (ista komponenta): započeta izmena i greška se odbacuju, polje pokazuje prag novog testa', async () => {
    const { f, polje, unesi, host } = napravi();
    unesi('99');
    polje().dispatchEvent(new Event('blur'));
    f.detectChanges();
    expect(f.nativeElement.querySelector('[data-prag-opis]').textContent).toContain('Prag prolaza mora biti između 0');
    host.kljuc.set(6);
    host.prag.set(null);
    f.detectChanges();
    expect(polje().value).toBe('');
    expect(f.nativeElement.querySelector('[data-prag-opis]').textContent).toContain('Bez praga test nema prolaznost.');
    expect(host.cuvaj).not.toHaveBeenCalled();
  });

  it('kucanje za vreme čuvanja se ne gubi; sledeći blur čuva novi tekst', async () => {
    const { f, polje, unesi, host } = napravi();
    unesi('10');
    polje().dispatchEvent(new Event('blur'));
    unesi('12');
    host.odgovori[0](null);
    await f.whenStable();
    f.detectChanges();
    expect(polje().value).toBe('12');
    polje().dispatchEvent(new Event('blur'));
    expect(host.cuvaj).toHaveBeenLastCalledWith(12);
  });
});
