import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { NotificationStore, Poruka } from './notification.store';

describe('NotificationStore', () => {
  it('emituje poruke redom sa tipom, tekstom i akcijom', () => {
    const store = TestBed.inject(NotificationStore);
    const primljene: Poruka[] = [];
    store.poruke$.subscribe(p => primljene.push(p));
    const run = vi.fn();

    store.uspeh('Sačuvano.', { label: 'Poništi', run });
    store.greska('Neuspelo.');
    store.info('Napomena.');

    expect(primljene).toEqual([
      { tip: 'uspeh', tekst: 'Sačuvano.', akcija: { label: 'Poništi', run } },
      { tip: 'greska', tekst: 'Neuspelo.', akcija: undefined },
      { tip: 'info', tekst: 'Napomena.', akcija: undefined },
    ]);
  });

  it('grupa se prenosi samo kad je zadata', () => {
    const store = TestBed.inject(NotificationStore);
    const primljene: Poruka[] = [];
    store.poruke$.subscribe(p => primljene.push(p));

    store.uspeh('Ana: zadatak', undefined, { grupa: 'predavanje' });
    store.info('Ana je već prisutna.', { grupa: 'predavanje' });
    store.uspeh('Sačuvano.');

    expect(primljene[0].grupa).toBe('predavanje');
    expect(primljene[1].grupa).toBe('predavanje');
    expect('grupa' in primljene[2]).toBe(false);
  });
});
