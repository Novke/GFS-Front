import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { PREFS_KLJUC, PreferencesStore } from '../../../core/state/preferences.store';
import { BeleskePanelComponent } from './beleske-panel.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BeleskePanelComponent],
  template: `<app-beleske-panel [tekst]="tekst()" [kljucSlajda]="kljuc()" />`,
})
class DomacinComponent {
  readonly tekst = signal<string | null>('Prvi red\n\nTreći red');
  readonly kljuc = signal<number | null>(1);
}

describe('BeleskePanelComponent', () => {
  let fixture: ComponentFixture<DomacinComponent>;
  const el = () => fixture.nativeElement as HTMLElement;
  const telo = () => el().querySelector<HTMLElement>('.uz-beleske-telo')!;
  const dugme = (oznaka: string) => el().querySelector<HTMLButtonElement>(`button[aria-label="${oznaka}"]`)!;

  beforeEach(async () => {
    localStorage.clear();
    TestBed.resetTestingModule();
    fixture = TestBed.createComponent(DomacinComponent);
    await fixture.whenStable();
  });

  it('tekst čuva prelome redova i dugačke reči se lome', () => {
    const p = el().querySelector<HTMLElement>('.uz-beleske-tekst')!;
    expect(p.textContent).toContain('Prvi red\n\nTreći red');
    expect(p.classList.contains('uz-beleske-tekst')).toBe(true);
  });

  it('bez teksta prikazuje poruku', async () => {
    fixture.componentInstance.tekst.set(null);
    await fixture.whenStable();
    expect(el().querySelector('.uz-beleske-tekst')).toBeNull();
    expect(el().textContent).toContain('Nema beležaka za ovaj slajd.');
  });

  it('A+ povećava slova i postavku, A- na minimumu i A+ na maksimumu su onemogućeni', async () => {
    expect(telo().style.fontSize).toBe('18px');
    dugme('Veća slova beležaka').click();
    await fixture.whenStable();
    expect(telo().style.fontSize).toBe('20px');
    expect(TestBed.inject(PreferencesStore).velicinaBeleski()).toBe(20);

    const store = TestBed.inject(PreferencesStore);
    store.postaviVelicinuBeleski(14);
    await fixture.whenStable();
    expect(dugme('Manja slova beležaka').disabled).toBe(true);
    store.postaviVelicinuBeleski(40);
    await fixture.whenStable();
    expect(dugme('Veća slova beležaka').disabled).toBe(true);
    expect(localStorage.getItem(PREFS_KLJUC)).not.toBeNull();
  });

  it('telo je fokusabilna skrolabilna oblast sa nazivom', () => {
    expect(telo().getAttribute('tabindex')).toBe('0');
    expect(telo().getAttribute('role')).toBe('region');
    expect(telo().getAttribute('aria-label')).toBe('Beleške');
  });

  it('promena ključa slajda vraća skrol na vrh', async () => {
    telo().scrollTop = 500;
    fixture.componentInstance.kljuc.set(2);
    await fixture.whenStable();
    expect(telo().scrollTop).toBe(0);
  });
});
