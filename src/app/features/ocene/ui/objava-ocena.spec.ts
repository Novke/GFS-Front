import { OverlayContainer } from '@angular/cdk/overlay';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LOCAL_ERRORS } from '../../../core/api/api-error';
import { NotificationStore } from '../../../core/state/notification.store';
import { ObjavaOcena } from './objava-ocena';

@Component({
  imports: [ObjavaOcena],
  template: `<app-objava-ocena [predmetId]="5" [grupaId]="grupa()" />`,
})
class Host {
  grupa = signal(2);
}

const NIJE = { predmetId: 5, grupaId: 2, objavljeno: null, studenata: 0 };
const JESTE = { predmetId: 5, grupaId: 2, objavljeno: '2026-10-29T10:05:00', studenata: 21 };

describe('ObjavaOcena', () => {
  let http: HttpTestingController;
  let uspeh: ReturnType<typeof vi.fn>;
  let greska: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    uspeh = vi.fn();
    greska = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
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
  const stanje = (grupa = 2) => http.expectOne(r => r.url === 'api/ocenjivanje/predmet/5/objava' && r.params.get('grupa') === String(grupa));

  it('nije objavljeno: tekst i "Objavi predloge", bez "Povuci"; čitanje je tiho', async () => {
    const { el, stabilno } = await napravi();
    const req = stanje();
    expect(req.request.context.get(LOCAL_ERRORS)).toBe(true);
    req.flush(NIJE);
    await stabilno();
    expect(tekst(el.querySelector('[data-objava] p'))).toBe('Studenti još ne vide predloge ocena ni bodove.');
    expect(tekst(el.querySelector('[data-objavi]'))).toBe('Objavi predloge');
    expect(el.querySelector('[data-povuci]')).toBeNull();
  });

  it('objavljeno: datum, broj studenata, "Objavi ponovo" i "Povuci"', async () => {
    const { el, stabilno } = await napravi();
    stanje().flush(JESTE);
    await stabilno();
    expect(tekst(el.querySelector('[data-objava] p'))).toContain('Objavljeno studentima 29. 10. 2026. 10:05 (21 student)');
    expect(tekst(el.querySelector('[data-objavi]'))).toBe('Objavi ponovo');
    expect(el.querySelector('[data-povuci]')).not.toBeNull();
  });

  it('"Objavi predloge": potvrda, PUT bez tela, poruka uspeha i novo čitanje; Odustani ne šalje ništa', async () => {
    const { el, stabilno } = await napravi();
    stanje().flush(NIJE);
    await stabilno();
    el.querySelector<HTMLButtonElement>('[data-objavi]')!.click();
    await stabilno();
    expect(tekst(overlay().querySelector('[role=alertdialog] h2'))).toBe('Objaviti predloge ocena?');
    overlay().querySelector<HTMLButtonElement>('[data-odustani]')!.click();
    await stabilno();
    http.expectNone('api/ocenjivanje/predmet/5/objava/2');
    expect((el.querySelector('[data-objavi]') as HTMLButtonElement).disabled).toBe(false);

    el.querySelector<HTMLButtonElement>('[data-objavi]')!.click();
    await stabilno();
    overlay().querySelector<HTMLButtonElement>('[data-potvrdi]')!.click();
    await stabilno();
    const put = http.expectOne('api/ocenjivanje/predmet/5/objava/2');
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toBeNull();
    put.flush(JESTE);
    await stabilno();
    expect(uspeh).toHaveBeenCalledExactlyOnceWith('Predlozi ocena su objavljeni.');
    stanje().flush(JESTE);
    await stabilno();
    expect(el.querySelector('[data-povuci]')).not.toBeNull();
  });

  it('"Povuci": DELETE posle potvrde; greška ide u NotificationStore', async () => {
    const { el, stabilno } = await napravi();
    stanje().flush(JESTE);
    await stabilno();
    el.querySelector<HTMLButtonElement>('[data-povuci]')!.click();
    await stabilno();
    expect(tekst(overlay().querySelector('[role=alertdialog] h2'))).toBe('Povući objavu?');
    overlay().querySelector<HTMLButtonElement>('[data-potvrdi]')!.click();
    await stabilno();
    const del = http.expectOne('api/ocenjivanje/predmet/5/objava/2');
    expect(del.request.method).toBe('DELETE');
    del.flush({ reason: 'Nije pronađeno.' }, { status: 404, statusText: 'Not Found' });
    await stabilno();
    expect(greska).toHaveBeenCalledExactlyOnceWith('Nije pronađeno.');
    expect(uspeh).not.toHaveBeenCalled();
  });

  it('greška čitanja: poruka umesto trake; druga grupa čita ponovo', async () => {
    const { f, el, stabilno } = await napravi();
    stanje().flush({ reason: 'Grupa ne postoji.' }, { status: 404, statusText: 'Not Found' });
    await stabilno();
    expect(tekst(el.querySelector('[role=alert]'))).toBe('Stanje objave nije učitano: Grupa ne postoji.');
    f.componentInstance.grupa.set(3);
    await stabilno();
    stanje(3).flush({ ...NIJE, grupaId: 3 });
    await stabilno();
    expect(el.querySelector('[data-objava]')).not.toBeNull();
  });
});
