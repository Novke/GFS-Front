import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

/** Privremena stranica za ekrane koje donose naredni zadaci; svaka ruta je zamenjuje svojom komponentom. */
@Component({
  selector: 'app-u-izradi',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="u-izradi">
      <h1>U izradi</h1>
      <p>{{ ekran }}</p>
    </main>
  `,
  styles: `
    .u-izradi { padding: 24px; font-family: Roboto, "Helvetica Neue", sans-serif; }
    h1 { margin: 0 0 8px; font-size: 24px; }
    p { margin: 0; color: #555; }
  `,
})
export class UIzradiPage {
  protected readonly ekran: string = inject(ActivatedRoute).snapshot.data['ekran'] ?? '';
}
