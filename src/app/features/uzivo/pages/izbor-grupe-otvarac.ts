import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Observable, defer, finalize, from, of, switchMap } from 'rxjs';
import type { CvorIzbora } from '../../../core/api/banka-izbor.api';
import { NotificationStore } from '../../../core/state/notification.store';
import type { IzborGrupePodaci } from './izbor-grupe.dialog';

/**
 * Otvara izbor grupe zadataka (dugme "Zadatak" u editoru i "Promeni grupu…" u formi Zadatak slajda). Dijalog je lenji chunk:
 * ovde je samo dinamički `import()` (i `import type`), kao `UvozPptxOtvarac`. Jedan izbor u isto vreme, i dok se chunk učitava
 * (dvoklik) ili je otvoren drugi dijalog: takav poziv odmah emituje `undefined`. Neučitan chunk: poruka, pa `undefined`.
 */
@Injectable({ providedIn: 'root' })
export class IzborGrupeOtvarac {
  private readonly dialog = inject(MatDialog);
  private readonly obavestenja = inject(NotificationStore);
  private otvara = false;

  izaberi(podaci: IzborGrupePodaci): Observable<CvorIzbora | undefined> {
    return defer(() => {
      if (this.otvara || this.dialog.openDialogs.length) return of(undefined);
      this.otvara = true;
      const modul = import('./izbor-grupe.dialog').catch(() => {
        this.obavestenja.greska('Izbor grupe nije učitan. Osveži stranicu i pokušaj ponovo.');
        return null;
      });
      return from(modul).pipe(
        switchMap(m => (m ? m.otvoriIzborGrupe(this.dialog, podaci) : of(undefined))),
        finalize(() => (this.otvara = false)),
      );
    });
  }
}
