import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { booleanAttribute, ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';

import { PrezentacijaZaIzbor } from '../../core/api/prezentacije-predavanja.api';
import {
  FILTER_VRSTE, grupisiPoVezbi, OZNAKA_VRSTE, VRSTE_PREZENTACIJE, VrstaPrezentacije, zaPretragu,
} from '../../core/api/redosled-prezentacija';

/** Stanje reda: slobodna ("Pokreni"), u toku ovde ("Nastavi", link) ili u toku drugde (zaključana). */
export type StanjeStavke = { vrsta: 'slobodna' } | { vrsta: 'nastavi'; izvodjenjeId: number } | { vrsta: 'zauzeta' };

/** Red izbora: `pusteno` je kad ju je grupa (ili bilo ko, po izboru pozivaoca) poslednji put puštala, `null` = nije. */
export interface RedIzbora {
  p: PrezentacijaZaIzbor;
  pusteno: string | null;
  stanje: StanjeStavke;
}

/** Od ovoliko prezentacija se prikazuje polje za pretragu. */
export const PRAG_PRETRAGE = 6;

type FilterVrste = VrstaPrezentacije | 'SVE';

/** "24 slajda · 6 zadataka" / "8 slajdova · 3 pitanja" (srpska množina). */
export function opisSadrzaja(p: Pick<PrezentacijaZaIzbor, 'brojSlajdova' | 'brojPitanja' | 'brojZadataka' | 'vrsta'>): string {
  const delovi = [broj(p.brojSlajdova, 'slajd', 'slajda', 'slajdova')];
  if (p.brojZadataka) delovi.push(broj(p.brojZadataka, 'zadatak', 'zadatka', 'zadataka'));
  const pitanja = p.brojPitanja - (p.brojZadataka ?? 0);
  if (pitanja > 0) delovi.push(broj(pitanja, 'pitanje', 'pitanja', 'pitanja'));
  return delovi.join(' · ');
}

function broj(n: number, jedan: string, dva: string, pet: string): string {
  const d = n % 10;
  const s = n % 100;
  const rec = d === 1 && s !== 11 ? jedan : d >= 2 && d <= 4 && (s < 12 || s > 14) ? dva : pet;
  return `${n} ${rec}`;
}

/** `LocalDateTime` bez zone je isti kalendarski dan kao `danas`. */
export function jeDanas(iso: string, danas: Date = new Date()): boolean {
  const d = new Date(iso);
  return d.getFullYear() === danas.getFullYear() && d.getMonth() === danas.getMonth() && d.getDate() === danas.getDate();
}

/**
 * Izbor prezentacije za pokretanje (dijalog na predavanju, "Vidi sve prezentacije" u konzoli): opcioni predlog na vrhu,
 * filter vrste, pretraga od {@link PRAG_PRETRAGE} prezentacija i lista grupisana po vežbama (redosled stiže od pozivaoca,
 * `GET prezentacije/izbor`). Presentaciona: pokretanje radi pozivalac na `pokreni`; "Nastavi" je link (`urlNastavi`).
 */
@Component({
  selector: 'app-izbor-prezentacije',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, NgTemplateOutlet, MatButton, MatFormField, MatInput, MatLabel],
  template: `
    @if (predlogRedovi().length) {
      <section class="predlog" aria-labelledby="izbor-predlog-naslov" data-predlog>
        <h3 class="naslov" id="izbor-predlog-naslov">{{ naslovPredloga() }}</h3>
        <ul class="kartice">
          @for (r of predlogRedovi(); track r.p.id; let prvi = $first) {
            <li class="kartica" [class.prva]="prvi" [attr.data-predlog-stavka]="r.p.id">
              <ng-container [ngTemplateOutlet]="opisTpl" [ngTemplateOutletContext]="{ $implicit: r }" />
              <ng-container [ngTemplateOutlet]="akcijaTpl" [ngTemplateOutletContext]="{ $implicit: r, glavna: prvi }" />
            </li>
          }
        </ul>
      </section>
    }
    @if (lista()) {
      <section class="sve" [attr.aria-label]="naslovListe()">
        @if (naslovListe() && predlogRedovi().length) {
          <h3 class="naslov">{{ naslovListe() }}</h3>
        }
        <div class="filteri" role="group" aria-label="Vrsta prezentacije">
          @for (f of filteri; track f.vrednost) {
            <button type="button" class="filter" [attr.aria-pressed]="vrsta() === f.vrednost" [attr.data-filter-vrste]="f.vrednost"
                    (click)="vrsta.set(f.vrednost)">{{ f.labela }}</button>
          }
        </div>
        @if (redovi().length > prag) {
          <mat-form-field appearance="outline" class="pretraga" subscriptSizing="dynamic">
            <mat-label>Traži po nazivu</mat-label>
            <input matInput type="search" [value]="upit()" (input)="upit.set($any($event.target).value)" data-pretraga />
          </mat-form-field>
        }
        @for (g of grupe(); track g.vezba) {
          <h4 class="grupa">{{ g.naziv }}</h4>
          <ul class="redovi" [attr.aria-label]="g.naziv">
            @for (r of g.stavke; track r.p.id) {
              <li class="red" [attr.data-prezentacija]="r.p.id">
                <ng-container [ngTemplateOutlet]="opisTpl" [ngTemplateOutletContext]="{ $implicit: r }" />
                <ng-container [ngTemplateOutlet]="akcijaTpl" [ngTemplateOutletContext]="{ $implicit: r, glavna: false }" />
              </li>
            }
          </ul>
        } @empty {
          @if (redovi().length) {
            <p class="prazno" data-bez-rezultata>Nijedna prezentacija ne odgovara izboru.</p>
          }
        }
      </section>
    }

    <ng-template #opisTpl let-r>
      <div class="tekst">
        <span class="naziv">{{ r.p.naziv }}</span>
        <span class="meta">
          <span [class]="'vrsta vrsta-' + r.p.vrsta">{{ oznakaVrste(r.p) }}</span>
          {{ sadrzaj(r.p) }} ·
          @if (r.pusteno) {
            <span class="pusteno">✓ puštano {{ jeDanas(r.pusteno) ? 'danas' : (r.pusteno | date: 'd.M.') }}</span>
          } @else {
            nije puštano
          }
        </span>
        @if (r.stanje.vrsta === 'zauzeta') {
          <span class="meta uzbuna" data-zauzeta>Već je u toku na drugom mestu. Završi je u njenoj konzoli pa je pokreni ovde.</span>
        }
      </div>
    </ng-template>

    <ng-template #akcijaTpl let-r let-glavna="glavna">
      @switch (r.stanje.vrsta) {
        @case ('nastavi') {
          <a matButton="filled" [href]="urlNastavi()(r.stanje.izvodjenjeId)" target="_blank" rel="noopener" data-nastavi
             [attr.aria-label]="'Nastavi: ' + r.p.naziv + ' (otvara se u novoj kartici)'">Nastavi</a>
        }
        @case ('zauzeta') {
          <button matButton="outlined" type="button" disabled data-pokreni [attr.aria-label]="'Pokreni: ' + r.p.naziv">Pokreni</button>
        }
        @default {
          <button [matButton]="glavna ? 'filled' : 'outlined'" type="button" [disabled]="zauzeto()" data-pokreni
                  [attr.aria-label]="'Pokreni: ' + r.p.naziv" (click)="pokreni.emit(r.p)">Pokreni</button>
        }
      }
    </ng-template>
  `,
  styles: `
    :host { display: grid; gap: 16px; }
    .naslov { margin: 0 0 8px; font-size: 12px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
    .kartice, .redovi { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
    .kartica, .red { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border: 1px solid var(--line);
      border-radius: var(--radius); background: var(--surface); }
    .red { padding: 6px 10px; }
    .kartica.prva { border: 2px solid var(--primary); }
    .tekst { display: grid; gap: 2px; min-width: 0; flex: 1; }
    .naziv { font-weight: 600; overflow-wrap: anywhere; }
    .meta { font-size: 12.5px; color: var(--muted); }
    .uzbuna { color: var(--ink); }
    .pusteno { color: var(--ok-ink); }
    .vrsta { display: inline-block; padding: 0 7px; margin-right: 4px; border-radius: 10px; font-size: 11.5px; font-weight: 600; }
    .vrsta-GRADIVO { background: var(--primary-soft); color: var(--primary-soft-ink); }
    .vrsta-PITANJA { background: var(--ok-soft); color: var(--ok-ink); }
    .vrsta-ZADACI { background: var(--warn-soft); color: var(--ink); }
    .filteri { display: flex; flex-wrap: wrap; gap: 6px; }
    .filter { font: inherit; font-size: 13px; padding: 4px 12px; border-radius: 14px; border: 1px solid var(--line);
      background: var(--surface); color: var(--ink); cursor: pointer; }
    .filter[aria-pressed="true"] { background: var(--ink); color: var(--surface); border-color: var(--ink); }
    .filter:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
    .pretraga { width: 100%; }
    .grupa { margin: 4px 0 0; padding-bottom: 2px; border-bottom: 1px solid var(--line); font-size: 13px; font-weight: 600; color: var(--ink-2); }
    .prazno { color: var(--muted); margin: 0; }
  `,
})
export class IzborPrezentacije {
  /** Sve prezentacije, već poređane po vežbama. */
  readonly redovi = input.required<RedIzbora[]>();
  /** Id-jevi predloga redom; prvi je istaknut. */
  readonly predlog = input<number[]>([]);
  readonly naslovPredloga = input('Predlog');
  readonly naslovListe = input('Sve prezentacije');
  /** `false` = samo predlog (završni ekran konzole). */
  readonly lista = input(true, { transform: booleanAttribute });
  /** Pokretanje u toku: dugmad "Pokreni" su onemogućena. */
  readonly zauzeto = input(false, { transform: booleanAttribute });
  readonly urlNastavi = input<(izvodjenjeId: number) => string>(() => '');
  readonly pokreni = output<PrezentacijaZaIzbor>();

