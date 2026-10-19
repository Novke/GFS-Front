import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { Subject } from 'rxjs';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ObavestenjaStore } from '../state/obavestenja.store';
import { ObavestenjaMeni } from './obavestenja-meni';

describe('ObavestenjaMeni (zvono u gornjoj traci)', () => {
  // lenji panel (`import()` na klik) se učita jednom unapred, da prvo učitavanje ne kasni za proverom
  let Panel: unknown;
  beforeAll(async () => {
    Panel = (await import('./obavestenja-panel')).ObavestenjaPanel;
  });

  let broj: ReturnType<typeof signal<{ neprocitana: number; otvorena: number }>>;
  let pokreni: ReturnType<typeof vi.fn>;
  let otvori: ReturnType<typeof vi.fn>;
  let zatvoren: Subject<void>;

  beforeEach(() => {
    broj = signal({ neprocitana: 3, otvorena: 5 });
    pokreni = vi.fn();
    zatvoren = new Subject<void>();
    otvori = vi.fn(() => ({ afterClosed: () => zatvoren.asObservable() }));
    TestBed.configureTestingModule({
      providers: [
        { provide: ObavestenjaStore, useValue: { broj, pokreni } },
        { provide: MatDialog, useValue: { open: otvori, getDialogById: () => undefined } },
      ],
    });
  });

  function napravi() {
    const f = TestBed.createComponent(ObavestenjaMeni);
    f.detectChanges();
    const dugme = () => f.nativeElement.querySelector('button[data-obavestenja]') as HTMLButtonElement;
    const znacka = () => f.nativeElement.querySelector('[data-znacka]') as HTMLElement | null;
    return { f, dugme, znacka };
  }

  it('pokreće osvežavanje broja (živi koliko i ljuska)', () => {
    napravi();
    expect(pokreni).toHaveBeenCalledOnce();
  });

  it('značka pokazuje broj nepročitanih; 0 sakriva značku', () => {
    const { f, dugme, znacka } = napravi();
    expect(znacka()?.textContent?.trim()).toBe('3');
    expect(dugme().getAttribute('aria-label')).toBe('Obaveštenja: 3 nepročitana');

    broj.set({ neprocitana: 0, otvorena: 5 });
    f.detectChanges();
    expect(znacka()).toBeNull();
    expect(dugme().getAttribute('aria-label')).toBe('Obaveštenja');

    broj.set({ neprocitana: 140, otvorena: 140 });
    f.detectChanges();
    expect(znacka()?.textContent?.trim()).toBe('99+');
    expect(dugme().getAttribute('aria-label')).toBe('Obaveštenja: 140 nepročitanih');
  });

  it('klik otvara lenji panel ispod zvona; aria-expanded prati panel', async () => {
    const { f, dugme } = napravi();
    expect(dugme().getAttribute('aria-haspopup')).toBe('dialog');
    expect(dugme().getAttribute('aria-expanded')).toBe('false');
    dugme().click();
    await vi.waitFor(() => expect(otvori).toHaveBeenCalledOnce());
    f.detectChanges();
    expect(otvori.mock.calls[0][0]).toBe(Panel);
    const cfg = otvori.mock.calls[0][1] as { position: { top: string; right: string } };
    expect(cfg.position.top).toMatch(/^\d+px$/);
    expect(dugme().getAttribute('aria-expanded')).toBe('true');

    // drugi klik dok je otvoren ne otvara još jedan
    dugme().click();
    await new Promise(r => setTimeout(r));
    expect(otvori).toHaveBeenCalledOnce();

    zatvoren.next();
    f.detectChanges();
    expect(dugme().getAttribute('aria-expanded')).toBe('false');
  });
});
