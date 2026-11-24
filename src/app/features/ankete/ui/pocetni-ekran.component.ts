import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

import { AnketePanelStore } from '../data-access/ankete-panel.store';
import { SablonAnkete } from '../data-access/ankete.models';
import { MAX_PRECICA, MAX_PRECICA_TASTERI, bojaPrecice, nazivPrecice, opisPrecice, pretrazi } from '../data-access/ankete.pravila';
import { NazivFolderaComponent } from './naziv-foldera.component';
import { SabloniListaComponent } from './sabloni-lista.component';

/**
 * Početni ekran panela (maketa A): prečice kao pločice (ikonica, natpis, mali opis; na laptopu i broj tastera), "+ prečica",
 * pretraga sačuvanih, folderi, "Bez foldera", "Istorija" i "Nova anketa". Na telefonu i traka prikazane ankete (povratak na
 * rezultate posle strelice nazad).
 */
@Component({
  selector: 'app-anketa-pocetni',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, NazivFolderaComponent, SabloniListaComponent],
  template: `
    @if (store.mogucnosti().poruka; as p) { <p class="pe-napomena" data-anketa-bez-publike>{{ p }}</p> }
    @if (!siroko() && store.anketa(); as a) {
      <button type="button" class="pe-prikazana" (click)="store.prikaziRezultate()" data-anketa-prikazana>
        <span class="pe-prikazana-oznaka">{{ a.otvorena ? 'Otvorena anketa' : 'Poslednja anketa' }} · {{ a.brojGlasalo }} / {{ a.brojMogucih }} glasalo</span>
        <span class="pe-prikazana-pitanje">{{ a.pitanje }}</span>
      </button>
    }
    <div class="pe-sekcija">
      <h3 id="anketa-levo-naslov" class="pe-naslov">Prečice</h3>
      <button mat-button type="button" [disabled]="!store.precice().length" (click)="store.otvoriLevo({ ekran: 'uredi' })" data-anketa-uredi>Uredi</button>
    </div>
    @if (store.ucitava()) {
      <p class="pe-prazno" role="status">Učitavanje…</p>
    } @else if (store.greskaUcitavanja(); as g) {
      <p class="pe-prazno" role="alert">{{ g }} <button mat-button type="button" (click)="store.ucitajSablone()">Pokušaj ponovo</button></p>
    } @else {
      <ul class="pe-plocice" aria-label="Prečice">
        @for (s of store.precice(); track s.id; let i = $index) {
          <li>
            <button type="button" class="pe-plocica" [style.background]="boja(s)" [disabled]="store.radi()"
                    [attr.aria-keyshortcuts]="i < tasteri ? '' + (i + 1) : null" (click)="dodir(s, $event)" data-precica>
              <span class="pe-gore">
                @if (s.ikonica) { <span class="pe-emoji" aria-hidden="true">{{ s.ikonica }}</span> }
                @if (siroko() && i < tasteri) { <kbd class="pe-taster" aria-hidden="true">{{ i + 1 }}</kbd> }
              </span>
              <span class="pe-natpis">{{ naziv(s) }}</span>
              <span class="pe-opis">{{ opis(s) }}</span>
            </button>
          </li>
        }
        @if (store.precice().length < maxPrecica) {
          <li>
            <button type="button" class="pe-plocica pe-dodaj" (click)="store.novSablon({ folderId: null, precica: true })" data-anketa-dodaj-precicu>
              + prečica
            </button>
          </li>
        }
      </ul>
    }
    <mat-form-field class="pe-pretraga" subscriptSizing="dynamic">
      <mat-label>Traži sačuvana pitanja</mat-label>
      <mat-icon matPrefix svgIcon="search" />
      <input matInput type="search" [value]="store.upit()" (input)="store.pretrazi($any($event.target).value)" data-anketa-pretraga>
    </mat-form-field>
    @if (store.upit().trim()) {
      <app-anketa-sabloni-lista [sabloni]="nadjeni()" prazno="Nema sačuvanih pitanja za ovu pretragu." />
    } @else {
      <div class="pe-sekcija">
        <h3 class="pe-naslov">Folderi</h3>
        <button mat-button type="button" (click)="noviFolder.set(true)" data-anketa-nov-folder>+ Nov folder</button>
      </div>
      @if (noviFolder()) {
        <app-anketa-naziv-foldera (sacuvaj)="store.noviFolder($event); noviFolder.set(false)" (otkazi)="noviFolder.set(false)" />
      }
      <ul class="pe-lista">
        @for (f of store.folderi(); track f.id) {
          <li>
            <button type="button" class="pe-stavka" (click)="store.otvoriLevo({ ekran: 'folder', folderId: f.id })" data-folder>
              <mat-icon svgIcon="folder" /><span class="pe-stavka-tekst">{{ f.naziv }}</span>
              <span class="pe-broj">{{ store.brojPoFolderu().get(f.id) ?? 0 }}</span>
            </button>
          </li>
        }
        @if (store.bezFoldera()) {
          <li>
            <button type="button" class="pe-stavka" (click)="store.otvoriLevo({ ekran: 'folder', folderId: null })" data-folder-bez>
              <mat-icon svgIcon="folder" /><span class="pe-stavka-tekst">Bez foldera</span><span class="pe-broj">{{ store.bezFoldera() }}</span>
            </button>
          </li>
        }
        <li>
          <button type="button" class="pe-stavka" (click)="store.otvoriLevo({ ekran: 'istorija' })" data-anketa-istorija>
            <mat-icon svgIcon="history" />
            <span class="pe-stavka-tekst">Istorija<small>sve pokrenute ankete, sa rezultatima</small></span>
          </button>
        </li>
      </ul>
    }
    <div class="pe-dno">
      <button mat-flat-button type="button" (click)="store.nova()" data-anketa-nova><mat-icon svgIcon="add" />Nova anketa</button>
    </div>
  `,
  styles: `
    :host { display: block; }
    .pe-napomena { margin: 0 0 12px; padding: 10px 12px; border-radius: var(--radius-sm); background: var(--warn-soft); color: var(--ink); font-size: 14px; }
    .pe-prikazana {
      display: flex; flex-direction: column; gap: 2px; width: 100%; margin: 0 0 12px; padding: 10px 12px; border: 1px solid var(--line);
      border-radius: var(--radius-sm); background: var(--primary-soft); color: var(--primary-soft-ink); font: inherit; text-align: left; cursor: pointer;
    }
    .pe-prikazana-oznaka { font-size: 12px; font-weight: 600; }
    .pe-prikazana-pitanje { font-weight: 600; overflow-wrap: anywhere; }
    .pe-sekcija { display: flex; align-items: center; justify-content: space-between; margin: 4px 0 6px; }
    .pe-naslov { margin: 0; font-size: 13px; font-weight: 600; letter-spacing: .02em; color: var(--muted); text-transform: uppercase; }
    .pe-plocice { list-style: none; margin: 0 0 14px; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .pe-plocica {
      width: 100%; height: 100%; min-height: 84px; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 10px 12px;
      border: 0; border-radius: var(--radius); color: var(--primary-ink); font: inherit; text-align: left; cursor: pointer;
    }
    .pe-plocica:disabled { opacity: .6; cursor: default; }
    .pe-plocica:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
    .pe-gore { display: flex; justify-content: space-between; width: 100%; min-height: 22px; }
    .pe-emoji { font-size: 20px; line-height: 1; }
    .pe-taster { font: 600 12px var(--font-mono); opacity: .85; }
    .pe-natpis { font-weight: 700; font-size: 15px; overflow-wrap: anywhere; }
    .pe-opis { font-size: 12px; opacity: .9; overflow-wrap: anywhere; }
    .pe-dodaj { justify-content: center; align-items: center; background: none; border: 2px dashed var(--line); color: var(--primary); font-weight: 600; }
    .pe-pretraga { width: 100%; margin-bottom: 8px; }
    .pe-lista { list-style: none; margin: 0 0 12px; padding: 0; }
    .pe-stavka {
      display: flex; align-items: center; gap: 12px; width: 100%; padding: 10px 6px; border: 0; border-bottom: 1px solid var(--line);
      background: none; color: var(--ink); font: inherit; text-align: left; cursor: pointer;
    }
    .pe-stavka:hover { background: var(--surface-2); }
    .pe-stavka-tekst { flex: 1; min-width: 0; display: flex; flex-direction: column; overflow-wrap: anywhere; }
    .pe-stavka-tekst small { color: var(--muted); font-size: 12px; }
    .pe-broj { color: var(--muted); font-variant-numeric: tabular-nums; }
    .pe-prazno { color: var(--muted); }
    .pe-dno { display: flex; justify-content: flex-end; padding-top: 8px; }
  `,
})
export class PocetniEkranComponent {
  readonly siroko = input(false);

  protected readonly store = inject(AnketePanelStore);
  protected readonly tasteri = MAX_PRECICA_TASTERI;
  protected readonly maxPrecica = MAX_PRECICA;
  protected readonly noviFolder = signal(false);
  protected readonly nadjeni = computed(() => pretrazi(this.store.info()?.sabloni ?? [], this.store.upit()));

  protected boja(s: SablonAnkete): string {
    return bojaPrecice(s.boja);
  }

  protected naziv(s: SablonAnkete): string {
    return nazivPrecice(s);
  }

  protected opis(s: SablonAnkete): string {
    return opisPrecice(s);
  }

  /** Posle klika mišem fokus ne ostaje na pločici: Enter i R su tada tasteri panela. */
  protected dodir(s: SablonAnkete, e: MouseEvent): void {
    if (e.detail > 0) {
      (e.currentTarget as HTMLElement | null)?.blur();
    }
    this.store.dodir(s);
  }
}
