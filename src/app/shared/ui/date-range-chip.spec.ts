import { OverlayContainer } from '@angular/cdk/overlay';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { DateRangeChip, OpsegDatuma, opisOpsega } from './date-range-chip';

@Component({
  imports: [DateRangeChip],
  template: `<app-date-range-chip [opseg]="opseg()" (opsegChange)="promena($event)" />`,
})
class Host {
  opseg = signal<OpsegDatuma>({ od: null, do: null });
  promena = vi.fn();
}

describe('opisOpsega', () => {
  it('oba kraja u istoj godini, različite godine, samo od, samo do, prazno', () => {
    expect(opisOpsega({ od: '2025-10-01', do: '2025-10-14' })).toBe('1. 10. – 14. 10. 2025.');
    expect(opisOpsega({ od: '2025-12-20', do: '2026-01-10' })).toBe('20. 12. 2025. – 10. 1. 2026.');
    expect(opisOpsega({ od: '2025-10-01', do: null })).toBe('od 1. 10. 2025.');
    expect(opisOpsega({ od: null, do: '2025-10-14' })).toBe('do 14. 10. 2025.');
    expect(opisOpsega({ od: null, do: null })).toBeNull();
  });
});

describe('DateRangeChip', () => {
  const tick = () => new Promise(r => setTimeout(r));

  function napravi(opseg: OpsegDatuma = { od: null, do: null }) {
    const f = TestBed.createComponent(Host);
    f.componentInstance.opseg.set(opseg);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    const overlay = TestBed.inject(OverlayContainer).getContainerElement();
    return { f, el, overlay, h: f.componentInstance };
  }

  async function otvori(f: ReturnType<typeof napravi>) {
    f.el.querySelector<HTMLButtonElement>('[data-otvori]')!.click();
    f.f.detectChanges();
    await tick();
    const polje = (ime: string) => f.overlay.querySelector<HTMLInputElement>(`input[name=${ime}]`)!;
    const upisi = (ime: string, v: string) => {
      polje(ime).value = v;
      polje(ime).dispatchEvent(new Event('input'));
      f.f.detectChanges();
    };
    return { polje, upisi, primeni: () => f.overlay.querySelector<HTMLButtonElement>('[data-primeni]')! };
  }

  it('bez opsega: "Datum" bez x; sa opsegom: "Datum: …" i x briše oba kraja', () => {
    const prazno = napravi();
    expect(prazno.el.textContent).toContain('Datum');
    expect(prazno.el.querySelector('[data-ukloni]')).toBeNull();
    prazno.f.destroy();

    const pun = napravi({ od: '2025-10-01', do: '2025-10-14' });
    expect(pun.el.textContent!.replace(/\s+/g, ' ')).toContain('Datum: 1. 10. – 14. 10. 2025.');
    pun.el.querySelector<HTMLButtonElement>('[data-ukloni]')!.click();
    expect(pun.h.promena).toHaveBeenCalledExactlyOnceWith({ od: null, do: null });
  });

  it('panel: "Od" posle "Do" je greška i "Primeni" je onemogućeno; ispravan opseg se emituje', async () => {
    const t = napravi();
    const p = await otvori(t);
    expect(p.polje('od')).not.toBeNull();
    p.upisi('od', '2025-10-20');
    p.upisi('do', '2025-10-14');
    expect(t.overlay.textContent).toContain('Početni datum je posle krajnjeg.');
    expect(p.primeni().disabled).toBe(true);
    p.upisi('od', '2025-10-01');
    expect(p.primeni().disabled).toBe(false);
    p.primeni().click();
    expect(t.h.promena).toHaveBeenCalledExactlyOnceWith({ od: '2025-10-01', do: '2025-10-14' });
  });

  it('panel počinje sa trenutnim opsegom; jedan kraj je dovoljan', async () => {
    const t = napravi({ od: '2025-10-01', do: null });
    const p = await otvori(t);
    expect(p.polje('od').value).toBe('2025-10-01');
    expect(p.polje('do').value).toBe('');
    p.upisi('od', '');
    p.upisi('do', '2025-11-01');
    p.primeni().click();
    expect(t.h.promena).toHaveBeenCalledExactlyOnceWith({ od: null, do: '2025-11-01' });
  });
});
