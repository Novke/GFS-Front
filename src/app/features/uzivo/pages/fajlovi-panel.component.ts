import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
import { FajlPrezentacijeInfo, PRIHVACENI_FAJLOVI, oznakaVrste, velicinaFajla } from '../../../shared/util/fajlovi';
import { FajloviEditorStore, MAX_FAJLOVA } from '../data-access/fajlovi-editor.store';
import { urlFajlaPrezentacije } from '../data-access/fajlovi-prezentacije.api';

/** Slajd za izbor u panelu: samo sačuvani (pravi id); nacrt slajda (negativan id) još ne postoji na serveru. */
export interface SlajdZaFajl { id: number; rb: number; oznaka: string; }

/**
 * Panel „Fajlovi za studente” u editoru prezentacije (spec 2026-11-20, odeljak 6): lista sa veličinom i slajdom, „Dodaj fajl”
 * (izbor slajda ili cele prezentacije), preimenovanje, gore/dole, preuzimanje i brisanje uz potvrdu. Studenti fajlove dobijaju
 * preko koda sa table (`/f`) i preko naloga posle časa. Stanje je u `FajloviEditorStore` (provide-uje ga stranica editora); otvaranje panela čita spisak ponovo (brisanje slajda menja vezu fajla).
 */
@Component({
  selector: 'app-fajlovi-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatExpansionModule, MatIconModule],
  styles: `
    .fp-red { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px 12px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--line); }
    .fp-ime { width: 100%; min-width: 0; padding: 6px 8px; font: inherit; color: var(--ink); background: var(--surface); border: 1px solid var(--line); border-radius: 6px; }
    .fp-meta { grid-column: 1; display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: center; color: var(--muted); font-size: 0.875rem; }
    .fp-akcije { grid-column: 2; grid-row: 1 / span 2; display: flex; align-items: center; }
    .fp-izbor { padding: 4px 6px; font: inherit; color: var(--ink); background: var(--surface); border: 1px solid var(--line); border-radius: 6px; max-width: 100%; }
    .fp-dodaj { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; margin-top: 12px; }
    .fp-lista { list-style: none; margin: 0; padding: 0; }
    .fp-skriveno { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
    .fp-vrsta { font-weight: 600; color: var(--ink-2); }
  `,
  template: `
    <mat-expansion-panel class="uz-ed-podesavanja" [expanded]="otvoreno()" (opened)="otvoreno.set(true); store.ucitaj()" (closed)="otvoreno.set(false)" data-fajlovi-panel>
      <mat-expansion-panel-header>
        <mat-panel-title>Fajlovi za studente</mat-panel-title>
        <mat-panel-description>{{ opis() }}</mat-panel-description>
      </mat-expansion-panel-header>
      <div class="uz-ed-podesavanja-telo">
        <p class="uz-ed-napomena">Studenti ih preuzimaju na računaru kodom sa table (stranica „/f“) dok traje čas, a posle časa u svom nalogu.
          Fajl uz slajd se pojavljuje tek kad se taj slajd prikaže; fajl uz celu prezentaciju je dostupan od početka.</p>
        @if (store.greska(); as g) {
          <p class="uz-ed-greska" role="alert">{{ g }} <button mat-button type="button" (click)="store.ucitaj()">Pokušaj ponovo</button></p>
        } @else if (store.ucitano() && !store.fajlovi().length) {
          <p class="uz-ed-napomena" data-fajlovi-prazno>Nema fajlova uz ovu prezentaciju.</p>
        }
        <ol class="fp-lista" aria-label="Fajlovi prezentacije">
          @for (f of store.fajlovi(); track f.id; let i = $index; let prvi = $first; let poslednji = $last) {
            <li class="fp-red" data-fajl>
              <input class="fp-ime" type="text" maxlength="200" [value]="f.naziv" [attr.aria-label]="'Naziv fajla ' + f.naziv"
                     [disabled]="store.radi()" (change)="preimenuj(f, $any($event.target))" (keydown.enter)="$any($event.target).blur()">
              <div class="fp-akcije">
                <button mat-icon-button type="button" [disabled]="prvi || store.radi()" disabledInteractive [attr.aria-label]="'Pomeri gore: ' + f.naziv"
                        (click)="store.pomeri(f.id, -1)"><mat-icon svgIcon="arrow_upward" /></button>
                <button mat-icon-button type="button" [disabled]="poslednji || store.radi()" disabledInteractive [attr.aria-label]="'Pomeri dole: ' + f.naziv"
                        (click)="store.pomeri(f.id, 1)"><mat-icon svgIcon="arrow_downward" /></button>
                <a mat-icon-button [href]="url(f.id)" download [attr.aria-label]="'Preuzmi ' + f.naziv"><mat-icon svgIcon="download" /></a>
                <button mat-icon-button type="button" [disabled]="store.radi()" disabledInteractive [attr.aria-label]="'Obriši ' + f.naziv"
                        (click)="obrisi(f)"><mat-icon svgIcon="delete" /></button>
              </div>
              <div class="fp-meta">
                <span class="fp-vrsta">{{ vrsta(f) }}</span>
                <span>{{ velicina(f.velicina) }}</span>
                <label>Uz:
                  <select class="fp-izbor" [attr.aria-label]="'Slajd za fajl ' + f.naziv" [disabled]="store.radi()"
                          (change)="premesti(f, $any($event.target))">
                    <option value="" [selected]="f.slajdId === null">Cela prezentacija</option>
                    @for (s of slajdoviZa(f); track s.id) {
                      <option [value]="s.id" [selected]="s.id === f.slajdId">Slajd {{ s.rb }}: {{ s.oznaka }}</option>
                    }
                  </select>
                </label>
              </div>
            </li>
          }
        </ol>
        <div class="fp-dodaj">
          <input #izbor class="fp-skriveno" type="file" [accept]="prihvaceno" tabindex="-1" aria-hidden="true" data-fajl-ulaz
                 (change)="izabran($any($event.target))">
          <label>Novi fajl uz:
            <select class="fp-izbor" aria-label="Slajd za novi fajl" [value]="noviSlajd()" (change)="noviSlajd.set($any($event.target).value)" data-novi-slajd>
              <option value="">Cela prezentacija</option>
              @for (s of slajdovi(); track s.id) { <option [value]="s.id">Slajd {{ s.rb }}: {{ s.oznaka }}</option> }
            </select>
          </label>
          <button mat-stroked-button type="button" [disabled]="store.radi() || store.punoFajlova()" disabledInteractive
                  (click)="izbor.click()" data-dodaj-fajl>
            <mat-icon svgIcon="upload_file" />Dodaj fajl
          </button>
          <span class="uz-ed-napomena">Word, Excel, PowerPoint, PDF ili ZIP, do 10 MB; najviše {{ najvise }} fajlova.</span>
        </div>
      </div>
    </mat-expansion-panel>
  `,
})
export class FajloviPanelComponent {
  protected readonly store = inject(FajloviEditorStore);
  private readonly dialog = inject(MatDialog);

