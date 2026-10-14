import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LOCAL_ERRORS } from '../../../core/api/api-error';
import { WaLinkDialog, WaLinkDialogCfg } from './wa-link-dialog';

const LINK = 'https://chat.whatsapp.com/AbCdEfGhIj1234567890Kl';

describe('WaLinkDialog', () => {
  let http: HttpTestingController;
  let f: ComponentFixture<WaLinkDialog>;
  const zatvori = vi.fn();

  function napravi(cfg: Partial<WaLinkDialogCfg> = {}): HTMLElement {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MAT_DIALOG_DATA, useValue: { grupa: { id: 4, naziv: 'GD-2026' }, waLink: null, ...cfg } },
        { provide: MatDialogRef, useValue: { close: zatvori } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    f = TestBed.createComponent(WaLinkDialog);
    f.detectChanges();
    return f.nativeElement as HTMLElement;
  }

  async function osvezi(): Promise<void> {
    f.detectChanges();
    await f.whenStable();
    f.detectChanges();
  }

  async function unesi(el: HTMLElement, vrednost: string): Promise<void> {
    const polje = el.querySelector<HTMLInputElement>('[data-wa-polje]')!;
    polje.value = vrednost;
    polje.dispatchEvent(new Event('input'));
    await osvezi();
  }

  beforeEach(() => zatvori.mockReset());
  afterEach(() => http.verify());

  it('čuva link (PATCH sa tihim greškama) i vraća sačuvan', async () => {
    const el = napravi();
    expect(el.querySelector('[data-ukloni]')).toBeNull();
    await unesi(el, '  chat.whatsapp.com/AbCdEfGhIj1234567890Kl?mode=x ');
    el.querySelector<HTMLButtonElement>('[data-sacuvaj]')!.click();
    const req = http.expectOne('api/grupe/4/wa-link');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ waLink: 'chat.whatsapp.com/AbCdEfGhIj1234567890Kl?mode=x' });
    expect(req.request.context.get(LOCAL_ERRORS)).toBe(true);
    req.flush({ waLink: LINK });
    expect(zatvori).toHaveBeenCalledWith({ waLink: LINK });
  });

  it('prazno polje se ne šalje; postojeći link se uklanja dugmetom', async () => {
    const el = napravi({ waLink: LINK });
    expect(el.querySelector<HTMLInputElement>('[data-wa-polje]')!.value).toBe(LINK);
    await unesi(el, '   ');
    el.querySelector<HTMLButtonElement>('[data-sacuvaj]')!.click();
    await osvezi();
    http.expectNone('api/grupe/4/wa-link');
    expect(el.textContent).toContain('Unesi link ili izaberi „Ukloni link“.');

    el.querySelector<HTMLButtonElement>('[data-ukloni]')!.click();
    const req = http.expectOne('api/grupe/4/wa-link');
    expect(req.request.body).toEqual({ waLink: null });
    req.flush({ waLink: null });
    expect(zatvori).toHaveBeenCalledWith({ waLink: null });
  });

  it('poruka servera ide u traku, dijalog ostaje otvoren', async () => {
    const el = napravi();
    await unesi(el, 'https://evil.example/x');
    el.querySelector<HTMLButtonElement>('[data-sacuvaj]')!.click();
    http.expectOne('api/grupe/4/wa-link').flush({ reason: 'Link mora biti poziv u WhatsApp grupu.' }, { status: 400, statusText: 'Bad Request' });
    await osvezi();
    expect(el.textContent).toContain('Link mora biti poziv u WhatsApp grupu.');
    expect(zatvori).not.toHaveBeenCalled();
    expect(el.querySelector<HTMLButtonElement>('[data-sacuvaj]')!.disabled).toBe(false);
  });
});
