import { ComponentRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NotificationStore } from '../../../core/state/notification.store';
import { ServerskiSat } from '../data-access/sat';
import { pomeriSat, saLaznimSatom } from '../lazni-sat.testing';
import { VremeIzvodjenjaComponent } from './vreme-izvodjenja.component';

const POCETAK = 1_000_000;

describe('VremeIzvodjenjaComponent', () => {
  let uspeh: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } }] });
    uspeh = vi.spyOn(TestBed.inject(NotificationStore), 'uspeh');
  });

  async function napravi(
    pocetakMs: number | null | undefined, id = 7, sat = new ServerskiSat(),
  ): Promise<ComponentFixture<VremeIzvodjenjaComponent>> {
    const f = TestBed.createComponent(VremeIzvodjenjaComponent);
    const ref: ComponentRef<VremeIzvodjenjaComponent> = f.componentRef;
    ref.setInput('izvodjenjeId', id);
    ref.setInput('pocetakMs', pocetakMs);
    ref.setInput('sat', sat);
    f.detectChanges();
    return f;
  }
  const el = (f: ComponentFixture<unknown>) => f.nativeElement as HTMLElement;
  const stoperica = (f: ComponentFixture<unknown>) => el(f).querySelector('.uz-vreme-stoperica')!.textContent!.trim();
  const dugme = (f: ComponentFixture<unknown>, oznaka: string) =>
    el(f).querySelector<HTMLButtonElement>(`button[aria-label="${oznaka}"]`)!;

  it('prikazuje proteklo vreme po serverskom satu i osvežava ga', saLaznimSatom(async () => {
    vi.setSystemTime(POCETAK);
    const f = await napravi(POCETAK - 65_000);
    expect(stoperica(f)).toBe('1:05');
    await pomeriSat(2_000);
    f.detectChanges();
    expect(stoperica(f)).toBe('1:07');
    f.destroy();
  }));

  it('pauza zaustavlja, nastavak nastavlja od tog broja', saLaznimSatom(async () => {
    vi.setSystemTime(POCETAK);
    const f = await napravi(POCETAK - 65_000);
    dugme(f, 'Pauziraj štopericu').click();
    await pomeriSat(10_000);
    f.detectChanges();
    expect(stoperica(f)).toBe('1:05');
    expect(dugme(f, 'Nastavi štopericu').getAttribute('aria-pressed')).toBe('true');
    dugme(f, 'Nastavi štopericu').click();
    await pomeriSat(3_000);
    f.detectChanges();
    expect(stoperica(f)).toBe('1:08');
    f.destroy();
  }));

  it('nulovanje vraća na 0:00, nudi Poništi, a Poništi vraća prethodno', saLaznimSatom(async () => {
    vi.setSystemTime(POCETAK);
    const f = await napravi(POCETAK - 65_000);
    dugme(f, 'Nuluj štopericu').click();
    f.detectChanges();
    expect(stoperica(f)).toBe('0:00');
    expect(uspeh).toHaveBeenCalledWith('Štoperica je nulovana.', expect.objectContaining({ label: 'Poništi' }));
    const akcija = uspeh.mock.calls[0][1] as { run: () => void };
    akcija.run();
    f.detectChanges();
    expect(stoperica(f)).toBe('1:05');
    f.destroy();
  }));

  it('nulovanje preživi novi prozor istog izvođenja, drugo izvođenje ima pun iznos', saLaznimSatom(async () => {
    vi.setSystemTime(POCETAK);
    const f = await napravi(POCETAK - 65_000);
    dugme(f, 'Nuluj štopericu').click();
    await pomeriSat(2_000);
    f.destroy();
    const isti = await napravi(POCETAK - 65_000);
    expect(stoperica(isti)).toBe('0:02');
    const drugi = await napravi(POCETAK - 65_000, 8);
    expect(stoperica(drugi)).toBe('1:07');
    isti.destroy();
    drugi.destroy();
  }));

  it('koristi serverski sat, ne sat uređaja', saLaznimSatom(async () => {
    vi.setSystemTime(POCETAK);
    const sat = new ServerskiSat();
    sat.azuriraj(Date.now() + 300_000);
    const f = await napravi(Date.now() + 300_000 - 60_000, 7, sat);
    expect(stoperica(f)).toBe('1:00');
    f.destroy();
  }));

  it('bez početka: "–:––" i dugmad onemogućena', saLaznimSatom(async () => {
    vi.setSystemTime(POCETAK);
    const f = await napravi(undefined);
    expect(stoperica(f)).toBe('–:––');
    expect(dugme(f, 'Pauziraj štopericu').disabled).toBe(true);
    expect(dugme(f, 'Nuluj štopericu').disabled).toBe(true);
    f.destroy();
  }));

  it('sat prikazuje HH:MM', saLaznimSatom(async () => {
    vi.setSystemTime(POCETAK);
    const f = await napravi(POCETAK);
    expect(el(f).querySelector('.uz-vreme-sat')!.textContent!.trim()).toMatch(/^\d{2}:\d{2}$/);
    f.destroy();
  }));
});
