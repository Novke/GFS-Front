import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { CekiranStudent } from '../../../core/api/cekiranje.api';
import { CekiraniPanel } from './cekirani-panel';

const c = (studentId: number, ime: string, vreme: string, izmene: Partial<CekiranStudent> = {}): CekiranStudent => ({
  studentId, ime, prezime: 'Petrović', indeks: `GD${studentId}`, vreme, kasnio: false, istiTelefonKao: null, ...izmene,
});

describe('CekiraniPanel', () => {
  function prikazi(cekirani: CekiranStudent[]) {
    const f = TestBed.createComponent(CekiraniPanel);
    f.componentRef.setInput('cekirani', cekirani);
    f.detectChanges();
    return f.nativeElement as HTMLElement;
  }

  it('prikazujeKasnioIIstiTelefon: ime, HH:mm, "kasnio" i "isti telefon kao Ime Prezime"', () => {
    const el = prikazi([
      c(1, 'Ana', '2026-10-28T10:02:41.123456'),
      c(2, 'Marko', '2026-10-28T10:31:05', { kasnio: true }),
      c(3, 'Iva', '2026-10-28T10:03:00', { istiTelefonKao: 1 }),
    ]);
    expect(el.querySelector('h2')?.textContent).toContain('3');
    const ana = el.querySelector('[data-cekiran="1"]')!;
    expect(ana.textContent).toContain('Ana Petrović');
    expect(ana.textContent).toContain('10:02');
    expect(ana.querySelector('[data-kasnio]')).toBeNull();
    expect(ana.querySelector('[data-isti-telefon]')).toBeNull();
    expect(el.querySelector('[data-cekiran="2"] [data-kasnio]')?.textContent).toContain('kasnio');
    expect(el.querySelector('[data-cekiran="3"] [data-isti-telefon]')?.textContent?.trim()).toBe('isti telefon kao Ana Petrović');
  });

  it('prazna lista upućuje na Čekiranje', () => {
    const el = prikazi([]);
    expect(el.querySelector('[data-prazno]')?.textContent).toContain('Čekiranje');
  });
});
