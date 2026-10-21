// Pregled prelaza u editoru (faza 5, F17). Učitava se samo lenjo (`import()` iz stranice editora): dijalog, direktiva i
// kadrovi prelaza ne ulaze u fajl stranice.
import { afterNextRender, ChangeDetectionStrategy, Component, computed, ElementRef, inject, signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { brojKoraka } from '../data-access/platno-koraci';
import type { Tema } from '../data-access/platno.models';
import { PRELAZ } from '../data-access/slajd-pravila';
import type { SlajdDetails } from '../data-access/uzivo.models';
import { smanjenoKretanje } from '../ui/kretanje';
import { kadroviPrelaza } from '../ui/prelaz-slajda';
import { PokretPrelaza, PrelazDirective } from '../ui/prelaz.directive';
import { SlajdPrikazComponent } from '../ui/slajd-prikaz.component';

export interface PregledPrelazaPodaci {
  /** Slajd pre izabranog u prezentaciji; `null`: prvi slajd (ulazni dolazi preko pozadine, kao sa prijave). */
  pre: SlajdDetails | null;
  /** Izabrani slajd iz lokalnog stanja editora (sa prelazom iz forme, i pre čuvanja). */
  slajd: SlajdDetails;
  tema: Tema;
}

/** Otvara pregled; fokus postavlja dijalog sam (`autoFocus: false`, CDK fokus stiže tek posle animacije otvaranja). */
export function otvoriPregledPrelaza(dialog: MatDialog, podaci: PregledPrelazaPodaci): void {
  dialog.open(PrelazPregledDialog, { data: podaci, width: '720px', maxWidth: '95vw', autoFocus: false });
}

/**
 * Prelaz na izabrani slajd kao na projektoru: isti omotači (`uz-scena-slajdovi`), `PrelazDirective` i `kadroviPrelaza`;
 * kreće pri otvaranju, "Ponovi" ga pušta ponovo (nov ključ). Grupa 0 PLATNO slajda kreće posle prelaza (dok traje, korak
 * -1), a prethodni PLATNO slajd se crta posle svih koraka (stanje u kom se sa njega odlazi). Trajanje iz forme koja još
 * ima grešku se ograničava na 0,1-5 s. Sa smanjenim kretanjem nema prelaza (samo poruka i nov slajd).
 */
@Component({
  selector: 'app-prelaz-pregled-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule, PrelazDirective, SlajdPrikazComponent],
  template: `
    <h2 mat-dialog-title>Pregled prelaza</h2>
    <mat-dialog-content>
      @if (smanjeno) {
        <p class="uz-ed-napomena" role="status">Prelazi su isključeni u podešavanjima sistema (smanjeno kretanje).</p>
      }
      <div class="uz-scena-slajdovi uz-ed-prelaz-okvir rezim-dan uz-dan">
        @if (pre && uToku()) {
          <div class="uz-scena-odlazni" aria-hidden="true" [appPrelaz]="odlazniPokret()" [appPrelazZadrzi]="true">
            <app-slajd-prikaz [slajd]="pre" [tema]="tema" [korak]="korakPre" />
          </div>
        }
        <div class="uz-scena-ulazni" [appPrelaz]="ulazniPokret()" (appPrelazKraj)="zavrsen.set($event)">
          <app-slajd-prikaz [slajd]="slajd" [tema]="tema" [korak]="korak()" [animacija]="animacija()" />
        </div>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button #ponovi mat-stroked-button type="button" (click)="kljuc.set(kljuc() + 1)">Ponovi</button>
      <button mat-flat-button type="button" mat-dialog-close>Zatvori</button>
    </mat-dialog-actions>
  `,
  // isti raspored omotača kao scena projektora (`PublikaScenaComponent`; stil je u komponentama, ne u početnom paketu)
  styles: `
    .uz-scena-slajdovi { display: grid; grid-template-columns: minmax(0, 1fr); overflow: hidden; }
    .uz-scena-slajdovi > * { grid-area: 1 / 1; min-width: 0; }
    .uz-scena-ulazni { position: relative; z-index: 1; }
    .uz-ed-prelaz-okvir { background: var(--ink); border-radius: 4px; }
  `,
})
export class PrelazPregledDialog {
  private readonly podaci = inject<PregledPrelazaPodaci>(MAT_DIALOG_DATA);
  protected readonly pre = this.podaci.pre;
  protected readonly slajd = this.podaci.slajd;
  protected readonly tema = this.podaci.tema;
  protected readonly smanjeno = smanjenoKretanje();
  protected readonly korakPre = this.pre?.tip === 'PLATNO' && this.pre.platno ? brojKoraka(this.pre.platno) : 0;
  private readonly prelaz = this.slajd.prelaz && !this.smanjeno ? this.slajd.prelaz : null;
  private readonly kadrovi = this.prelaz ? kadroviPrelaza(this.prelaz) : null;
  private readonly trajanjeMs = Math.min(PRELAZ.max, Math.max(PRELAZ.min, this.prelaz?.trajanjeMs || PRELAZ.podrazumevano));
  private readonly platno = this.slajd.tip === 'PLATNO';

  protected readonly kljuc = signal(1);
  protected readonly zavrsen = signal(0);
  protected readonly uToku = computed(() => this.kadrovi !== null && this.zavrsen() !== this.kljuc());
  protected readonly ulazniPokret = computed<PokretPrelaza | null>(() =>
    this.uToku() ? { kljuc: this.kljuc(), kadrovi: this.kadrovi!.ulazni, trajanjeMs: this.trajanjeMs } : null);
  protected readonly odlazniPokret = computed<PokretPrelaza | null>(() =>
    this.uToku() && this.kadrovi!.odlazni ? { kljuc: this.kljuc(), kadrovi: this.kadrovi!.odlazni, trajanjeMs: this.trajanjeMs } : null);
  protected readonly korak = computed(() => (this.platno && this.uToku() ? -1 : 0));
  protected readonly animacija = computed(() => (this.platno && !this.uToku() ? { kljuc: this.kljuc(), grupa: 0 } : null));

  private readonly ponovi = viewChild.required<string, ElementRef<HTMLButtonElement>>('ponovi', { read: ElementRef });

  constructor() {
    afterNextRender(() => this.ponovi().nativeElement.focus());
  }
}
