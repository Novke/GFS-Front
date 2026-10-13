// Panel "Svojstva" editora platna (F6): bez izbora svojstva slajda; za izbor zajednička polja (položaj, veličina,
// providnost, senka) i, za tačno jedan sloj, polja njegove vrste (OBLIK i okvir TEKSTA, SLIKA). CRTEZ, TABELA i FORMULA
// u 4a imaju samo zajednička polja (F13, F14, F16 dodaju svoja). Panel je van okvira platna, pa prečice platna u njegovim
// poljima ne rade (odluka 24).
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import type { Tema } from '../data-access/platno.models';
import { PlatnoEditorStore } from './platno-editor.store';
import { SvojstvaOblikaComponent } from './svojstva-oblika.component';
import { SvojstvaSlajdaComponent } from './svojstva-slajda.component';
import { SvojstvaSlikeComponent } from './svojstva-slike.component';
import { SvojstvaSlojaComponent } from './svojstva-sloja.component';

@Component({
  selector: 'app-panel-svojstva',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SvojstvaOblikaComponent, SvojstvaSlajdaComponent, SvojstvaSlikeComponent, SvojstvaSlojaComponent],
  template: `
    @if (store.izbor().length === 0) {
      <app-svojstva-slajda [tema]="tema()" />
    } @else {
      <app-svojstva-sloja [tema]="tema()" />
      @if (store.jedan(); as s) {
        @if (s.tip === 'OBLIK' || s.tip === 'TEKST') {
          <app-svojstva-oblika [sloj]="s" [tema]="tema()" />
        } @else if (s.tip === 'SLIKA') {
          <app-svojstva-slike [sloj]="s" />
        }
      }
    }
  `,
  styles: `:host { display: grid; gap: 8px; padding: 8px 4px 12px; }`,
})
export class PanelSvojstvaComponent {
  readonly tema = input.required<Tema>();
  protected readonly store = inject(PlatnoEditorStore);
}
