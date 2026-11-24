import { ChangeDetectionStrategy, Component, computed, DestroyRef, DOCUMENT, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';

import { JE_ID } from '../../../core/route-matchers';
import { CrtanjeApi } from '../../uzivo/crtanje/crtanje.api';
import { Gledalac } from '../../uzivo/crtanje/gledalac';
import { kanalTable } from '../../uzivo/crtanje/kanal-crtanja';
import { SlojCrtezaComponent } from '../../uzivo/crtanje/sloj-crteza.component';
import { preskociPrecicu, prebaciCeoEkran } from '../../uzivo/pages/precice';
import { kljucPrecice } from '../../uzivo/tastatura';
import { KLJUC_TABLE } from '../ui/tabla';

/** Publika table bez pulsa konzole pita server ovoliko često (`?posle=<verzija>`, 204 kad nema promene). */
export const PROVERA_TABLE_MS = 3_000;

/**
 * Prozor publike table sa predavanja (`/predavanja/:id/tabla/publika`, spec crtanja 5.7): bela strana 16:9 preko celog
 * ekrana i crtež (`Gledalac`). Dok stiže puls table iz istog pregledača, crtež (i potez u nastajanju) ide kanalom; bez
 * pulsa server na {@link PROVERA_TABLE_MS} ms dok se prozor vidi, i odmah posle povratka iz sna. `F` je ceo ekran.
 */
@Component({
  selector: 'app-tabla-publika',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SlojCrtezaComponent],
  host: { class: 'uz-pub uz-pub--beo', lang: 'sr-Latn', '(document:keydown)': 'tastatura($event)' },
  styles: `
    .tb-pub-scena { position: relative; aspect-ratio: 16 / 9; background: #fff; overflow: hidden; }
  `,
  template: `
    <div class="uz-pub-scena tb-pub-scena rezim-dan uz-dan" data-tabla-publika>
      @if (gledalac(); as g) {
        <app-sloj-crteza [elementi]="g.elementi()" [uToku]="g.uToku()" [alati]="g.alati()" />
      }
    </div>
  `,
})
export class TablaPublika {
  private readonly api = inject(CrtanjeApi);
  private readonly dokument = inject(DOCUMENT);

  /** `:id` je na roditeljskoj ruti (`TABLA_RUTE`). */
  private readonly id = toSignal(inject(ActivatedRoute).parent!.paramMap.pipe(map(p => p.get('id') ?? '')), { initialValue: '' });
  private readonly pId = computed(() => (JE_ID.test(this.id()) ? Number(this.id()) : null));
  protected readonly gledalac = signal<Gledalac | null>(null);

  constructor() {
    effect(() => {
      const id = this.pId();
      untracked(() => this.pripremi(id));
    });
    const provera = setInterval(() => {
      if (this.dokument.visibilityState !== 'hidden') this.gledalac()?.osvezi();
    }, PROVERA_TABLE_MS);
    // povratak iz sna ili mreže: odmah, ne čeka sledeću proveru (data-access `pratiPovratak` je tuđi feature)
    const povratak = () => {
      if (this.dokument.visibilityState !== 'hidden') this.gledalac()?.osvezi();
    };
    this.dokument.addEventListener('visibilitychange', povratak);
    window.addEventListener('online', povratak);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(provera);
      this.dokument.removeEventListener('visibilitychange', povratak);
      window.removeEventListener('online', povratak);
      this.gledalac()?.unisti();
    });
  }

  private pripremi(id: number | null): void {
    this.gledalac()?.unisti();
    if (id === null) {
      this.gledalac.set(null);
      return;
    }
    const g = new Gledalac({ ucitaj: (_, posle) => this.api.tabla(id, posle) }, kanalTable(id));
    g.postavi(KLJUC_TABLE, 0);
    g.osvezi();
    this.gledalac.set(g);
  }

  protected tastatura(e: KeyboardEvent): void {
    if (preskociPrecicu(e, false) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (kljucPrecice(e).toLowerCase() === 'f') {
      e.preventDefault();
      prebaciCeoEkran();
    }
  }
}
