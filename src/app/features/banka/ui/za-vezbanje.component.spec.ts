import { OverlayContainer } from '@angular/cdk/overlay';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NotificationStore } from '../../../core/state/notification.store';
import { OtvorenoZaGrupu } from '../data-access/banka.models';
import { nazivGrupe, opisOtvorenosti, ZaVezbanjeComponent } from './za-vezbanje.component';

function stanje(grupaId: number, izmena: Partial<OtvorenoZaGrupu> = {}): OtvorenoZaGrupu {
  return {
    grupaId, naziv: `G${grupaId}`, godinaUpisa: 2025, stanje: 'ZATVORENO', izvor: null, prviPut: null, tema: null,
    otvorenihListova: 0, listova: 3, ...izmena,
  };
}

const STANJA: OtvorenoZaGrupu[] = [
  stanje(1, { stanje: 'OTVORENO', izvor: 'CAS', prviPut: '2026-10-21T10:15:00', otvorenihListova: 3 }),
  stanje(2, { stanje: 'PREKO_TEME', tema: 'Konverzije brojeva', otvorenihListova: 3 }),
  stanje(3, { stanje: 'DELIMICNO', otvorenihListova: 1 }),
  stanje(4),
];

@Component({
  imports: [ZaVezbanjeComponent],
  template: `<app-za-vezbanje [grupaId]="grupaId()" [predmetId]="7" />`,
})
class Host {
  grupaId = signal(5);
}

describe('opisOtvorenosti i nazivGrupe', () => {
  it('tekst po stanju: izvor i datum, tema pretka, deo tipova, zatvoreno', () => {
    expect(opisOtvorenosti(STANJA[0])).toBe('Otvoreno posle časa 21. 10. 2026.');
    expect(opisOtvorenosti({ ...STANJA[0], izvor: 'RUCNO' })).toBe('Otvoreno ručno 21. 10. 2026.');
    expect(opisOtvorenosti(STANJA[1])).toBe('Otvoreno preko teme „Konverzije brojeva“');
    expect(opisOtvorenosti(STANJA[2])).toBe('Delimično: 1 od 3 tipa');
    expect(opisOtvorenosti({ ...STANJA[2], listova: 5 })).toBe('Delimično: 1 od 5 tipova');
    expect(opisOtvorenosti(STANJA[3])).toBe('Zatvoreno');
  });

  it('naziv sa generacijom, bez nje kad je nema', () => {
    expect(nazivGrupe(STANJA[0])).toBe('G1 (2025)');
    expect(nazivGrupe({ naziv: 'G9', godinaUpisa: null })).toBe('G9');
  });
});

