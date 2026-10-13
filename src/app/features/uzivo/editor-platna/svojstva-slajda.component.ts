// Svojstva slajda (F6, ništa izabrano): boja pozadine (paleta, ključ istorije `polje-pozadina`) i slika pozadine
// (otpremanje -> `pozadina.medijId`, "Ukloni" -> null). Slika se crta preko boje i staje u slajd (`contain`, platno.css).
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import type { Platno, Tema } from '../data-access/platno.models';
import { IzborBojeComponent } from './izbor-boje.component';
import { OtpremanjeSlike, PRIHVACENE_SLIKE_PANELA } from './otpremanje-slike';
import { PlatnoEditorStore } from './platno-editor.store';

@Component({
  selector: 'app-svojstva-slajda',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [OtpremanjeSlike],
  imports: [IzborBojeComponent, MatButtonModule],
  template: `
    <h3 class="uz-ep-odeljak">Slajd</h3>
    <app-izbor-boje oznaka="Pozadina" [tema]="tema()" [vrednost]="pozadina().boja" (izbor)="postaviBoju($event)" />
    <h3 class="uz-ep-odeljak">Slika pozadine</h3>
    <div class="uz-ep-red">
      <button mat-stroked-button type="button" [disabled]="otpremanje.salje()" (click)="fajl.click()">
        {{ pozadina().medijId ? 'Zameni sliku pozadine' : 'Dodaj sliku pozadine' }}
      </button>
      @if (pozadina().medijId) {
        <button mat-button type="button" [disabled]="otpremanje.salje()" (click)="postaviSliku(null)">Ukloni</button>
      }
      @if (otpremanje.salje()) { <span role="status">Slika se otprema…</span> }
      <input #fajl type="file" hidden [accept]="prihvacene" (change)="otpremanje.izPolja(fajl, postaviSliku)">
    </div>
    <p class="uz-ep-napomena">Slika se crta preko boje i staje u slajd. Izaberi sloj na platnu ili u panelu Slojevi za
      njegova svojstva.</p>
  `,
  styles: `
    :host { display: grid; gap: 8px; }
    .uz-ep-odeljak { margin: 8px 0 0; font-size: 13px; font-weight: 600; color: var(--ink-2); }
    .uz-ep-red { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; color: var(--ink-2); }
    .uz-ep-napomena { margin: 4px 0 0; font-size: 13px; color: var(--ink-2); }
  `,
})
export class SvojstvaSlajdaComponent {
  readonly tema = input.required<Tema>();

  private readonly store = inject(PlatnoEditorStore);
  protected readonly otpremanje = inject(OtpremanjeSlike);
  protected readonly prihvacene = PRIHVACENE_SLIKE_PANELA;
  protected readonly pozadina = computed(() => this.store.platno().pozadina);

  private izmeni(deo: Partial<Platno['pozadina']>, kljuc?: string): void {
    this.store.primeni((p) => {
      const pozadina = { ...p.pozadina, ...deo };
      return pozadina.boja === p.pozadina.boja && pozadina.medijId === p.pozadina.medijId ? p : { ...p, pozadina };
    }, kljuc);
  }

  /** Pozadina je obavezna boja (paleta bez "Bez"). */
  protected postaviBoju(boja: string | null): void {
    if (boja) this.izmeni({ boja }, 'polje-pozadina');
  }

  protected readonly postaviSliku = (medijId: string | null): void => this.izmeni({ medijId });
}
