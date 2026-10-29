import { DatePipe, DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { RouterLink } from '@angular/router';

import { RangTacnostiTabela } from '../../../shared/ui/rang-tacnosti-tabela';
import { StatusChip } from '../../../shared/ui/status-chip';
import { PrezentacijePredavanjaStore } from '../data-access/prezentacije-predavanja.store';
import { konzolaIzvodjenja, pregledIzvodjenja } from './izvodjenje-putanje';

/** Rang predavanja se osvežava ovoliko često dok neka prezentacija traje i kartica je vidljiva. */
export const RANG_PREDAVANJA_OSVEZAVANJE_MS = 10_000;

/**
 * "Prezentacije na ovom predavanju": izvođenja prezentacija vezana za predavanje, sa statusom i vezom na konzolu (u toku)
 * ili pregled (završeno). Na predavanju koje traje otvara se NOVA kartica (beleženje se ne prekida), na završenom ista.
 * Lista se čita ponovo kad se kartica ponovo prikaže (konzola se zatvara u drugoj kartici). U beleženju se odeljak vidi tek
 * kad ima šta da pokaže ili kad je greška; na završenom predavanju uvek, da kaže da prezentacija nije bilo. Ispod liste je
 * rang tačnosti: jedan izveštaj kad je bilo jedno izvođenje sa pitanjima, zbir predavanja kad ih je više; dok neka
 * prezentacija traje, osvežava se svakih {@link RANG_PREDAVANJA_OSVEZAVANJE_MS} ms. Studenti su linkovi tek na završenom
 * predavanju (beleženje se ne napušta).
 */
@Component({
  selector: 'app-prezentacije-na-predavanju',
  imports: [DatePipe, MatButton, RangTacnostiTabela, RouterLink, StatusChip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (vidljivo()) {
      <section class="prez" aria-labelledby="naslov-prezentacija" data-prezentacije>
        <h2 id="naslov-prezentacija">Prezentacije na ovom predavanju</h2>
        @if (store.greska(); as g) {
          <p class="greska" role="alert" data-greska>
            {{ g }} <button matButton type="button" (click)="osvezi()">Pokušaj ponovo</button>
          </p>
        } @else if (store.izvodjenja().length === 0) {
          <p class="prazno" data-prazno>Nijedna prezentacija nije prikazana na ovom predavanju.</p>
        } @else {
          <ul class="lista">
            @for (i of store.izvodjenja(); track i.id) {
              <li class="stavka" [attr.data-izvodjenje]="i.id">
                <div class="tekst">
                  <span class="naziv">{{ i.prezentacija.naziv }}</span>
                  <span class="meta">
                    {{ i.pocetak | date: 'd.M.yyyy. HH:mm' }}
                    @if (i.status === 'ZAVRSENO' && i.kraj) { – {{ i.kraj | date: 'HH:mm' }} }
                    · učesnika: {{ i.brojUcesnika }}
                  </span>
                </div>
                @if (i.status === 'AKTIVNO') {
                  <app-status-chip tekst="U toku" ton="uToku" />
                  <a matButton="filled" [routerLink]="'/' + konzola(i.id)" [target]="cilj()" data-nastavi
                     [attr.aria-label]="'Nastavi: ' + i.prezentacija.naziv + novaKartica()">Nastavi</a>
                } @else {
                  <app-status-chip tekst="Završeno" ton="neutral" />
                  <a matButton="outlined" [routerLink]="'/' + pregled(i.id)" [target]="cilj()" data-pregled
                     [attr.aria-label]="'Pregled: ' + i.prezentacija.naziv + novaKartica()">Pregled</a>
                }
              </li>
            }
          </ul>
          @if (store.rangGreska(); as g) {
            <p class="greska" role="alert" data-rang-greska>{{ g }}</p>
          } @else if (store.rang(); as r) {
            @if (r.izvodjenja.length > 0) {
              <section class="rang" aria-labelledby="naslov-rang-predavanja" data-rang-predavanja>
                <h3 id="naslov-rang-predavanja">{{ r.izvodjenja.length > 1 ? 'Rang tačnosti predavanja' : 'Rang tačnosti' }}</h3>
                <p class="meta">
                  @if (r.izvodjenja.length > 1) { Sve prezentacije ovog predavanja zajedno ({{ r.izvodjenja.length }}). }
                  Prvo tačnost (neodgovoreno pitanje je netačno), pa prosečno vreme, pa ★.
                  @if (store.uToku().length > 0) { Osvežava se dok prezentacija traje. }
                </p>
                <app-rang-tacnosti-tabela [stavke]="r.rang" [kolone]="r.izvodjenja.length > 1 ? ['izvodjenja'] : []"
                                          [linkoviStudenata]="zavrseno()" />
              </section>
            }
          }
        }
      </section>
    }
  `,
  styles: `
    :host { display: block; }
    .prez { margin-top: 24px; }
    .prez h2 { font-size: 18px; margin-bottom: 8px; }
    .lista { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
    .stavka { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
    .tekst { display: grid; gap: 2px; min-width: 0; flex: 1; }
    .naziv { font-weight: 600; overflow-wrap: anywhere; }
    .meta, .prazno { font-size: 13px; color: var(--muted); }
    .greska { color: var(--danger-ink); }
    .rang { margin-top: 16px; padding: 10px 12px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
    .rang h3 { font-size: 16px; margin: 0 0 4px; }
    .rang .meta { margin: 0 0 8px; }
    @media (max-width: 599.98px) { .stavka { flex-wrap: wrap; } .tekst { flex-basis: 100%; } }
  `,
})
export class PrezentacijeNaPredavanju {
  protected readonly store = inject(PrezentacijePredavanjaStore);
  private readonly dokument = inject(DOCUMENT);

  readonly predavanjeId = input.required<number>();
  /** Predavanje je završeno: odeljak je uvek tu, a linkovi idu u istoj kartici. */
  readonly zavrseno = input(false);

  protected readonly vidljivo = computed(
    () => this.store.ucitano() && (this.zavrseno() || this.store.izvodjenja().length > 0 || this.store.greska() !== null),
  );
  protected readonly cilj = computed(() => (this.zavrseno() ? '_self' : '_blank'));
  protected readonly novaKartica = computed(() => (this.zavrseno() ? '' : ' (otvara se u novoj kartici)'));

  constructor() {
    // običan slušalac, ne rxjs `fromEvent`: početno zatvorenje aplikacije ne sme da povuče taj operator (e2e/lenji-editor)
    const slusalac = () => {
      if (this.dokument.visibilityState === 'visible') this.osvezi();
    };
    this.dokument.addEventListener('visibilitychange', slusalac);
    // rang uživo: samo dok neko izvođenje traje i kartica se vidi
    const tajmer = setInterval(() => {
      if (this.dokument.visibilityState === 'visible' && this.store.uToku().length > 0) this.osvezi();
    }, RANG_PREDAVANJA_OSVEZAVANJE_MS);
    inject(DestroyRef).onDestroy(() => {
      this.dokument.removeEventListener('visibilitychange', slusalac);
      clearInterval(tajmer);
    });
  }

  protected osvezi(): void {
    this.store.ucitaj(this.predavanjeId());
  }

  protected konzola(id: number): string {
    return konzolaIzvodjenja(id);
  }

  protected pregled(id: number): string {
    return pregledIzvodjenja(id);
  }
}
