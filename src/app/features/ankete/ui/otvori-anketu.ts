import { Signal } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';

import type { KontekstAnkete } from '../data-access/ankete.models';

/** Kontekst panela za pozivaoce iz drugih feature-a (konzola, daljinski, stranica predavanja): oni ne uvoze `data-access`. */
export type { KontekstAnkete };

/** Od ove širine panel ima dve kolone (prečice levo, provera i rezultati desno), a ispod nje je preko celog ekrana. */
export const SIROK_PANEL = '(min-width: 900px)';

/** Klasa okvira dijaloga na telefonu (bez zaobljenja, `styles/_ui.scss`). */
export const KLASA_PUN_EKRAN = 'gfs-anketa-pun-ekran';

/**
 * Otvara panel brze ankete (spec 6.1) kao dijalog: kod panela se učitava tek ovde (`import()`), pa konzola, daljinski i
 * stranica predavanja ne nose njegov kod. Kontekst je signal (konzola menja broj čekiranih uživo). Drugi dijalog otvoren
 * preko stranice: ništa (`null`).
 */
export async function otvoriAnketu(dialog: MatDialog, kontekst: Signal<KontekstAnkete>): Promise<MatDialogRef<unknown> | null> {
  if (dialog.openDialogs.length) {
    return null;
  }
  const { AnketaPanelDialog } = await import('./anketa-panel.dialog');
  if (dialog.openDialogs.length) {
    return null;
  }
  const siroko = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(SIROK_PANEL).matches;
  return dialog.open(AnketaPanelDialog, {
    data: kontekst,
    autoFocus: 'first-heading',
    restoreFocus: true,
    ariaLabelledBy: 'anketa-panel-naslov',
    ...(siroko
      ? { width: 'min(1100px, 96vw)', maxWidth: '96vw', height: 'min(760px, 92dvh)' }
      : { width: '100vw', maxWidth: '100vw', height: '100dvh', maxHeight: '100dvh', panelClass: KLASA_PUN_EKRAN }),
  });
}
