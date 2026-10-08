import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { oznakaDalje, oznakaOtvoriZatvori, oznakaTajmera } from '../data-access/izvodjenje-pravila';
import { NastavnickoStanje, TipKomande } from '../data-access/uzivo.models';
import { pustiFokusPosleKlika } from './precice';

export interface KomandaZahtev { tip: TipKomande; vrednost?: number; }

interface Dugme {
  tip: TipKomande; vrednost?: number; oznaka: string; taster: string; ikona: string;
  /** `null` = nije prekidač; inače da li je uključen (aria-pressed). */
  ukljuceno: boolean | null; glavno?: boolean;
}

interface Grupa { naslov: string; dugmad: Dugme[]; }

/**
 * Velika dugmad za svaku komandu iz tabele prečica (spec 6.4), sa prečicom u oznaci. Onemogućena su kad server komandu
 * u ovoj fazi ne bi prihvatio (`dozvoljene`, ista pravila kao server); prekidači pokazuju stanje (`aria-pressed`).
 */
@Component({
  selector: 'gfs-konzola-kontrole',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule],
  host: { class: 'uz-kon-kontrole' },
  template: `
    @for (g of grupe(); track g.naslov) {
      <section class="uz-kon-grupa" [attr.aria-label]="g.naslov">
        <h3 class="uz-kon-grupa-naslov">{{ g.naslov }}</h3>
        <div class="uz-kon-dugmad">
          @for (d of g.dugmad; track $index) {
            <button type="button" class="uz-kon-dugme" [class.uz-kon-dugme--glavno]="d.glavno"
                    [class.uz-kon-dugme--ukljuceno]="d.ukljuceno === true"
                    [attr.aria-pressed]="d.ukljuceno === null ? null : d.ukljuceno"
                    [attr.aria-keyshortcuts]="d.taster" [disabled]="!dozvoljene().has(d.tip)"
                    (click)="pustiFokus($event); komanda.emit({ tip: d.tip, vrednost: d.vrednost })">
              <mat-icon aria-hidden="true">{{ d.ikona }}</mat-icon>
              <span class="uz-kon-dugme-tekst">{{ d.oznaka }}</span>
              <kbd class="uz-kbd" aria-hidden="true">{{ d.taster }}</kbd>
            </button>
          }
        </div>
      </section>
    }
  `,
})
export class KonzolaKontroleComponent {
  readonly stanje = input.required<NastavnickoStanje>();
  readonly dozvoljene = input.required<ReadonlySet<TipKomande>>();
  readonly komanda = output<KomandaZahtev>();

  protected readonly pustiFokus = pustiFokusPosleKlika;

  protected readonly grupe = computed<Grupa[]>(() => {
    const s = this.stanje();
    return [
      {
        naslov: 'Kretanje',
        dugmad: [
          { tip: 'PRETHODNI', oznaka: 'Nazad', taster: '←', ikona: 'arrow_back', ukljuceno: null },
          { tip: 'SLEDECI', oznaka: oznakaDalje(s), taster: '→', ikona: 'arrow_forward', ukljuceno: null, glavno: true },
          { tip: 'IDI_NA', vrednost: -1, oznaka: 'Prijava', taster: 'Home', ikona: 'qr_code_2', ukljuceno: null },
          { tip: 'IDI_NA', vrednost: Math.max(s.brojSlajdova - 1, -1), oznaka: 'Poslednji slajd', taster: 'End', ikona: 'last_page', ukljuceno: null },
        ],
      },
      {
        naslov: 'Pitanje',
        dugmad: [
          { tip: 'OTVORI_ZATVORI', oznaka: oznakaOtvoriZatvori(s), taster: 'O', ikona: s.faza === 'OTVORENO' ? 'lock' : 'lock_open', ukljuceno: null },
          { tip: 'REZULTATI', oznaka: 'Rezultati', taster: 'Space', ikona: 'bar_chart', ukljuceno: s.rezultatiPrikazani },
          { tip: 'TACAN', oznaka: 'Tačan odgovor', taster: 'C', ikona: 'check_circle', ukljuceno: s.tacanPrikazan },
          { tip: 'RANG_LISTA', oznaka: 'Rang-lista', taster: 'L', ikona: 'leaderboard', ukljuceno: s.rangListaPrikazana },
          { tip: 'PONOVI', oznaka: 'Ponovi pitanje', taster: 'R', ikona: 'replay', ukljuceno: null },
        ],
      },
      {
        naslov: 'Tajmer',
        dugmad: [
          { tip: 'TAJMER', oznaka: oznakaTajmera(s), taster: 'T', ikona: oznakaTajmera(s) === 'Pauziraj tajmer' ? 'pause' : 'timer', ukljuceno: null },
          { tip: 'TAJMER_PLUS', oznaka: '+10 s', taster: '+', ikona: 'add', ukljuceno: null },
          { tip: 'TAJMER_MINUS', oznaka: '−10 s', taster: '-', ikona: 'remove', ukljuceno: null },
        ],
      },
      {
        naslov: 'Ekran i telefoni',
        dugmad: [
          { tip: 'TELEFON_PRIKAZ', oznaka: s.telefonPrikaz === 'PITANJE' ? 'Telefon: celo pitanje' : 'Telefon: samo dugmad', taster: 'M', ikona: 'smartphone', ukljuceno: null },
          { tip: 'DETALJI', oznaka: 'Dozvoli „Detalje“', taster: 'D', ikona: 'description', ukljuceno: s.detaljiDozvoljeni },
          { tip: 'QR', oznaka: 'QR preko ekrana', taster: 'Q', ikona: 'qr_code', ukljuceno: s.qrPrikazan },
          { tip: 'EKRAN_CRN', oznaka: 'Crn ekran', taster: 'B', ikona: 'brightness_2', ukljuceno: s.ekran === 'CRN' },
          { tip: 'EKRAN_BEO', oznaka: 'Beo ekran', taster: 'W', ikona: 'brightness_7', ukljuceno: s.ekran === 'BEO' },
        ],
      },
    ];
  });
}
