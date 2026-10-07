import { OverlayContainer } from '@angular/cdk/overlay';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfirmDialog } from './confirm-dialog';

const CFG = { naslov: 'Obrisati predavanje?', tekst: 'Briše se predavanje i 31 aktivnost.', potvrdi: 'Obriši', destruktivno: true };

describe('ConfirmDialog', () => {
  let dialog: MatDialog;
  let overlay: HTMLElement;

  beforeEach(() => {
    dialog = TestBed.inject(MatDialog);
    overlay = TestBed.inject(OverlayContainer).getContainerElement();
  });

  const tick = () => new Promise(r => setTimeout(r));

  it('prikazuje naslov, tekst i dugme potvrde', async () => {
    ConfirmDialog.otvori(dialog, CFG).subscribe();
    await tick();
    expect(overlay.textContent).toContain('Obrisati predavanje?');
    expect(overlay.textContent).toContain('Briše se predavanje i 31 aktivnost.');
    expect(overlay.textContent).toContain('Obriši');
    expect(overlay.textContent).toContain('Odustani');
    dialog.closeAll();
  });

  it('klik na potvrdu vraća true', async () => {
    const rez = vi.fn();
    ConfirmDialog.otvori(dialog, CFG).subscribe(rez);
    await tick();
    overlay.querySelector<HTMLButtonElement>('[data-potvrdi]')!.click();
    await vi.waitFor(() => expect(rez).toHaveBeenCalled());
    expect(rez).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('Odustani vraća false', async () => {
    const rez = vi.fn();
    ConfirmDialog.otvori(dialog, CFG).subscribe(rez);
    await tick();
    overlay.querySelector<HTMLButtonElement>('[data-odustani]')!.click();
    await vi.waitFor(() => expect(rez).toHaveBeenCalled());
    expect(rez).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('Esc vraća false', async () => {
    const rez = vi.fn();
    ConfirmDialog.otvori(dialog, CFG).subscribe(rez);
    await tick();
    const panel = overlay.querySelector('mat-dialog-container')!;
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
    await vi.waitFor(() => expect(rez).toHaveBeenCalled());
    expect(rez).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('destruktivna varijanta počinje fokusom na "Odustani"', async () => {
    ConfirmDialog.otvori(dialog, CFG).subscribe();
    await vi.waitFor(() => expect(document.activeElement).toBe(overlay.querySelector('[data-odustani]')));
    dialog.closeAll();
  });

  it('nedestruktivna varijanta počinje fokusom na potvrdi', async () => {
    ConfirmDialog.otvori(dialog, { ...CFG, destruktivno: false }).subscribe();
    await vi.waitFor(() => expect(document.activeElement).toBe(overlay.querySelector('[data-potvrdi]')));
    dialog.closeAll();
  });
});
