import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

import { EmptyState } from '../../../shared/ui/list-states';
import { PageHeader } from '../../../shared/ui/page-header';

/**
 * Editor varijante (`/banka/varijante/nova?grupa=` i `/banka/varijante/:id`): LaTeX, živi pregled, odgovori i prilozi.
 * Privremeni sadržaj; editor pravi Task 14.
 */
@Component({
  selector: 'app-varijanta-editor-page',
  imports: [EmptyState, MatButton, MatIcon, PageHeader, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [naslov]="id() ? 'Varijanta' : 'Nova varijanta'" />
    <app-empty-state naslov="Editor varijante je u izradi" ikona="quiz" tekst="Ovde se piše LaTeX zadatka, sa pregledom i odgovorima.">
      <a matButton="outlined" routerLink="/banka" [queryParams]="grupa() ? { grupa: grupa() } : {}">
        <mat-icon svgIcon="arrow_back" aria-hidden="true" />Banka zadataka
      </a>
    </app-empty-state>
  `,
})
export class VarijantaEditorPage {
  /** Id iz putanje (izmena) ili `undefined` (nova). */
  readonly id = input<string>();
  /** `?grupa=` nove varijante. */
  readonly grupa = input<string>();
}
