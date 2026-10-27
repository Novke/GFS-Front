import { DatePipe, DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogRef, MatDialogTitle } from '@angular/material/dialog';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatProgressBar } from '@angular/material/progress-bar';
import { forkJoin, Observable } from 'rxjs';

import { IzvodjenjeNaPredavanju, PrezentacijaZaIzbor, PrezentacijePredavanjaApi } from '../../../core/api/prezentacije-predavanja.api';
import { razlogZahteva } from '../data-access/prezentacije-predavanja.store';
import { konzolaIzvodjenja } from './izvodjenje-putanje';

/** Ishod dijaloga: pokrenuto izvođenje i da li se konzola otvorila u novoj kartici (`false` = pregledač je blokirao karticu). */
export interface PokrenutaPrezentacija {
  izvodjenjeId: number;
  otvorena: boolean;
}

export interface PokreniPrezentacijuCfg {
  predavanjeId: number;
  predmetId: number;
}

/** Od ovoliko prezentacija se prikazuje polje za filtriranje. */
export const PRAG_FILTERA = 6;

/** Apsolutni URL konzole izvođenja (`<base href>` + putanja), za novu karticu. */
export function urlKonzole(dokument: Document, izvodjenjeId: number): string {
  return new URL(konzolaIzvodjenja(izvodjenjeId), dokument.baseURI).href;
}

/** Najskorije izmenjena prvo (ista sekunda: veći id, tj. novija); `izmenjeno` je ISO bez zone, pa se poredi kao tekst. */
export function poRedosledu(lista: PrezentacijaZaIzbor[]): PrezentacijaZaIzbor[] {
  return [...lista].sort((a, b) => (b.izmenjeno ?? '').localeCompare(a.izmenjeno ?? '') || b.id - a.id);
}

/** Stanje stavke prema izvođenjima u toku: "Nastavi" (u toku za OVO predavanje), zauzeta (u toku drugde) ili slobodna. */
export type StanjeStavke = { vrsta: 'slobodna' } | { vrsta: 'nastavi'; izvodjenjeId: number } | { vrsta: 'zauzeta' };

export function stanjeStavke(p: PrezentacijaZaIzbor, uTokuOvde: readonly IzvodjenjeNaPredavanju[]): StanjeStavke {
  if (p.aktivnoIzvodjenjeId === null || p.aktivnoIzvodjenjeId === undefined) return { vrsta: 'slobodna' };
  const ovde = uTokuOvde.find(i => i.id === p.aktivnoIzvodjenjeId);
  return ovde ? { vrsta: 'nastavi', izvodjenjeId: ovde.id } : { vrsta: 'zauzeta' };
}

/**
 * Izbor prezentacije predmeta za predavanje u toku. "Pokreni" odmah pokreće izvođenje vezano za predavanje (sa čuvanjem) i
 * otvara konzolu u NOVOJ kartici, da beleženje na ovoj stranici ne prestane. Kartica se otvara sinhrono iz klika (prazna
 * `about:blank`), a adresa joj se postavlja kad server odgovori: `window.open` posle asinhronog poziva blokiraju pregledači
 * (Safari odmah). Ako je i prazna kartica blokirana, izvođenje je ipak pokrenuto i dijalog se zatvara; stranica predavanja
 * nudi "Nastavi" u svom odeljku. "Nastavi" (izvođenje u toku za ovo predavanje) je običan link u novu karticu, bez drugog starta.
 * Prezentacija u toku negde drugde (bez predavanja ili za drugo) ne može dvaput u toku (server: 409), pa je ovde zaključana.
 */
