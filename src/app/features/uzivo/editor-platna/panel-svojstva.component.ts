// Panel "Svojstva" editora platna (F6): bez izbora svojstva slajda; za izbor zajednička polja (položaj, veličina,
// providnost, senka) i, za tačno jedan sloj, polja njegove vrste (OBLIK i okvir TEKSTA, SLIKA); svojstva teksta (F13) za
// jedan ili više izabranih TEKST slojeva. TABELA (F14): panel tabele i ispod svojstva teksta opsega ćelija. CRTEZ i
// FORMULA imaju samo zajednička polja (F16 dodaje formulu). Panel je van okvira platna, pa prečice platna u njegovim poljima ne rade (odluka 24). Tokom uređivanja teksta
// (F12) panel pokazuje samo svojstva teksta (F13, komande idu uređivaču) i dugme "Završi uređivanje (Esc)"; tabovi
// Slojevi i Animacije su tada onemogućeni (napomena ovde).
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import type { Tema } from '../data-access/platno.models';
import { FokusPlatna } from './fokus-platna';
import { PlatnoEditorStore } from './platno-editor.store';
import { SvojstvaOblikaComponent } from './svojstva-oblika.component';
import { SvojstvaSlajdaComponent } from './svojstva-slajda.component';
import { SvojstvaSlikeComponent } from './svojstva-slike.component';
import { SvojstvaSlojaComponent } from './svojstva-sloja.component';
import { SvojstvaTabeleComponent } from './svojstva-tabele.component';
import { SvojstvaTekstaComponent } from './svojstva-teksta.component';

@Component({
  selector: 'app-panel-svojstva',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule, SvojstvaOblikaComponent, SvojstvaSlajdaComponent, SvojstvaSlikeComponent, SvojstvaSlojaComponent,
    SvojstvaTabeleComponent, SvojstvaTekstaComponent,
  ],
  template: `
    @if (store.uredjivanje()) {
      <p class="uz-ep-napomena">Uređuje se tekst. Slojevi i animacije: Završi uređivanje teksta (Esc).</p>
      <button mat-stroked-button type="button" (click)="zavrsi()">Završi uređivanje (Esc)</button>
      <app-svojstva-teksta [tema]="tema()" />
    } @else if (store.izbor().length === 0) {
      <app-svojstva-slajda [tema]="tema()" />
    } @else {
      <app-svojstva-sloja [tema]="tema()" />
      @if (samoTekst()) {
        <app-svojstva-teksta [tema]="tema()" />
      }
      @if (store.jedan(); as s) {
        @if (s.tip === 'OBLIK' || s.tip === 'TEKST') {
          <app-svojstva-oblika [sloj]="s" [tema]="tema()" />
        } @else if (s.tip === 'SLIKA') {
          <app-svojstva-slike [sloj]="s" />
        } @else if (s.tip === 'TABELA') {
          <app-svojstva-tabele [sloj]="s" [tema]="tema()" />
          <app-svojstva-teksta [tema]="tema()" />
        }
      }
    }
  `,
  styles: `
    :host { display: grid; gap: 8px; padding: 8px 4px 12px; }
    .uz-ep-napomena { margin: 0; font-size: 13px; color: var(--ink-2); }
    :host > button { justify-self: start; }
  `,
})
export class PanelSvojstvaComponent {
  readonly tema = input.required<Tema>();
  protected readonly store = inject(PlatnoEditorStore);
  private readonly fokusPlatna = inject(FokusPlatna, { optional: true });
  /** Svi izabrani slojevi su TEKST (mešan izbor nema zajednička svojstva teksta). */
  protected readonly samoTekst = computed(() => this.store.izabraniSlojevi().every((s) => s.tip === 'TEKST'));

  /** Kraj uređivanja teksta iz panela: tekst u dokument, fokus na okvir platna (kao Esc). */
  protected zavrsi(): void {
    if (this.store.zavrsiUredjivanje()) this.fokusPlatna?.fokus();
  }
}
