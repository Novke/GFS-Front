import { ChangeDetectionStrategy, Component, Injectable, input, output } from '@angular/core';
import { MatPaginator, MatPaginatorIntl, PageEvent } from '@angular/material/paginator';

import { VELICINE } from '../store/list-params';

/** Srpske labele za `mat-paginator` ("Po strani", "Sledeća strana", "1–25 od 120"). */
@Injectable()
export class SrPaginatorIntl extends MatPaginatorIntl {
  override itemsPerPageLabel = 'Po strani';
  override nextPageLabel = 'Sledeća strana';
  override previousPageLabel = 'Prethodna strana';
  override firstPageLabel = 'Prva strana';
  override lastPageLabel = 'Poslednja strana';

  override getRangeLabel = (strana: number, velicina: number, ukupno: number): string => {
    if (ukupno === 0 || velicina === 0) {
      return `0 od ${ukupno}`;
    }
    const pocetak = strana * velicina;
    const kraj = Math.min(pocetak + velicina, ukupno);
    return `${pocetak + 1}–${kraj} od ${ukupno}`;
  };
}

/**
 * Omot oko `mat-paginator` za liste sa `withListQuery`: `strana` je 1-based (kao u URL-u), veličine 10/25/50/100.
 * Promena veličine emituje samo `velicinaChange` (store vraća na prvu stranu); listanje emituje `stranaChange`.
 * Prazna lista nema paginator.
 */
@Component({
  selector: 'app-paginator',
  imports: [MatPaginator],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: MatPaginatorIntl, useClass: SrPaginatorIntl }],
  template: `
    @if (ukupno() > 0) {
      <mat-paginator [length]="ukupno()" [pageIndex]="strana() - 1" [pageSize]="velicina()" [pageSizeOptions]="velicine"
        [showFirstLastButtons]="true" (page)="promena($event)" />
    }
  `,
  styles: `
    :host { display: block; }
    mat-paginator { background: transparent; }
  `,
})
export class Paginator {
  readonly ukupno = input(0);
  readonly strana = input(1);
  readonly velicina = input(25);
  readonly stranaChange = output<number>();
  readonly velicinaChange = output<number>();

  protected readonly velicine = [...VELICINE];

  protected promena(e: PageEvent): void {
    if (e.pageSize !== this.velicina()) {
      this.velicinaChange.emit(e.pageSize);
    } else {
      this.stranaChange.emit(e.pageIndex + 1);
    }
  }
}
