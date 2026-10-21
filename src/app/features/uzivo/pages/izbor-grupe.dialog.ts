// Izbor grupe zadataka za Zadatak slajd. Učitava se samo lenjo (`import()` iz `IzborGrupeOtvarac`): dijalog ne ulazi u fajl
// stranice editora.
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatRadioModule } from '@angular/material/radio';
import { Observable, of } from 'rxjs';
import { BankaIzborApi, CvorIzbora } from '../../../core/api/banka-izbor.api';
import { razlogGreske } from '../data-access/razlog-greske';

export interface IzborGrupePodaci {
  /** Predmet prezentacije: Zadatak slajd prima samo grupe banke tog predmeta, namena Predavanja. */
  predmetId: number;
  /** Trenutna grupa slajda (izabrana unapred), `null` za nov slajd. */
  grupaId: number | null;
}

/** Red stabla: čvor i dubina (uvlaka). */
interface RedStabla { cvor: CvorIzbora; nivo: number; }

function redovi(cvorovi: CvorIzbora[], nivo = 0): RedStabla[] {
  return cvorovi.flatMap(c => [{ cvor: c, nivo }, ...redovi(c.deca, nivo + 1)]);
}

/**
 * Otvara izbor; emituje izabran čvor ili `undefined` (Otkaži, Esc). Dok je jedan izbor otvoren, drugi poziv ne otvara ništa i
 * odmah emituje `undefined` (čekanje na chunk čuva `IzborGrupeOtvarac`).
 */
export function otvoriIzborGrupe(dialog: MatDialog, podaci: IzborGrupePodaci): Observable<CvorIzbora | undefined> {
  if (dialog.openDialogs.some(d => d.componentInstance instanceof IzborGrupeDialog)) {
    return of(undefined);
  }
  return dialog.open<IzborGrupeDialog, IzborGrupePodaci, CvorIzbora>(IzborGrupeDialog, {
    data: podaci, width: '560px', maxWidth: '95vw',
  }).afterClosed();
}

/**
 * Stablo banke predavanja predmeta (`core/api/banka-izbor.api`, jer `features/uzivo` ne sme da uvozi banka `data-access`) kao
 * jedna grupa radio dugmadi sa uvlakom po nivou: po čvoru naziv, `aktivnih: N` (unutrašnji čvor: zbir podstabla) ili "Nema
 * aktivnih varijanti", čip "Isključeno" (tema čvora ili pretka). Svaki čvor se sme izabrati: isključena tema i čvor bez
 * aktivnih su upozorenja u editoru, ne zabrana (spec 11.3). Greška učitavanja ostaje u dijalogu (`tiho`).
 */
@Component({
  selector: 'app-izbor-grupe-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule, MatProgressBarModule, MatRadioModule],
  template: `
    <h2 mat-dialog-title>Grupa zadataka</h2>
    <mat-dialog-content class="uz-ed-dijalog">
      <p class="uz-ed-napomena">Banka zadataka predmeta, namena Predavanja. Grupa sa podgrupama izvlači varijante iz svih
        podgrupa osim isključenih.</p>
      @if (ucitava()) {
        <mat-progress-bar mode="indeterminate" aria-label="Učitavanje banke zadataka" />
      }
      @if (greska(); as g) {
        <div class="uz-ig-greska" role="alert">
          <span>{{ g }}</span>
          <button mat-button type="button" (click)="ucitaj()">Pokušaj ponovo</button>
        </div>
      } @else if (!ucitava() && !stablo().length) {
        <p class="uz-ed-napomena">Banka ovog predmeta još nema grupa za predavanja.</p>
      }
      @if (stablo().length) {
        <mat-radio-group class="uz-ig-stablo" aria-label="Grupa zadataka" [value]="izabranId()" (change)="izabranId.set($event.value)">
          @for (r of stablo(); track r.cvor.id) {
            <mat-radio-button [value]="r.cvor.id" [attr.data-grupa]="r.cvor.id" [attr.data-nivo]="r.nivo"
                              [style.padding-left.rem]="r.nivo * 1.5">
              <span class="uz-ig-naziv">{{ r.cvor.naziv }}</span>
              <span class="uz-ig-broj">{{ r.cvor.brojAktivnih ? 'aktivnih: ' + r.cvor.brojAktivnih : 'Nema aktivnih varijanti' }}</span>
              @if (r.cvor.iskljucena) { <span class="uz-cip uz-ig-iskljuceno">Isključeno</span> }
            </mat-radio-button>
          }
        </mat-radio-group>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" [mat-dialog-close]="undefined">Otkaži</button>
      <button mat-flat-button type="button" [disabled]="!izabran()" (click)="izaberi()">Izaberi</button>
    </mat-dialog-actions>
  `,
  // samo ovaj lenji dijalog (ne globalni stil, koji ide u početni paket)
  styles: `
    .uz-ig-greska { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; color: var(--danger); }
    .uz-ig-stablo { display: flex; flex-direction: column; align-items: flex-start; }
    .uz-ig-naziv { font-weight: 500; }
    .uz-ig-broj { margin-left: 8px; color: var(--muted); font-size: 13px; }
    .uz-ig-iskljuceno { margin-left: 8px; border-color: transparent; background: var(--warn-soft); color: var(--warn); font-size: 12px; }
  `,
})
export class IzborGrupeDialog {
  private readonly podaci = inject<IzborGrupePodaci>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<IzborGrupeDialog, CvorIzbora>>(MatDialogRef);
  private readonly api = inject(BankaIzborApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly ucitava = signal(true);
  protected readonly greska = signal<string | null>(null);
  protected readonly stablo = signal<RedStabla[]>([]);
  protected readonly izabranId = signal<number | null>(this.podaci.grupaId);
  protected readonly izabran = computed(() => this.stablo().find(r => r.cvor.id === this.izabranId())?.cvor ?? null);

  constructor() {
    this.ucitaj();
  }

  protected ucitaj(): void {
    this.ucitava.set(true);
    this.greska.set(null);
    this.api.stablo(this.podaci.predmetId, { tiho: true }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: s => {
        this.stablo.set(redovi(s));
        this.ucitava.set(false);
      },
      error: e => {
        this.greska.set(razlogGreske(e, 'Banka zadataka nije učitana.'));
        this.ucitava.set(false);
      },
    });
  }

  protected izaberi(): void {
    const c = this.izabran();
    if (c) this.ref.close(c);
  }
}
