import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatProgressSpinner } from '@angular/material/progress-spinner';

import { blokVremena, danIDatum, isoDatum, relativniDan } from '../../../shared/util/termin';
import { kljucTermina, MAX_RAZLOG, StudentskiTermin } from '../data-access/casovi.models';
import { CasoviStore } from '../data-access/casovi.store';

/**
 * Kartica „Naredni časovi“ (spec najave odsustva, odeljak 4): naredni termini iz rasporeda studenta, „Neću doći“ jednim
 * dodirom, razlog po želji, „Ipak dolazim“, i „Nema časa“ sa napomenom nastavnika kad je čas otkazan. **Samostalna:**
 * sama daje svoj store i sama učitava (`api/public/nalog/casovi`), bez ulaza i izlaza, pa se može premestiti na drugu
 * stranicu ili u tab bez izmena. Dok se učitava i kad student nema nijedan čas u rasporedu ne prikazuje ništa.
 */
@Component({
  selector: 'app-naredni-casovi',
  imports: [MatButton, MatProgressSpinner],
  providers: [CasoviStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.status() === 'greska') {
      <section class="kartica" aria-labelledby="naslov-casova" data-naredni-casovi>
        <h3 id="naslov-casova">Naredni časovi</h3>
        <p class="greska" role="alert">{{ store.greska() }}</p>
        <button type="button" matButton="outlined" (click)="store.ucitaj()">Pokušaj ponovo</button>
      </section>
    } @else if (store.status() === 'ok' && store.termini().length > 0) {
      <section class="kartica" aria-labelledby="naslov-casova" data-naredni-casovi>
        <h3 id="naslov-casova">Naredni časovi</h3>
        <p class="uvod">Ako nećeš doći, javi ovde pre početka časa. Nastavnik vidi ko je javio.</p>
        <ul class="termini">
          @for (t of store.termini(); track kljuc(t)) {
            @let k = kljuc(t);
            @let opis = t.predmet + ', ' + kada(t);
            <li [attr.data-termin]="k" [class.otkazan]="t.otkazan" [class.najavljeno]="t.najavljeno && !t.otkazan">
              <p class="kada">{{ kada(t) }} · {{ blok(t) }}</p>
              <p class="predmet">
                {{ t.predmet }}
                @if (!t.svojaGrupa) {
                  <span class="grupa">grupa {{ t.grupa }}</span>
                }
              </p>
              @if (t.otkazan) {
                <p class="stanje nema" data-nema-casa>
                  <strong>Nema časa.</strong>
                  @if (t.napomena) {
                    {{ t.napomena }}
                  }
                </p>
              } @else if (t.najavljeno) {
                <p class="stanje" data-najavljeno>
                  <strong>Javljeno da nećeš doći.</strong>
                  @if (t.razlog) {
                    <span class="razlog">Razlog: {{ t.razlog }}</span>
                  }
                </p>
                @if (uredjuje() === k) {
                  <label class="polje">
                    <span>Razlog (nije obavezno)</span>
                    <textarea rows="2" [maxLength]="maxRazlog" [value]="razlog()" (input)="razlog.set(tekst($event))"
                              data-razlog></textarea>
                  </label>
                  <div class="akcije">
                    <button type="button" matButton="filled" [disabled]="store.salje() !== null" (click)="sacuvajRazlog(t)"
                            data-sacuvaj-razlog>Sačuvaj</button>
                    <button type="button" matButton (click)="uredjuje.set(null)">Odustani</button>
                  </div>
                } @else {
                  <div class="akcije">
                    <button type="button" matButton="outlined" [disabled]="store.salje() !== null"
                            [attr.aria-label]="'Ipak dolazim: ' + opis" (click)="store.povuci(t)" data-ipak-dolazim>
                      @if (store.salje() === k) {
                        <mat-progress-spinner mode="indeterminate" diameter="18" aria-hidden="true" />
                      }
                      Ipak dolazim
                    </button>
                    <button type="button" matButton [attr.aria-label]="(t.razlog ? 'Izmeni razlog: ' : 'Dodaj razlog: ') + opis"
                            (click)="urediRazlog(t)" data-dodaj-razlog>{{ t.razlog ? 'Izmeni razlog' : 'Dodaj razlog' }}</button>
                  </div>
                }
              } @else {
                <div class="akcije">
                  <button type="button" matButton="outlined" [disabled]="store.salje() !== null"
                          [attr.aria-label]="'Neću doći: ' + opis" (click)="store.najavi(t, null)" data-necu-doci>
                    @if (store.salje() === k) {
                      <mat-progress-spinner mode="indeterminate" diameter="18" aria-hidden="true" />
                    }
                    Neću doći
                  </button>
                </div>
              }
              @if (store.poruka(); as p) {
                @if (p.kljuc === k) {
                  <p class="poruka" [class.greska]="p.greska" [attr.role]="p.greska ? 'alert' : 'status'">{{ p.tekst }}</p>
                }
              }
            </li>
          }
        </ul>
      </section>
    }
  `,
  styles: `
    :host { display: block; }
    .kartica { margin: 0 0 16px; padding: 12px 16px; border: 1px solid var(--line); border-radius: var(--radius-sm);
      background: var(--surface); }
    h3 { margin: 0 0 4px; font-size: 16px; }
    .uvod { margin: 0 0 8px; color: var(--ink-2); font-size: 14px; }
    .termini { margin: 0; padding: 0; list-style: none; }
    .termini li { padding: 10px 0; border-top: 1px solid var(--line); }
    .kada { margin: 0; font-size: 13px; font-weight: 600; color: var(--ink-2); }
    .predmet { margin: 2px 0 6px; font-weight: 600; overflow-wrap: anywhere; }
    .grupa { margin-left: 6px; font-weight: 400; color: var(--muted); font-size: 13px; }
    .stanje { margin: 0 0 6px; overflow-wrap: anywhere; }
    .nema { color: var(--danger); }
    .najavljeno .stanje strong { color: var(--warn); }
    .razlog { display: block; color: var(--ink-2); font-size: 14px; }
    .akcije { display: flex; flex-wrap: wrap; gap: 8px; }
    .akcije button { min-height: 44px; }
    .akcije mat-progress-spinner { display: inline-block; margin-right: 8px; vertical-align: middle; }
    .polje { display: flex; flex-direction: column; gap: 4px; margin: 0 0 8px; font-size: 14px; }
    .polje textarea { font: inherit; padding: 8px; border: 1px solid var(--line); border-radius: var(--radius-sm);
      background: var(--surface); color: var(--ink); resize: vertical; }
    .poruka { margin: 6px 0 0; font-size: 14px; color: var(--ok); }
    .poruka.greska, .greska { color: var(--danger); }
  `,
})
export class NaredniCasovi {
  protected readonly store = inject(CasoviStore);
  protected readonly maxRazlog = MAX_RAZLOG;
  /** Termin čiji razlog se upravo menja (ključ), i tekst u polju. */
  protected readonly uredjuje = signal<string | null>(null);
  protected readonly razlog = signal('');
  private readonly danas = isoDatum(new Date());

  constructor() {
    this.store.ucitaj();
  }

  protected kljuc(t: StudentskiTermin): string {
    return kljucTermina(t);
  }

  /** `danas, sreda 4. 11.` / `sreda 11. 11.`. */
  protected kada(t: StudentskiTermin): string {
    const r = relativniDan(t.datum, this.danas);
    return (r ? r + ', ' : '') + danIDatum(t.datum);
  }

  protected blok(t: StudentskiTermin): string {
    return blokVremena(t.pocetak, t.kraj);
  }

  protected tekst(e: Event): string {
    return (e.target as HTMLTextAreaElement).value;
  }

  protected urediRazlog(t: StudentskiTermin): void {
    this.razlog.set(t.razlog ?? '');
    this.uredjuje.set(kljucTermina(t));
  }

  protected sacuvajRazlog(t: StudentskiTermin): void {
    this.uredjuje.set(null);
    this.store.najavi(t, this.razlog());
  }
}