  /** Sačuvani slajdovi prezentacije (redom), za izbor slajda. */
  readonly slajdovi = input.required<SlajdZaFajl[]>();

  protected readonly otvoreno = signal(false);
  protected readonly noviSlajd = signal('');
  protected readonly prihvaceno = PRIHVACENI_FAJLOVI;
  protected readonly najvise = MAX_FAJLOVA;
  protected readonly url = urlFajlaPrezentacije;
  protected readonly velicina = velicinaFajla;
  protected readonly opis = computed(() => {
    const n = this.store.fajlovi().length;
    return n === 0 ? 'nema fajlova' : n === 1 ? '1 fajl' : `${n} fajlova`;
  });

  protected vrsta(f: FajlPrezentacijeInfo): string {
    return oznakaVrste(f.vrsta);
  }

  /** Slajdovi za izbor uz fajl: i slajd na koji je fajl već vezan, ako ga (još) nema u listi sačuvanih. */
  protected slajdoviZa(f: FajlPrezentacijeInfo): SlajdZaFajl[] {
    const s = this.slajdovi();
    return f.slajdId !== null && f.slajdRb !== null && !s.some(x => x.id === f.slajdId)
      ? [...s, { id: f.slajdId, rb: f.slajdRb, oznaka: '' }]
      : s;
  }

  protected preimenuj(f: FajlPrezentacijeInfo, polje: HTMLInputElement): void {
    this.store.izmeni(f, polje.value, f.slajdId);
    polje.value = f.naziv; // prikaz se vraća na stanje servera; uspešna izmena ga ponovo postavlja iz odgovora
  }

  protected premesti(f: FajlPrezentacijeInfo, izbor: HTMLSelectElement): void {
    const slajdId = izbor.value === '' ? null : Number(izbor.value);
    this.store.izmeni(f, f.naziv, slajdId);
    izbor.value = f.slajdId === null ? '' : String(f.slajdId);
  }

  protected izabran(ulaz: HTMLInputElement): void {
    const fajl = ulaz.files?.[0];
    ulaz.value = '';
    if (!fajl) return;
    this.store.dodaj(fajl, this.noviSlajd() === '' ? null : Number(this.noviSlajd()));
  }

  protected obrisi(f: FajlPrezentacijeInfo): void {
    ConfirmDialog.otvori(this.dialog, {
      naslov: 'Obrisati fajl?', tekst: `„${f.naziv}“ više neće biti dostupan studentima.`, potvrdi: 'Obriši', destruktivno: true,
    }).subscribe(da => da && this.store.obrisi(f.id));
  }
}
