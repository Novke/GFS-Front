import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { filter, Observable } from 'rxjs';

import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
import { GrupaDetails, IskljucenaTemaInfo } from '../data-access/banka.models';

/**
 * Potvrda pre uključivanja isključene teme (lista na `/banka` i detalj grupe); `true` = uključi. `pretak` = naziv grupe čija
 * tema isključuje grupu na detalju ({@link pretakIskljucenja}): brisanje te teme uključuje celo podstablo pretka, pa potvrda to
 * kaže i imenuje ga.
 */
export function potvrdiUkljucivanje(dialog: MatDialog, pretak: string | null = null): Observable<boolean> {
  return ConfirmDialog.otvori(dialog, pretak === null
    ? { naslov: 'Uključi temu ponovo?', tekst: 'Klod je opet može nuditi.', potvrdi: 'Uključi' }
    : {
      naslov: `Uključi celu grupu „${pretak}“?`,
      tekst: [
        `Ova grupa je isključena preko nadređene grupe „${pretak}“.`,
        `Uključivanje briše njenu temu, pa se isključenje skida sa „${pretak}“ i celog njenog podstabla, ne samo sa ove grupe. Klod ih opet može nuditi.`,
      ],
      potvrdi: 'Uključi celu grupu',
    });
}

/**
 * Naziv pretka čija tema (`tema`, ona iz `iskljucenjeId`) isključuje grupu `g`, ili `null` kad je tema sopstvena grupe (ili je
 * nema, ili je bez grupe): naziv iz putanje grupe, a kad ga tamo nema, poslednji iz putanje teme.
 */
export function pretakIskljucenja(g: Pick<GrupaDetails, 'id' | 'putanja'>, tema: IskljucenaTemaInfo | undefined): string | null {
  if (!tema || tema.grupaId === null || tema.grupaId === g.id) {
    return null;
  }
  return g.putanja.find(p => p.id === tema.grupaId)?.naziv ?? tema.putanja.at(-1)?.naziv ?? null;
}

/** "Konverzije brojeva › Razlomljeni" ili, kad tema nema grupu (ili je grupa obrisana), "bez grupe". */
export function putanjaTeme(t: Pick<IskljucenaTemaInfo, 'putanja'>): string {
  return t.putanja.length > 0 ? t.putanja.map(p => p.naziv).join(' › ') : 'bez grupe';
}

/**
 * Isključene teme predmeta (sekcija ispod stabla na `/banka`): teme koje Klod ne nudi, najnovije prve, svaka sa opisom, putanjom
 * grupe (tema nad grupom isključuje i celo podstablo) i dugmetom "Uključi". Forme za dodavanje nema: teme isključuje Klod, kad
 * mu Novica kaže. Prazna lista ne prikazuje ništa. Komponenta ništa ne menja sama: posle potvrde emituje `ukljuci` (id teme),
 * a stranica zove store; dok je tema u `uToku`, njeno dugme čeka.
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
              <button
                matButton
                type="button"
                disabledInteractive
                [disabled]="uToku().includes(t.id)"
                [attr.aria-label]="'Uključi temu ' + t.opis"
                (click)="potvrdi(t)"
                data-ukljuci
              >Uključi</button>
            </li>
          }
        </ul>
      </section>
    }
  `,
})
export class IskljuceneTemeComponent {
  readonly teme = input.required<readonly IskljucenaTemaInfo[]>();
  /** Teme čije uključivanje je u toku: njihovo dugme čeka (fokus ostaje na njemu) i ne otvara potvrdu. */
  readonly uToku = input<readonly number[]>([]);
  /** Id teme koju treba ponovo uključiti (posle potvrde). */
  readonly ukljuci = output<number>();

  private readonly dialog = inject(MatDialog);

  protected readonly putanja = putanjaTeme;

  protected potvrdi(t: IskljucenaTemaInfo): void {
    if (this.uToku().includes(t.id)) {
      return;
    }
    potvrdiUkljucivanje(this.dialog)
      .pipe(filter(Boolean))
      .subscribe(() => this.ukljuci.emit(t.id));
  }
}
