import { OverlayContainer } from '@angular/cdk/overlay';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MatIconRegistry } from '@angular/material/icon';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { VarijantaInfo } from '../data-access/banka.models';
import { VarijantaKarticaComponent } from './varijanta-kartica.component';

function varijanta(izmena: Partial<VarijantaInfo> = {}): VarijantaInfo {
  return {
    id: 11, grupaId: 2, rb: 1, naziv: '1011 u dekadni', status: 'NACRT', izvor: 'RUCNO', renderStatus: 'OK',
    svgId: 'b0000000-0000-4000-8000-000000000011', resenjeSvgId: null, izmenjeno: '2026-10-15T10:00:00', ikadOdobrena: false,
    zamenjuje: null, serija: null, nivo: 2, ...izmena,
  };
}

@Component({
  imports: [VarijantaKarticaComponent],
  template: `<app-varijanta-kartica [varijanta]="v()" [zauzeto]="zauzeto()" (odobri)="odobri()" (arhiviraj)="arhiviraj()"
    (vratiUNacrt)="vratiUNacrt()" (dupliraj)="dupliraj()" (obrisi)="obrisi()" (nivoPromena)="nivoPromena($event)" />`,
})
class Host {
  v = signal(varijanta());
  zauzeto = signal(false);
  odobri = vi.fn();
  arhiviraj = vi.fn();
  vratiUNacrt = vi.fn();
  dupliraj = vi.fn();
  obrisi = vi.fn();
  nivoPromena = vi.fn();
}

describe('VarijantaKarticaComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } }],
    });
    vi.spyOn(TestBed.inject(MatIconRegistry), 'getNamedSvgIcon').mockReturnValue(of(document.createElementNS('http://www.w3.org/2000/svg', 'svg')));
  });

  async function napravi(izmena: Partial<VarijantaInfo> = {}) {
    const f = TestBed.createComponent(Host);
    f.componentInstance.v.set(varijanta(izmena));
    await f.whenStable();
    const el = f.nativeElement as HTMLElement;
    const meni = async () => {
      el.querySelector<HTMLButtonElement>('button[data-meni]')!.click();
      await f.whenStable();
      return [...TestBed.inject(OverlayContainer).getContainerElement().querySelectorAll<HTMLButtonElement>('[role=menuitem]')];
    };
    return { f, el, h: f.componentInstance, meni };
  }

  const nazivi = (stavke: HTMLElement[]) => stavke.map(s => s.textContent!.trim());

  it('uspeo render: slika SVG-a sa javne putanje medija i alt po nazivu, link na editor varijante', async () => {
    const { el } = await napravi();
    const img = el.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('api/public/mediji/b0000000-0000-4000-8000-000000000011');
    expect(img.getAttribute('alt')).toBe('Zadatak 1011 u dekadni');
    expect(el.querySelector('a')!.getAttribute('href')).toBe('/banka/varijante/11');
    expect(el.querySelector('app-status-chip')!.textContent!.trim()).toBe('Nacrt');
  });

  it('bez naziva alt i naslov koriste redni broj', async () => {
    const { el } = await napravi({ naziv: null, rb: 3 });
    expect(el.querySelector('img')!.getAttribute('alt')).toBe('Zadatak 3');
    expect(el.querySelector('a')!.textContent).toContain('Zadatak 3');
  });

  it('greška rendera i render na čekanju imaju zamenu umesto slike', async () => {
    const greska = await napravi({ renderStatus: 'GRESKA', svgId: 'stari-svg' });
    expect(greska.el.querySelector('img')).toBeNull();
    expect(greska.el.textContent).toContain('Greška u LaTeX-u');
    const ceka = await napravi({ renderStatus: 'CEKA', svgId: null });
    expect(ceka.el.querySelector('img')).toBeNull();
    expect(ceka.el.textContent).toContain('Nije renderovano');
  });

  it('nacrt sa uspelim renderom: Odobri, Dupliraj, Obriši', async () => {
    const { h, meni, f } = await napravi();
    let stavke = await meni();
    expect(nazivi(stavke)).toEqual(['Uredi', 'Odobri', 'Dupliraj', 'Obriši']);
    expect(stavke[0].getAttribute('href')).toBe('/banka/varijante/11');
    stavke[1].click();
    expect(h.odobri).toHaveBeenCalledOnce();
    await f.whenStable();
    stavke = await meni();
    stavke[3].click();
    expect(h.obrisi).toHaveBeenCalledOnce();
  });

  it('nacrt sa greškom rendera ne nudi Odobri', async () => {
    const { meni } = await napravi({ renderStatus: 'GRESKA', svgId: null });
    expect(nazivi(await meni())).toEqual(['Uredi', 'Dupliraj', 'Obriši']);
  });

  it('aktivna: Arhiviraj; arhivirana: Vrati u nacrt', async () => {
    const aktivna = await napravi({ status: 'AKTIVNA' });
    const stavke = await aktivna.meni();
    expect(nazivi(stavke)).toEqual(['Uredi', 'Arhiviraj', 'Dupliraj', 'Obriši']);
    stavke[1].click();
    expect(aktivna.h.arhiviraj).toHaveBeenCalledOnce();
    await aktivna.f.whenStable();
    aktivna.f.destroy();

    const arhivirana = await napravi({ status: 'ARHIVIRANA' });
    const druge = await arhivirana.meni();
    expect(nazivi(druge)).toEqual(['Uredi', 'Vrati u nacrt', 'Dupliraj', 'Obriši']);
    druge[1].click();
    expect(arhivirana.h.vratiUNacrt).toHaveBeenCalledOnce();
    expect(arhivirana.el.querySelector('app-status-chip')!.textContent!.trim()).toBe('Arhivirana');
  });

  it('zauzeto: Dupliraj i Obriši su onemogućeni i ne emituju', async () => {
    const { h, meni, f } = await napravi();
    h.zauzeto.set(true);
    await f.whenStable();
    const stavke = await meni();
    expect(stavke.map(s => s.getAttribute('aria-disabled') === 'true')).toEqual([false, false, true, true]);
    stavke[2].click();
    expect(h.dupliraj).not.toHaveBeenCalled();
  });

  it('dugme menija ima ime sa nazivom varijante', async () => {
    const { el } = await napravi();
    expect(el.querySelector('button[data-meni]')!.getAttribute('aria-label')).toBe('Radnje za varijantu 1011 u dekadni');
  });

  it('nivo: prikazuje nivo varijante kao radio grupu, a izbor emituje samo novi nivo', async () => {
    const { el, h } = await napravi({ nivo: 1 });
    const radio = (n: number) => el.querySelector<HTMLButtonElement>(`[role=radio][data-nivo="${n}"]`)!;
    expect([1, 2, 3].map(n => radio(n).getAttribute('aria-checked'))).toEqual(['true', 'false', 'false']);
    radio(3).click();
    expect(h.nivoPromena).toHaveBeenCalledExactlyOnceWith(3);
    h.nivoPromena.mockClear();
    radio(1).click();
    expect(h.nivoPromena).not.toHaveBeenCalled();
  });

  it('nivo je dostupan u svakom statusu, a ne menja status (arhivirana i aktivna)', async () => {
    for (const status of ['AKTIVNA', 'ARHIVIRANA'] as const) {
      const { el, h, f } = await napravi({ status, nivo: 2 });
      el.querySelector<HTMLButtonElement>('[role=radio][data-nivo="3"]')!.click();
      expect(h.nivoPromena).toHaveBeenCalledExactlyOnceWith(3);
      f.destroy();
    }
  });
});
