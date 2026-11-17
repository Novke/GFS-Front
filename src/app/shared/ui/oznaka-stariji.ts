import { ChangeDetectionStrategy, Component } from '@angular/core';

import { StatusChip } from './status-chip';

/** Oznaka "stariji" uz ime studenta na nastavničkim ekranima; razmak od imena nosi sama, jer ćelije tabela nemaju zajednički raspored. */
@Component({
  selector: 'app-oznaka-stariji',
  imports: [StatusChip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-status-chip tekst="stariji" ton="warn" [ikona]="null" />`,
  styles: `:host { display: inline-block; margin-left: 6px; vertical-align: middle; }`,
})
export class OznakaStariji {}
