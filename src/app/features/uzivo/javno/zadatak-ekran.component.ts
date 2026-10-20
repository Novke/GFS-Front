import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LicniZadatak } from '../data-access/uzivo.models';
import { TajmerComponent } from '../ui/tajmer.component';
import { StudentStore, naslovIshoda } from './student.store';
import { ZadatakUnosComponent } from './zadatak-unos.component';

/**
 * Ekrani svoje varijante na telefonu (`zadatak`, `zadatakPrimljen`, `zadatakIshod`): red stanja runde (tajmer, "Odgovor
 * primljen ✓", naslov ishoda) i jedna instanca `app-zadatak-unos` kroz sva tri ekrana. Stanje i radnje uzima iz
 * {@link StudentStore} stranice (ubrizgan, bez ulaza).
 *
 * Lenja (`@defer` u stranici studenta, isti chunk kao `app-zadatak-unos`): sav kod i stilovi Zadatak slajda su van
 * statičkog zatvorenja stranice (budžet `e2e/lenji-formule.spec.ts`) i van globalnog CSS-a početnog paketa (budžet
 * `e2e/lenji-editor.spec.ts`); telefon ih vuče tek na Zadatak slajdu. Uvozi samo module dozvoljene javnom delu.
 */
@Component({
  selector: 'app-zadatak-ekran',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TajmerComponent, ZadatakUnosComponent],
  styles: `
    :host { display: flex; flex-direction: column; gap: 0.75rem; width: 100%; max-width: 40rem; }
    .uz-st-zd-vrh { display: flex; align-items: center; justify-content: flex-end; gap: 0.75rem; }
    .uz-st-zd-vrh > p { flex: 1; }
  `,
  template: `
    @let s = store;
    @if (s.zadatak(); as z) {
      @let e = s.ekran();
      <div class="uz-st-zd-vrh">
        @if (e === 'zadatakIshod') {
          @if (z.polja.length) {
            <p class="uz-st-veliko uz-st-zd-naslov" role="status" [class.uz-st-ok]="z.tacno === true"
               [class.uz-st-lose]="z.tacno === false">{{ naslov(z) }}</p>
          }
        } @else {
          @if (e === 'zadatakPrimljen') { <p class="uz-st-veliko uz-st-ok" role="status">Odgovor primljen ✓</p> }
          @let r = s.runda();
          <app-tajmer class="uz-st-tajmer" [rokMs]="r?.rokMs ?? null" [preostaloMs]="r?.preostaloMs ?? null" [sat]="s.sat()"
                      [ukupnoMs]="s.ukupnoMs()" />
        }
      </div>
      <app-zadatak-unos [zadatak]="z" [nacrt]="s.nacrtZadatka()" [zakljucan]="e !== 'zadatak'"
                        (nacrtPromena)="s.sacuvajNacrtZadatka($event)" (posalji)="s.odgovoriZadatak($event)" />
    }
  `,
})
export class ZadatakEkranComponent {
  protected readonly store = inject(StudentStore);

  /** Zadatak nije takmičenje: "Tačno!", "Netačno", "Odgovor primljen" (bez ocene) ili "Nisi odgovorio", bez poena. */
  protected naslov(z: LicniZadatak): string {
    return naslovIshoda({ odgovorio: z.primljen, tacno: z.tacno, poeni: null }, false);
  }
}
