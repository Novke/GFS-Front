import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { naslovSledeceg, sledeciKlik } from '../data-access/izvodjenje-pravila';
import { PoteziCrteza } from '../data-access/potezi-crteza';
import { NastavnickoStanje } from '../data-access/uzivo.models';
import { SlajdPrikazComponent } from '../ui/slajd-prikaz.component';

/**
 * Panel "Sledeće": stanje posle sledećeg klika (isti slajd na koraku k+1, sledeći slajd na koraku 0). Na pitanju
 * pokazuje radnju klika (otvara/zatvara) i ispod nje "Zatim:" slajd posle pitanja. Pregled je krajnje stanje, bez animacije.
 * Slajd dobija poteze crteža iz keša prozora (`PoteziCrteza.saPotezima`); panel ih sam ne traži, jer umanjena scena
 * konzole (`app-publika-scena`) već traži i trenutni i sledeći slajd.
 */
@Component({
  selector: 'app-sledece-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SlajdPrikazComponent],
  template: `
    @let s = stanje();
    <section class="uz-kon-kartica uz-kon-sledeci" aria-label="Sledeće">
      <h2 class="uz-kon-naslov">{{ naslov() }}</h2>
      @switch (klik().vrsta) {
        @case ('KORAK') {
          @if (klikKorak(); as k) {
            <div class="rezim-dan uz-dan"><app-slajd-prikaz [slajd]="k.slajd" [korak]="k.korak" [postepeno]="k.slajd.postepeno" [tema]="s.tema" /></div>
          }
        }
        @case ('SLAJD') {
          @if (klikSlajd(); as k) {
            <div class="rezim-dan uz-dan"><app-slajd-prikaz [slajd]="k.slajd" [korak]="0" [postepeno]="k.slajd.postepeno" [tema]="s.tema" /></div>
          }
        }
        @case ('PITANJE') {
          @if (klikPitanje(); as k) {
            <p class="uz-sled-radnja">Sledeći klik {{ k.radnja === 'OTVARA' ? 'otvara' : 'zatvara' }} pitanje.</p>
            @if (k.potom; as potom) {
              <p class="uz-sled-zatim">Zatim: slajd {{ k.indeksPotom + 1 }}/{{ s.brojSlajdova }}</p>
              <div class="rezim-dan uz-dan"><app-slajd-prikaz [slajd]="potom" [korak]="0" [postepeno]="potom.postepeno" [tema]="s.tema" /></div>
            } @else {
              <p class="uz-sled-zatim">Zatim: kraj prezentacije.</p>
            }
          }
        }
        @case ('KRAJ') {
          <p class="uz-prazno">Sledeći klik prikazuje kraj („Hvala“ ili pobednike).</p>
        }
        @default {
          <p class="uz-prazno">Ovo je kraj. Završi izvođenje dugmetom „Završi“.</p>
        }
      }
    </section>
  `,
})
export class SledecePanelComponent {
  readonly stanje = input.required<NastavnickoStanje>();

  private readonly potezi = inject(PoteziCrteza);

  /** Klik nad snimkom sa potezima iz keša (isti objekat kad nema šta da se doda). */
  protected readonly klik = computed(() => {
    const s = this.stanje();
    return sledeciKlik({
      ...s, trenutniSlajd: this.potezi.saPotezima(s.trenutniSlajd), sledeciSlajd: this.potezi.saPotezima(s.sledeciSlajd),
    });
  });
  protected readonly naslov = computed(() => naslovSledeceg(this.klik(), this.stanje().brojSlajdova));
  protected readonly klikKorak = computed(() => { const k = this.klik(); return k.vrsta === 'KORAK' ? k : null; });
  protected readonly klikSlajd = computed(() => { const k = this.klik(); return k.vrsta === 'SLAJD' ? k : null; });
  protected readonly klikPitanje = computed(() => { const k = this.klik(); return k.vrsta === 'PITANJE' ? k : null; });
}
