import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject } from '@angular/core';

import { FajloviSpisakComponent } from '../../../shared/ui/fajlovi-spisak.component';
import { MejlFajlaOdgovor } from '../../../shared/util/fajlovi';
import { MejlFajlova } from '../../../shared/util/fajlovi-mejl';
import { StudentStore } from './student.store';

/**
 * Fajlovi trenutnog slajda na telefonu uživo (spec fajlova 6): „Pošalji mi na mejl” po fajlu, bez „Preuzmi” (telefon na času
 * ne skida; preuzima se sa `/f/<kod>` na računaru). Lenja (`@defer` u stranici studenta, kao `app-zadatak-ekran`): kod i stilovi
 * su van statičkog zatvorenja stranice (budžet `e2e/lenji-formule.spec.ts`). Jedini poziv je
 * `POST api/public/nalog/fajlovi/<id>/mejl` (kolačić `gfs_student`, isti origin); 401 ili 403 (gost, nije prijavljen) menja
 * dugme linkom „Prijavi se da ti pošaljemo fajl” na `nalog?nazad=uzivo/<kod>`. Stanje (kod i fajlovi) uzima iz
 * {@link StudentStore} stranice.
 */
@Component({
  selector: 'app-fajlovi-telefon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FajloviSpisakComponent],
  styles: `
    :host { display: block; width: 100%; max-width: 40rem; margin: 0 auto; padding: 0 1rem 1rem; box-sizing: border-box; }
    h2 { margin: 0 0 0.5rem; font-size: 1.1rem; }
  `,
  template: `
    <section aria-labelledby="uz-fajlovi-naslov" data-fajlovi-telefon>
      <h2 id="uz-fajlovi-naslov">Fajlovi za vežbu</h2>
      <app-fajlovi-spisak [fajlovi]="store.javno()?.fajlovi ?? []" [mejl]="true" [poruke]="mejl.poruke()"
                          [prijavaNazad]="mejl.trebaPrijava() ? nazad() : null" (posaljiMejl)="mejl.posalji($event)" />
    </section>
  `,
})
export class FajloviTelefonComponent {
  protected readonly store = inject(StudentStore);
  private readonly http = inject(HttpClient);
  protected readonly nazad = computed(() => `uzivo/${this.store.kod() ?? ''}`);
  protected readonly mejl = new MejlFajlova(
    id => this.http.post<MejlFajlaOdgovor>(`api/public/nalog/fajlovi/${id}/mejl`, null), inject(DestroyRef), true,
  );
}
