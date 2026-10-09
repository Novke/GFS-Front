import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';

import { ConfirmDialog } from '../ui/confirm-dialog';

/** Komponenta duže forme koja štiti nesačuvane izmene. */
export interface NemaNesacuvanih {
  imaNesacuvanihIzmena(): boolean;
}

/** `CanDeactivate`: sa nesačuvanim izmenama pita za potvrdu napuštanja. */
export const unsavedChangesGuard: CanDeactivateFn<NemaNesacuvanih> = component => {
  // bez komponente (outlet nije prikazan, komponenta već uništena) nema šta da se izgubi
  if (!component?.imaNesacuvanihIzmena()) {
    return true;
  }
  return ConfirmDialog.otvori(inject(MatDialog), {
    naslov: 'Napustiti stranicu?',
    tekst: 'Imaš nesačuvane izmene. Ako napustiš stranicu, izmene se gube.',
    potvrdi: 'Napusti',
    destruktivno: true,
  });
};
