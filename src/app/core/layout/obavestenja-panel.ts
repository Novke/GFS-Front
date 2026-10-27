import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButton } from '@angular/material/button';
import { MatDialog, MatDialogContent, MatDialogRef, MatDialogTitle } from '@angular/material/dialog';
import { RouterLink } from '@angular/router';

import { DatumPipe } from '../../shared/util/datum.pipe';
import { KodZaDiktiranjeApi } from '../api/kod-za-diktiranje.api';
import { ObavestenjeInfo, tekstObavestenja } from '../api/obavestenja.api';
import { ObavestenjaStore } from '../state/obavestenja.store';
import { KodZaDiktiranjeDialog } from './kod-za-diktiranje-dialog';

const ID = 'obavestenja';
const SIRINA_PANELA = 400;
/** Najmanji razmak panela od ivice ekrana. */
const IVICA = 8;

/**
 * Padajuća lista obaveštenja ispod zvona (`ObavestenjaMeni`). Lenji chunk: učitava se tek na prvi klik na zvono, pa nije u
 * početnom paketu. Nemodalni izgled (providna pozadina, uz zvono), a ponašanje dijaloga (`role="dialog"` sa naslovom,
 * fokus unutra, Esc i klik pored zatvaraju, fokus se vraća na zvono), jer stavka ima više radnji (kartica studenta,
 * "Pročitano", "Rešeno"), što meni (`role="menu"`) ne dozvoljava.
 *
 * Klik na stavku sa studentom označi je pročitanom, zatvori listu i otvori `studenti/<id>`; stavka bez studenta (indeks
 * koji ne postoji) nema vezu, ali ima "Pročitano" i "Rešeno". Stavka sa studentom ima i "Kod za diktiranje" (plan C):
 * kod se prikaže jednom u dijalogu, bez mejla, a server rešava sva otvorena obaveštenja tog studenta.
 */
