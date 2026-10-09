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
  let zatvorene: Subject<void>[];

  beforeEach(() => {
    poruke = new Subject<Poruka>();
    onAction = new Subject<void>();
    zatvorene = [];
    open = vi.fn(() => {
      const zatvorena = new Subject<void>();
      zatvorene.push(zatvorena);
      return { onAction: () => onAction.asObservable(), afterDismissed: () => zatvorena.asObservable() };
    });
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

  it('uspeh i info sa akcijom traju 6 s', () => {
    poruke.next({ tip: 'uspeh', tekst: 'Obrisano.', akcija: { label: 'Poništi', run: vi.fn() } });
    zatvorene[0].next();
    poruke.next({ tip: 'info', tekst: 'Info.', akcija: { label: 'Poništi', run: vi.fn() } });
    expect(open.mock.calls[0][2].duration).toBe(6000);
    expect(open.mock.calls[1][2].duration).toBe(6000);
  });

  it('uspeh posle otvorene greške čeka: greška ostaje do zatvaranja', () => {
    poruke.next({ tip: 'greska', tekst: 'Neuspelo.' });
    poruke.next({ tip: 'uspeh', tekst: 'Sačuvano.' });
    expect(open).toHaveBeenCalledOnce();

    zatvorene[0].next();
    expect(open).toHaveBeenCalledTimes(2);
    expect(open.mock.calls[1][0]).toBe('Sačuvano.');
  });

  it('poruke se prikazuju redom, jedna po jedna', () => {
    poruke.next({ tip: 'uspeh', tekst: 'A' });
    poruke.next({ tip: 'info', tekst: 'B' });
    poruke.next({ tip: 'uspeh', tekst: 'C' });
    expect(open.mock.calls.map(c => c[0])).toEqual(['A']);
    zatvorene[0].next();
    zatvorene[1].next();
    expect(open.mock.calls.map(c => c[0])).toEqual(['A', 'B', 'C']);
  });

  describe('grupa (live beleženje: samo poslednja izmena nosi "Poništi")', () => {
    let dismiss: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      dismiss = vi.fn(() => zatvorene[zatvorene.length - 1].next());
      open.mockImplementation(() => {
        const zatvorena = new Subject<void>();
        zatvorene.push(zatvorena);
        return { onAction: () => onAction.asObservable(), afterDismissed: () => zatvorena.asObservable(), dismiss };
      });
    });

    it('nova poruka iste grupe zatvara otvorenu i zauzima njeno mesto', () => {
      poruke.next({ tip: 'uspeh', tekst: 'Ana: prisutan', grupa: 'p' });
      poruke.next({ tip: 'uspeh', tekst: 'Ana: zadatak', grupa: 'p' });
      expect(dismiss).toHaveBeenCalledOnce();
      expect(open.mock.calls.map(c => c[0])).toEqual(['Ana: prisutan', 'Ana: zadatak']);
    });

    it('poruke iste grupe u redu se zamenjuju poslednjom; druge poruke ostaju', () => {
      poruke.next({ tip: 'greska', tekst: 'Neuspelo.' });
      poruke.next({ tip: 'uspeh', tekst: 'Ana: prisutan', grupa: 'p' });
      poruke.next({ tip: 'info', tekst: 'B' });
      poruke.next({ tip: 'uspeh', tekst: 'Ana: zadatak', grupa: 'p' });
      expect(dismiss).not.toHaveBeenCalled(); // otvorena greška se nikad ne zatvara zamenom
      zatvorene[0].next();
      zatvorene[1].next();
      expect(open.mock.calls.map(c => c[0])).toEqual(['Neuspelo.', 'B', 'Ana: zadatak']);
    });

    it('nova greška iste grupe zamenjuje ranije greške te grupe (otvorenu i one u redu), druge greške ostaju', () => {
      poruke.next({ tip: 'greska', tekst: 'Nije sačuvano za 1 studenta.', grupa: 'g' });
      poruke.next({ tip: 'greska', tekst: 'Druga greška.' });
      poruke.next({ tip: 'greska', tekst: 'Nije sačuvano za 2 studenta.', grupa: 'g' });
      poruke.next({ tip: 'greska', tekst: 'Nije sačuvano za 3 studenta.', grupa: 'g' });
      zatvorene[zatvorene.length - 1].next();
      zatvorene[zatvorene.length - 1].next();
      expect(open.mock.calls.map(c => c[0])).toEqual(['Nije sačuvano za 1 studenta.', 'Druga greška.', 'Nije sačuvano za 3 studenta.']);
    });

    it('greška sa grupom se ne zamenjuje uspehom ni infom', () => {
      poruke.next({ tip: 'greska', tekst: 'Ana: odbijeno', grupa: 'p' });
      poruke.next({ tip: 'uspeh', tekst: 'Ana: zadatak', grupa: 'p' });
      expect(dismiss).not.toHaveBeenCalled();
      expect(open).toHaveBeenCalledOnce();
    });
  });
});