describe('ZaVezbanjeComponent', () => {
  let http: HttpTestingController;
  let uspeh: ReturnType<typeof vi.fn>;
  let greska: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    uspeh = vi.fn();
    greska = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
        { provide: NotificationStore, useValue: { uspeh, greska } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function napravi() {
    const f = TestBed.createComponent(Host);
    document.body.appendChild(f.nativeElement);
    await f.whenStable();
    const el = f.nativeElement as HTMLElement;
    const stabilno = async () => {
      await f.whenStable();
      await new Promise(r => setTimeout(r));
      await f.whenStable();
    };
    return { f, el, stabilno };
  }
  const overlay = () => TestBed.inject(OverlayContainer).getContainerElement();
  const tekst = (e: Element | null) => e!.textContent!.replace(/\s+/g, ' ').trim();

  it('čita stanje čvora i pokazuje radnje po stanju (preko teme: bez dugmeta)', async () => {
    const { el, stabilno } = await napravi();
    expect(el.querySelector('section')!.getAttribute('aria-busy')).toBe('true');
    http.expectOne('api/banka/grupe/5/otvoreno').flush(STANJA);
    await stabilno();
    const red = (id: number) => el.querySelector<HTMLElement>(`[data-grupa="${id}"]`)!;
    expect(tekst(red(1))).toContain('G1 (2025)');
    expect(red(1).querySelector('[data-zatvori]')).not.toBeNull();
    expect(red(1).querySelector('[data-otvori]')).toBeNull();
    expect(red(2).querySelector('button')).toBeNull();
    expect(red(3).querySelector('[data-zatvori]')).not.toBeNull();
    expect(red(3).querySelector('[data-otvori]')).not.toBeNull();
    expect(red(4).querySelector('[data-otvori]')!.getAttribute('aria-label')).toBe('Otvori za grupu G4 (2025)');
    expect(red(4).querySelector('[data-zatvori]')).toBeNull();
    const veza = el.querySelector<HTMLAnchorElement>('a[data-statistika]')!;
    expect(veza.getAttribute('href')).toBe('/banka/vezbanje?predmet=7');
  });

  it('prazna lista: poruka da nijedna grupa nema predavanje', async () => {
    const { el, stabilno } = await napravi();
    http.expectOne('api/banka/grupe/5/otvoreno').flush([]);
    await stabilno();
    expect(el.querySelector('[data-prazno]')).not.toBeNull();
  });

  it('greška čitanja ide u panel (tiho, bez globalnog snackbara)', async () => {
    const { el, stabilno } = await napravi();
    http.expectOne('api/banka/grupe/5/otvoreno').flush({ reason: 'Tip nije u banci za predavanja.' }, { status: 404, statusText: 'Not Found' });
    await stabilno();
    expect(tekst(el.querySelector('[data-greska]'))).toBe('Stanje vežbanja nije učitano. Tip nije u banci za predavanja.');
  });

  it('"Otvori" pita, šalje PUT i prikazuje stanje iz odgovora; Odustani ne šalje ništa', async () => {
    const { el, stabilno } = await napravi();
    http.expectOne('api/banka/grupe/5/otvoreno').flush(STANJA);
    await stabilno();
    el.querySelector<HTMLButtonElement>('[data-grupa="4"] [data-otvori]')!.click();
    await stabilno();
    expect(tekst(overlay().querySelector('[role=alertdialog] h2'))).toBe('Otvori za vežbanje grupi G4 (2025)?');
    overlay().querySelector<HTMLButtonElement>('[data-odustani]')!.click();
    await stabilno();
    http.expectNone('api/banka/grupe/5/otvoreno/4');

    el.querySelector<HTMLButtonElement>('[data-grupa="4"] [data-otvori]')!.click();
    await stabilno();
    overlay().querySelector<HTMLButtonElement>('[data-potvrdi]')!.click();
    await stabilno();
    const put = http.expectOne('api/banka/grupe/5/otvoreno/4');
    expect(put.request.method).toBe('PUT');
    expect(el.querySelector('[data-grupa="4"] [data-otvori]')!.getAttribute('aria-disabled')).toBe('true');
    put.flush([...STANJA.slice(0, 3), stanje(4, { stanje: 'OTVORENO', izvor: 'RUCNO', prviPut: '2026-10-29T09:00:00', otvorenihListova: 3 })]);
    await stabilno();
    expect(el.querySelector('[data-grupa="4"]')!.getAttribute('data-stanje')).toBe('OTVORENO');
    expect(tekst(el.querySelector('[data-grupa="4"]'))).toContain('Otvoreno ručno 29. 10. 2026.');
    expect(uspeh).toHaveBeenCalledExactlyOnceWith('Otvoreno za vežbanje.');
  });

  it('"Zatvori" šalje DELETE; greška ide u NotificationStore, a dugme se oslobađa', async () => {
    const { el, stabilno } = await napravi();
    http.expectOne('api/banka/grupe/5/otvoreno').flush(STANJA);
    await stabilno();
    el.querySelector<HTMLButtonElement>('[data-grupa="1"] [data-zatvori]')!.click();
    await stabilno();
    expect(tekst(overlay().querySelector('[role=alertdialog] mat-dialog-content'))).toContain('i oni otvoreni posle časa');
    overlay().querySelector<HTMLButtonElement>('[data-potvrdi]')!.click();
    await stabilno();
    const del = http.expectOne('api/banka/grupe/5/otvoreno/1');
    expect(del.request.method).toBe('DELETE');
    del.flush({ reason: 'Grupa ne postoji.' }, { status: 404, statusText: 'Not Found' });
    await stabilno();
    expect(greska).toHaveBeenCalledExactlyOnceWith('Grupa ne postoji.');
    expect(el.querySelector('[data-grupa="1"] [data-zatvori]')!.getAttribute('aria-disabled')).not.toBe('true');
  });

  it('drugi čvor (nova vrednost ulaza) čita stanje ponovo', async () => {
    const { f, stabilno } = await napravi();
    http.expectOne('api/banka/grupe/5/otvoreno').flush(STANJA);
    f.componentInstance.grupaId.set(6);
    await stabilno();
    http.expectOne('api/banka/grupe/6/otvoreno').flush([]);
  });
});
