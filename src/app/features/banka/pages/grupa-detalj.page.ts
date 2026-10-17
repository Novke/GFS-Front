import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

import { EmptyState } from '../../../shared/ui/list-states';
import { PageHeader } from '../../../shared/ui/page-header';

/** Detalj grupe banke (`/banka/grupe/:id`): šema polja, težina i uputstvo. Privremeni sadržaj; stranicu pravi Task 13. */
@Component({
  selector: 'app-grupa-detalj-page',
  imports: [EmptyState, MatButton, MatIcon, PageHeader, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header naslov="Grupa zadataka" />
    <app-empty-state naslov="Detalj grupe je u izradi" ikona="quiz" tekst="Šema odgovora, težina i uputstvo za Claude-a uređuju se ovde.">
      <a matButton="outlined" routerLink="/banka" [queryParams]="{ grupa: id() }">
        <mat-icon svgIcon="arrow_back" aria-hidden="true" />Banka zadataka
      </a>
    </app-empty-state>
  `,
})
export class GrupaDetaljPage {
  /** Id iz putanje (`withComponentInputBinding`). */
  readonly id = input<string>();
}
