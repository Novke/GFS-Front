import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { filter, Observable } from 'rxjs';

import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
import { IskljucenaTemaInfo } from '../data-access/banka.models';

/** Potvrda pre uključivanja isključene teme (lista na `/banka` i detalj grupe); `true` = uključi. */
export function potvrdiUkljucivanje(dialog: MatDialog): Observable<boolean> {
  return ConfirmDialog.otvori(dialog, { naslov: 'Uključi temu ponovo?', tekst: 'Klod je opet može nuditi.', potvrdi: 'Uključi' });
}

/** "Konverzije brojeva › Razlomljeni" ili, kad tema nema grupu (ili je grupa obrisana), "bez grupe". */
export function putanjaTeme(t: Pick<IskljucenaTemaInfo, 'putanja'>): string {
  return t.putanja.length > 0 ? t.putanja.map(p => p.naziv).join(' › ') : 'bez grupe';
}

/**
 * Isključene teme predmeta (sekcija ispod stabla na `/banka`): teme koje Klod ne nudi, najnovije prve, svaka sa opisom, putanjom
 * grupe (tema nad grupom isključuje i celo podstablo) i dugmetom "Uključi". Forme za dodavanje nema: teme isključuje Klod, kad
 * mu Novica kaže. Prazna lista ne prikazuje ništa. Komponenta ništa ne menja sama: posle potvrde emituje `ukljuci` (id teme),
 * a stranica zove store.
 */
@Component({
  selector: 'app-iskljucene-teme',
  imports: [MatButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './sekcije-stabla.css',
  template: `
    @if (teme().length > 0) {
      <section class="lista-kartica bk-sek" aria-labelledby="bk-naslov-tema">
        <h2 id="bk-naslov-tema" class="bk-sek-naslov">Isključene teme</h2>
        <p class="bk-sek-objasnjenje">Klod ove teme ne nudi.</p>
        <ul class="bk-sek-lista">
          @for (t of teme(); track t.id) {
            <li class="bk-sek-stavka" [attr.data-tema]="t.id">
              <span class="bk-sek-tekst">
                <span class="bk-it-opis">{{ t.opis }}</span>
                <span class="bk-sek-sporedno bk-it-grupa">{{ putanja(t) }}</span>
              </span>
              <button matButton type="button" [attr.aria-label]="'Uključi temu ' + t.opis" (click)="potvrdi(t)" data-ukljuci>Uključi</button>
            </li>
          }
        </ul>
      </section>
    }
  `,
})
export class IskljuceneTemeComponent {
  readonly teme = input.required<readonly IskljucenaTemaInfo[]>();
  /** Id teme koju treba ponovo uključiti (posle potvrde). */
  readonly ukljuci = output<number>();

  private readonly dialog = inject(MatDialog);

  protected readonly putanja = putanjaTeme;

  protected potvrdi(t: IskljucenaTemaInfo): void {
    potvrdiUkljucivanje(this.dialog)
      .pipe(filter(Boolean))
      .subscribe(() => this.ukljuci.emit(t.id));
  }
}