  protected readonly prag = PRAG_PRETRAGE;
  protected readonly oznakaVrste = (p: PrezentacijaZaIzbor) => OZNAKA_VRSTE[p.vrsta];
  protected readonly jeDanas = jeDanas;
  protected readonly sadrzaj = opisSadrzaja;
  protected readonly filteri: { vrednost: FilterVrste; labela: string }[] = [
    { vrednost: 'SVE', labela: 'Sve' },
    ...VRSTE_PREZENTACIJE.map(v => ({ vrednost: v as FilterVrste, labela: FILTER_VRSTE[v] })),
  ];
  protected readonly vrsta = signal<FilterVrste>('SVE');
  protected readonly upit = signal('');

  protected readonly predlogRedovi = computed(() => {
    const po = new Map(this.redovi().map(r => [r.p.id, r]));
    return this.predlog().map(id => po.get(id)).filter((r): r is RedIzbora => !!r);
  });

  protected readonly grupe = computed(() => {
    const v = this.vrsta();
    const q = zaPretragu(this.upit());
    const izabrani = this.redovi().filter(r => (v === 'SVE' || r.p.vrsta === v) && (!q || zaPretragu(r.p.naziv).includes(q)));
    return grupisiPoVezbi(izabrani.map(r => ({ ...r, vezba: r.p.vezba })));
  });
}
