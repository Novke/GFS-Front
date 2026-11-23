import { BreakpointObserver } from '@angular/cdk/layout';
import { ChangeDetectionStrategy, Component, Signal, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { map } from 'rxjs';

import { AnketePanelStore } from '../data-access/ankete-panel.store';
import { KontekstAnkete } from '../data-access/ankete.models';
import { akcijaPanela, opisKonteksta } from '../data-access/ankete.pravila';
import { FolderEkranComponent } from './folder-ekran.component';
import { IstorijaEkranComponent } from './istorija-ekran.component';
import { KLASA_PUN_EKRAN, SIROK_PANEL } from './otvori-anketu';
import { PocetniEkranComponent } from './pocetni-ekran.component';
import { ProveraEkranComponent } from './provera-ekran.component';
import { RezultatiEkranComponent } from './rezultati-ekran.component';
import { UrediPreciceComponent } from './uredi-precice.component';

/**
 * Panel brze ankete (spec 6.1, maketa A-D i I): isti sadržaj na telefonu i laptopu. Ispod 900 px jedna kolona preko celog
 * ekrana (početni → provera → rezultati, strelica nazad), od 900 px leva kolona (prečice, folderi, istorija, uređivanje) i
 * desna (provera, rezultati). Tasteri dok je panel na vrhu: 1-9 prečica, Enter zatvara prikazanu otvorenu anketu, R pokazuje
 * ili sakriva rezultat; Esc zatvara panel (MatDialog). Stanje je u `AnketePanelStore` (traje koliko i panel).
 */
@Component({
  selector: 'app-anketa-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [AnketePanelStore],
  imports: [
    MatButtonModule, MatDialogModule, MatIconModule, FolderEkranComponent, IstorijaEkranComponent, PocetniEkranComponent,
    ProveraEkranComponent, RezultatiEkranComponent, UrediPreciceComponent,
  ],
  host: { class: 'ap', '[class.ap--siroko]': 'siroko()', '(document:keydown)': 'taster($event)', 'data-anketa-panel': '' },
  template: `
    <header class="ap-zaglavlje">
      @if (mozeNazad()) {
        <button mat-icon-button type="button" aria-label="Nazad" data-anketa-nazad (click)="nazad()"><mat-icon svgIcon="arrow_back" /></button>
      }
      <div class="ap-naslovi">
        <h2 id="anketa-panel-naslov" class="ap-naslov" tabindex="-1">Anketa</h2>
        @if (podnaslov()) { <p class="ap-pod">{{ podnaslov() }}</p> }
      </div>
      <button mat-icon-button type="button" mat-dialog-close aria-label="Zatvori panel ankete" data-anketa-zatvori-panel>
        <mat-icon svgIcon="close" />
      </button>
    </header>
    @if (store.poruka(); as p) {
      <div class="ap-greska" role="alert" data-anketa-greska>
        <span>{{ p }}</span>
        <button mat-button type="button" (click)="store.ponistiPoruku()">U redu</button>
      </div>
    }
    <div class="ap-telo">
      @if (siroko() || !store.desno()) {
        <section class="ap-levo" aria-labelledby="anketa-levo-naslov">
          @switch (store.levo().ekran) {
            @case ('folder') { <app-anketa-folder [folderId]="folderId()" /> }
            @case ('istorija') { <app-anketa-istorija /> }
            @case ('uredi') { <app-anketa-uredi-precice /> }
            @default { <app-anketa-pocetni [siroko]="siroko()" /> }
          }
        </section>
      }
      @if (siroko() || store.desno()) {
        <section class="ap-desno" aria-labelledby="anketa-desno-naslov">
          @let d = store.desno();
          @if (d?.ekran === 'provera') {
            <app-anketa-provera [ekran]="$any(d)" />
          } @else if (d?.ekran === 'rezultati') {
            <app-anketa-rezultati [siroko]="siroko()" />
          } @else {
            <div class="ap-uputstvo">
              <h3 id="anketa-desno-naslov" class="ap-uputstvo-naslov">Izaberi prečicu ili „Nova anketa“</h3>
              <p>Tasteri 1–9 pokreću prečice redom. Dok je anketa otvorena: Enter je zatvara, R pokazuje ili sakriva rezultat.</p>
            </div>
          }
        </section>
      }
    </div>
  `,
  styles: `
    :host { display: flex; flex-direction: column; height: 100%; min-height: 0; color: var(--ink); background: var(--surface); }
    .ap-zaglavlje { display: flex; align-items: center; gap: 4px; padding: 8px 8px 8px 16px; border-bottom: 1px solid var(--line); }
    .ap-naslovi { flex: 1; min-width: 0; }
    .ap-naslov { margin: 0; font-size: 18px; line-height: 1.3; font-weight: 600; outline: none; }
    .ap-pod { margin: 2px 0 0; font-size: 13px; color: var(--muted); overflow-wrap: anywhere; }
    .ap-greska {
      display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 8px 12px 0; padding: 4px 4px 4px 12px;
      border-left: 4px solid var(--danger); border-radius: var(--radius-sm); background: var(--danger-soft); font-size: 14px;
    }
    .ap-telo { flex: 1; min-height: 0; display: flex; }
    .ap-levo, .ap-desno { flex: 1; min-width: 0; overflow: auto; padding: 12px 16px 16px; overscroll-behavior: contain; }
    :host(.ap--siroko) .ap-levo { flex: 0 0 340px; border-right: 1px solid var(--line); background: var(--bg); }
    :host(.ap--siroko) .ap-desno { padding: 16px 24px 20px; }
    .ap-uputstvo { height: 100%; display: grid; place-content: center; max-width: 420px; margin: 0 auto; text-align: center; color: var(--muted); }
    .ap-uputstvo-naslov { margin: 0 0 8px; font-size: 16px; color: var(--ink-2); }
  `,
})
export class AnketaPanelDialog {
  protected readonly store = inject(AnketePanelStore);
  private readonly dialog = inject(MatDialog);
  private readonly ref = inject(MatDialogRef);

  protected readonly siroko = toSignal(inject(BreakpointObserver).observe(SIROK_PANEL).pipe(map(r => r.matches)), {
    initialValue: typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(SIROK_PANEL).matches,
  });

  protected readonly podnaslov = computed(() => opisKonteksta(this.store.kontekst()));
  protected readonly folderId = computed(() => {
    const l = this.store.levo();
    return l.ekran === 'folder' ? l.folderId : null;
  });
  /** Laptop: strelica vraća levu kolonu na početni; telefon: i sa desnog ekrana. */
  protected readonly mozeNazad = computed(() => this.store.levo().ekran !== 'pocetni' || (!this.siroko() && this.store.desno() !== null));

  constructor() {
    this.store.init(inject<Signal<KontekstAnkete>>(MAT_DIALOG_DATA));
    // promena širine prozora (laptop ↔ telefon) menja i okvir dijaloga
    let prvi = true;
    effect(() => {
      const siroko = this.siroko();
      if (prvi) {
        prvi = false;
        return;
      }
      if (siroko) {
        this.ref.removePanelClass(KLASA_PUN_EKRAN);
        this.ref.updateSize('min(1100px, 96vw)', 'min(760px, 92dvh)');
      } else {
        this.ref.addPanelClass(KLASA_PUN_EKRAN);
        this.ref.updateSize('100vw', '100dvh');
      }
    });
  }

  protected nazad(): void {
    if (this.siroko()) {
      this.store.otvoriLevo({ ekran: 'pocetni' });
    } else {
      this.store.nazad();
    }
  }

  /** Tasteri panela samo dok je on dijalog na vrhu (potvrda brisanja preko njega ih prima sama). */
  protected taster(e: KeyboardEvent): void {
    if (this.dialog.openDialogs.at(-1) !== this.ref) {
      return;
    }
    const a = akcijaPanela(e);
    if (!a) {
      return;
    }
    const d = this.store.desno();
    const anketa = this.store.anketa();
    switch (a.tip) {
      case 'precica':
        // nacrt u proveri i uređivanje prečica se ne gube na slučajnu cifru
        if (d?.ekran === 'provera' || this.store.levo().ekran === 'uredi') {
          return;
        }
        e.preventDefault();
        this.store.precicaPoRedu(a.indeks);
        return;
      case 'zatvori':
        if (d?.ekran === 'rezultati' && anketa?.otvorena) {
          e.preventDefault();
          this.store.zatvoriAnketu();
        }
        return;
      case 'rezultat':
        if (d?.ekran === 'rezultati' && anketa) {
          e.preventDefault();
          this.store.prebaciRezultat();
        }
        return;
    }
  }
}
