import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NotificationStore, Poruka } from '../state/notification.store';
import { SnackbarHost } from './snackbar-host';

describe('SnackbarHost', () => {
  let poruke: Subject<Poruka>;
  let open: ReturnType<typeof vi.fn>;
  let onAction: Subject<void>;

  beforeEach(() => {
    poruke = new Subject<Poruka>();
    onAction = new Subject<void>();
    open = vi.fn(() => ({ onAction: () => onAction.asObservable() }));
    TestBed.configureTestingModule({
      providers: [
        { provide: NotificationStore, useValue: { poruke$: poruke.asObservable() } },
        { provide: MatSnackBar, useValue: { open } },
      ],
    });
    TestBed.createComponent(SnackbarHost);
  });

  it('uspeh traje 3 s i javlja se pristojno', () => {
    poruke.next({ tip: 'uspeh', tekst: 'Sačuvano.' });
    expect(open).toHaveBeenCalledWith('Sačuvano.', undefined, expect.objectContaining({ duration: 3000, politeness: 'polite' }));
  });

  it('greška ostaje do zatvaranja i javlja se odmah (assertive)', () => {
    poruke.next({ tip: 'greska', tekst: 'Neuspelo.' });
    const cfg = open.mock.calls[0][2];
    expect(open.mock.calls[0][1]).toBe('Zatvori');
    expect(cfg.politeness).toBe('assertive');
    expect(cfg.duration).toBeUndefined();
  });

  it('akcija se prikazuje kao dugme i pokreće run', () => {
    const run = vi.fn();
    poruke.next({ tip: 'uspeh', tekst: 'Obrisano.', akcija: { label: 'Poništi', run } });
    expect(open.mock.calls[0][1]).toBe('Poništi');
    onAction.next();
    expect(run).toHaveBeenCalledOnce();
  });
});