@Component({
  selector: 'app-obavestenja-panel',
  imports: [DatumPipe, MatButton, MatDialogContent, MatDialogTitle, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="zaglavlje">
      <h2 mat-dialog-title>Obaveštenja</h2>
      <button matButton type="button" data-procitaj-sve [disabled]="store.broj().neprocitana === 0" (click)="store.procitajSve()">
        Označi sve kao pročitano
      </button>
    </div>
    <mat-dialog-content class="sadrzaj">
      @if (stavke().length === 0) {
        @if (store.status() === 'error') {
          <div class="stanje">
            <p role="alert">{{ store.greska() }}</p>
            <button matButton="outlined" type="button" data-ponovo (click)="store.ucitaj()">Pokušaj ponovo</button>
          </div>
        } @else if (store.status() !== 'loaded') {
          <p class="stanje" role="status">Učitavanje…</p>
        } @else {
          <p class="stanje" data-prazno>Nema otvorenih obaveštenja.</p>
        }
      } @else {
        <ul class="lista">
          @for (o of stavke(); track o.id) {
            <li [class.neprocitano]="!o.procitano" [attr.data-obavestenje]="o.id">
              @if (o.studentId !== null) {
                <a class="glavno" [routerLink]="['/studenti', o.studentId]" (click)="otvoriKarticu(o)">
                  <span class="tekst">{{ tekst(o) }}</span>
                  <span class="vreme">{{ o.kreirano | datum: 'sa-vremenom' }}@if (!o.procitano) {<span class="sr-only">, nepročitano</span>}</span>
                </a>
              } @else {
                <div class="glavno">
                  <span class="tekst">{{ tekst(o) }}</span>
                  <span class="vreme">{{ o.kreirano | datum: 'sa-vremenom' }}@if (!o.procitano) {<span class="sr-only">, nepročitano</span>}</span>
                </div>
              }
              <div class="akcije">
                @if (o.studentId !== null) {
                  <button matButton type="button" data-kod-za-diktiranje [disabled]="izdaje() !== null"
                          [attr.aria-label]="'Kod za diktiranje: ' + tekst(o)" (click)="kodZaDiktiranje(o)">Kod za diktiranje</button>
                }
                @if (!o.procitano) {
                  <button matButton type="button" data-procitano [attr.aria-label]="'Označi kao pročitano: ' + tekst(o)"
                          (click)="store.procitano(o.id)">Pročitano</button>
                }
                <button matButton type="button" data-reseno [attr.aria-label]="'Označi kao rešeno: ' + tekst(o)"
                        (click)="store.reseno(o.id)">Rešeno</button>
              </div>
            </li>
          }
        </ul>
        @if (jos() > 0) {
          <p class="jos" data-jos>+{{ jos() }} još (prikazano je {{ stavke().length }} najnovijih)</p>
        }
      }
    </mat-dialog-content>
  `,
  styles: `
    :host { display: flex; flex-direction: column; max-height: inherit; }
    .zaglavlje { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 8px 8px 0; border-bottom: 1px solid var(--line); }
    .zaglavlje h2 { margin: 0; padding: 8px 16px; font-size: 16px; font-weight: 700; }
    .zaglavlje h2::before { display: none; }
    .sadrzaj { padding: 0 !important; max-height: none; }
    .lista { margin: 0; padding: 0; list-style: none; }
    li { display: grid; gap: 2px; padding: 10px 16px 6px; border-bottom: 1px solid var(--line); border-left: 3px solid transparent; }
    li:last-child { border-bottom: 0; }
    li.neprocitano { border-left-color: var(--accent); background: var(--primary-soft); }
    .glavno { display: grid; gap: 2px; color: var(--ink); text-decoration: none; overflow-wrap: anywhere; }
    a.glavno:hover .tekst { text-decoration: underline; }
    .tekst { font-size: 14px; font-weight: 600; }
    .vreme { color: var(--muted); font-size: 12.5px; }
    li.neprocitano .vreme { color: var(--ink-2); }
    .akcije { display: flex; justify-content: flex-end; gap: 4px; }
    .stanje { margin: 0; padding: 20px 16px; color: var(--muted); }
    .stanje p { margin: 0 0 8px; color: var(--ink); }
    .jos { margin: 0; padding: 10px 16px; color: var(--muted); font-size: 12.5px; }
  `,
})
export class ObavestenjaPanel {
  protected readonly store = inject(ObavestenjaStore);
  private readonly ref = inject<MatDialogRef<ObavestenjaPanel>>(MatDialogRef);
  private readonly dialog = inject(MatDialog);
  private readonly kodovi = inject(KodZaDiktiranjeApi);
  private readonly destroyRef = inject(DestroyRef);
  /** Obaveštenje za koje se upravo izdaje kod (dugmad su isključena, nema dvostrukog izdavanja). */
  protected readonly izdaje = signal<number | null>(null);

  protected readonly stavke = computed(() => this.store.otvorena());
  protected readonly jos = computed(() => Math.max(0, this.store.broj().otvorena - this.stavke().length));
  protected readonly tekst = tekstObavestenja;

  constructor() {
    this.store.ucitaj();
  }

  protected otvoriKarticu(o: ObavestenjeInfo): void {
    if (!o.procitano) {
      this.store.procitano(o.id);
    }
    this.ref.close();
  }

  /** Greška (404, 429) ide u snackbar preko interceptora; posle uspeha lista i značka se osvežavaju. */
  protected kodZaDiktiranje(o: ObavestenjeInfo): void {
    if (o.studentId === null || this.izdaje() !== null) {
      return;
    }
    this.izdaje.set(o.id);
    this.kodovi.izdaj(o.studentId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: k => {
        this.izdaje.set(null);
        KodZaDiktiranjeDialog.otvori(this.dialog, k);
        this.store.ucitaj();
      },
      error: () => this.izdaje.set(null),
    });
  }

  /** Otvara listu ispod `okidac` (desna ivica poravnata sa njim); ako je već otvorena, vraća nju. */
  static otvori(dialog: MatDialog, okidac: HTMLElement): MatDialogRef<ObavestenjaPanel> {
    const postojeci = dialog.getDialogById(ID);
    if (postojeci) {
      return postojeci as MatDialogRef<ObavestenjaPanel>;
    }
    const r = okidac.getBoundingClientRect();
    const dok = okidac.ownerDocument;
    const sirina = dok.documentElement.clientWidth || dok.defaultView?.innerWidth || SIRINA_PANELA + 2 * IVICA;
    const vrh = Math.round(r.bottom + 4);
    const sirinaPanela = Math.min(SIRINA_PANELA, sirina - 2 * IVICA);
    // desna ivica uz zvono, ali ceo panel u ekranu (na telefonu je zvono preblizu levoj ivici panela)
    const desno = Math.max(IVICA, Math.min(Math.round(sirina - r.right), sirina - IVICA - sirinaPanela));
    return dialog.open(ObavestenjaPanel, {
      id: ID,
      position: { top: `${vrh}px`, right: `${desno}px` },
      width: `${sirinaPanela}px`,
      maxWidth: `calc(100vw - ${2 * IVICA}px)`,
      maxHeight: `calc(100dvh - ${vrh + 8}px)`,
      backdropClass: 'cdk-overlay-transparent-backdrop',
      panelClass: 'gfs-padajuci-panel',
      autoFocus: 'first-heading',
      restoreFocus: true,
    });
  }
}
