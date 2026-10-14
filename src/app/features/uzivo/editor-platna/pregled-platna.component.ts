// Režim "Pregled" editora platna (F18, odluka 22): pun dokument sa animacijama u istom prikazu koji koriste projektor
// i konzola (`platno-prikaz`: `korak` + `animacija`), sa koracima napred i nazad i puštanjem po planu (`planPustanja`).
// Zoneless: tajmer postavlja signale; "Zaustavi", Esc, napuštanje režima (komponenta nestaje) i uništavanje ga gase.
// Okvir koristi globalnu klasu `uz-ed-platno` (isti okvir kao bočni pregled INFO slajda), pa nema sopstvenih stilova.
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { brojKoraka } from '../data-access/platno-koraci';
import { PlatnoPrikazComponent } from '../ui/platno-prikaz.component';
import { PlatnoEditorStore } from './platno-editor.store';
import { type KorakPustanja, korakPreAnimacije, planPustanja } from './pregled';

@Component({
  selector: 'app-pregled-platna',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, PlatnoPrikazComponent],
  host: { class: 'uz-ep-pregled', '(document:keydown.escape)': 'zaustavi()' },
  template: `
    <div class="uz-ed-platno uz-okvir">
      <div class="uz-platno rezim-dan uz-dan">
        <app-platno-prikaz [platno]="store.platno()" [korak]="korak()" [animacija]="animacija()" />
      </div>
    </div>
    <!-- disabledInteractive: na kraju koraka fokus ostaje na dugmetu (ne pada na body); čuvar je na početku pomeri() -->
    <div class="uz-ep-koraci">
      <button mat-stroked-button type="button" disabledInteractive [disabled]="korak() <= 0" (click)="pomeri(-1)">
        <mat-icon svgIcon="arrow_back" />Korak nazad
      </button>
      <span class="uz-ep-korak" role="status">Korak {{ korak() }} / {{ ukupno() }}</span>
      <button mat-stroked-button type="button" disabledInteractive [disabled]="korak() >= ukupno()" (click)="pomeri(1)">
        Korak napred<mat-icon svgIcon="arrow_forward" />
      </button>
    </div>
    <div class="uz-ep-koraci">
      <button mat-stroked-button type="button" (click)="pusti(0)"><mat-icon svgIcon="play_arrow" />Pusti slajd</button>
      <button mat-stroked-button type="button" disabledInteractive [disabled]="!store.izabranaAnimacija()" (click)="pustiOdIzabrane()">
        Pusti od izabrane
      </button>
      <button mat-stroked-button type="button" (click)="zaustavi()"><mat-icon svgIcon="stop" />Zaustavi</button>
    </div>
  `,
  styles: `:host { display: block; }`,
})
export class PregledPlatnaComponent {
  protected readonly store = inject(PlatnoEditorStore);
  protected readonly ukupno = computed(() => brojKoraka(this.store.platno()));
  private readonly k = signal(0);
  protected readonly korak = computed(() => Math.min(this.k(), this.ukupno()));
  /** Nov `kljuc` pušta grupu `grupa` (= korak), kao bočni pregled faze 1; null crta samo krajnje stanje koraka. */
  protected readonly animacija = signal<{ kljuc: number; grupa: number } | null>(null);
  private brojac = 0;
  private tajmer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.zaustavi());
  }

  /**
   * Korak nazad (bez animacije) ili napred (pušta njegovu grupu), pa prekida puštanje. Na granici (dugme onemogućeno,
   * isti uslov kao `[disabled]`; `disabledInteractive` ne blokira klik) ne radi ništa, ni ne zaustavlja puštanje.
   */
  protected pomeri(razlika: 1 | -1): void {
    if (razlika < 0 ? this.korak() <= 0 : this.korak() >= this.ukupno()) return;
    this.zaustavi();
    this.idi(this.korak() + razlika, razlika > 0);
  }

  /** Od koraka `od` (0: grupa 0 se pušta odmah, kao pri ulasku na slajd) do kraja, po planu. */
  protected pusti(od: number): void {
    this.zaustavi();
    this.idi(od, od === 0);
    this.zakazi(planPustanja(this.store.platno(), od));
  }

  protected pustiOdIzabrane(): void {
    const id = this.store.izabranaAnimacija();
    if (id) this.pusti(korakPreAnimacije(this.store.platno(), id));
  }

  protected zaustavi(): void {
    clearTimeout(this.tajmer);
    this.tajmer = undefined;
  }

  private zakazi([prvi, ...ostali]: KorakPustanja[]): void {
    this.tajmer = prvi && setTimeout(() => {
      this.idi(prvi.korak, true);
      this.zakazi(ostali);
    }, prvi.posleMs);
  }

  private idi(k: number, animiraj: boolean): void {
    this.k.set(k);
    this.animacija.set(animiraj ? { kljuc: ++this.brojac, grupa: k } : null);
  }
}
