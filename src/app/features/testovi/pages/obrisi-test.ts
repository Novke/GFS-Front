import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { filter, switchMap } from 'rxjs';

import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
import { TestStore } from '../data-access/test.store';
import { brojPolaganja } from '../data-access/testovi.models';

/** "Obriši test" (⋮ na detalju i statistici): potvrda sa brojem polaganja, brisanje kroz store, pa na listu. */
export function obrisiTestUzPotvrdu(dialog: MatDialog, router: Router, store: TestStore): void {
  const n = store.redovi().length;
  ConfirmDialog.otvori(dialog, {
    naslov: 'Obriši test?',
    tekst: `${n > 0 ? `Briše se test i ${brojPolaganja(n)} (ispitanici i njihovi poeni).` : 'Briše se test (nema ispitanika).'} Ovo se ne može poništiti.`,
    potvrdi: 'Obriši',
    destruktivno: true,
  })
    .pipe(
      filter(Boolean),
      switchMap(() => store.obrisi()),
      filter(Boolean),
    )
    .subscribe(() => void router.navigate(['/testovi']));
}