@Component({
  selector: 'app-pokreni-prezentaciju-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, FormsModule, MatButton, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogTitle, MatFormField, MatInput, MatLabel, MatProgressBar],
  template: `
    <h2 mat-dialog-title>Pokreni prezentaciju</h2>
    <mat-dialog-content>
      @if (ucitava()) {
        <mat-progress-bar mode="indeterminate" aria-label="Učitavanje prezentacija" />
      }
      @if (greska(); as g) {
        <p class="greska" role="alert" data-greska>{{ g }}</p>
      }
      @if (!ucitava() && sve().length === 0 && !greskaUcitavanja()) {
        <p class="prazno" data-prazno>Ovaj predmet još nema prezentacija. Napravi je u odeljku Prezentacije.</p>
      }
      @if (sve().length > prag) {
        <mat-form-field appearance="outline" class="filter">
          <mat-label>Traži prezentaciju</mat-label>
          <input matInput type="search" [ngModel]="filter()" (ngModelChange)="filter.set($event)" data-filter />
        </mat-form-field>
      }
      @if (prikazane().length) {
        <ul class="lista" aria-label="Prezentacije predmeta">
          @for (s of prikazane(); track s.p.id) {
            <li class="stavka" [attr.data-prezentacija]="s.p.id">
              <div class="tekst">
                <span class="naziv">{{ s.p.naziv }}</span>
                <span class="meta">
                  {{ s.p.brojSlajdova }} {{ s.p.brojSlajdova === 1 ? 'slajd' : 'slajdova' }}
                  @if (s.p.brojPitanja) { · pitanja: {{ s.p.brojPitanja }} }
                  · izmenjeno {{ s.p.izmenjeno | date: 'd.M.yyyy.' }}
                </span>
                @if (s.stanje.vrsta === 'zauzeta') {
                  <span class="meta uzbuna" data-zauzeta>Već je u toku, ali ne na ovom predavanju. Završi je u konzoli pa je pokreni ovde.</span>
                }
              </div>
              @switch (s.stanje.vrsta) {
                @case ('nastavi') {
                  <a matButton="filled" [href]="url(s.stanje.izvodjenjeId)" target="_blank" rel="noopener" data-nastavi
                     [attr.aria-label]="'Nastavi: ' + s.p.naziv + ' (otvara se u novoj kartici)'">Nastavi</a>
                }
                @case ('zauzeta') {
                  <button matButton="outlined" type="button" disabled data-pokreni [attr.aria-label]="'Pokreni: ' + s.p.naziv">Pokreni</button>
                }
                @default {
                  <button matButton="filled" type="button" [disabled]="salje()" data-pokreni
                          [attr.aria-label]="'Pokreni: ' + s.p.naziv" (click)="pokreni(s.p)">Pokreni</button>
                }
              }
            </li>
          }
        </ul>
      } @else if (sve().length > 0) {
        <p class="prazno" data-bez-rezultata>Nijedna prezentacija ne odgovara pretrazi.</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" mat-dialog-close>Zatvori</button>
    </mat-dialog-actions>
  `,
  styles: `
    .filter { width: 100%; }
    .lista { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
    .stavka { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
    .tekst { display: grid; gap: 2px; min-width: 0; flex: 1; }
    .naziv { font-weight: 600; overflow-wrap: anywhere; }
    .meta { font-size: 12.5px; color: var(--muted); }
    .uzbuna { color: var(--ink); }
    .greska { color: var(--danger-ink); margin: 0 0 8px; }
    .prazno { color: var(--muted); }
  `,
})
export class PokreniPrezentacijuDialog {
  private readonly cfg = inject<PokreniPrezentacijuCfg>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<PokreniPrezentacijuDialog, PokrenutaPrezentacija>>(MatDialogRef);
  private readonly api = inject(PrezentacijePredavanjaApi);
  private readonly dokument = inject(DOCUMENT);

  protected readonly prag = PRAG_FILTERA;
  protected readonly ucitava = signal(true);
  protected readonly salje = signal(false);
  protected readonly greska = signal<string | null>(null);
  protected readonly greskaUcitavanja = signal(false);
  protected readonly filter = signal('');
  protected readonly sve = signal<PrezentacijaZaIzbor[]>([]);
  private readonly uTokuOvde = signal<IzvodjenjeNaPredavanju[]>([]);

  protected readonly prikazane = computed(() => {
    const upit = this.filter().trim().toLocaleLowerCase('sr-Latn');
    return poRedosledu(this.sve())
      .filter(p => !upit || p.naziv.toLocaleLowerCase('sr-Latn').includes(upit))
      .map(p => ({ p, stanje: stanjeStavke(p, this.uTokuOvde()) }));
  });

  constructor() {
    forkJoin({
      prezentacije: this.api.prezentacije(this.cfg.predmetId),
      izvodjenja: this.api.izvodjenja(this.cfg.predavanjeId),
    }).pipe(takeUntilDestroyed()).subscribe({
      next: ({ prezentacije, izvodjenja }) => {
        this.sve.set(prezentacije);
        this.uTokuOvde.set(izvodjenja.filter(i => i.status === 'AKTIVNO'));
        this.ucitava.set(false);
      },
      error: e => {
        this.greskaUcitavanja.set(true);
        this.greska.set(razlogZahteva(e));
        this.ucitava.set(false);
      },
    });
  }

  protected url(izvodjenjeId: number): string {
    return urlKonzole(this.dokument, izvodjenjeId);
  }

  protected pokreni(p: PrezentacijaZaIzbor): void {
    if (this.salje()) return;
    this.salje.set(true);
    this.greska.set(null);
    // sinhrono iz klika: prazna kartica; adresa joj se postavlja kad server odgovori
    const kartica = this.dokument.defaultView?.open('about:blank', '_blank') ?? null;
    if (kartica) kartica.opener = null;
    this.api.pokreni(p.id, this.cfg.predavanjeId).subscribe({
      next: i => {
        if (kartica) kartica.location.href = this.url(i.id);
        this.ref.close({ izvodjenjeId: i.id, otvorena: kartica !== null });
      },
      error: e => {
        kartica?.close();
        this.salje.set(false);
        this.greska.set(razlogZahteva(e));
      },
    });
  }

  /** Emituje pokrenuto izvođenje ili `undefined` kad nastavnik zatvori dijalog bez pokretanja. */
  static otvori(dialog: MatDialog, cfg: PokreniPrezentacijuCfg): Observable<PokrenutaPrezentacija | undefined> {
    return dialog.open<PokreniPrezentacijuDialog, PokreniPrezentacijuCfg, PokrenutaPrezentacija>(PokreniPrezentacijuDialog, {
      data: cfg, width: '36rem', maxWidth: '96vw', autoFocus: 'first-tabbable',
    }).afterClosed();
  }
}
