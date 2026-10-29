import { ChangeDetectionStrategy, Component, DOCUMENT, ElementRef, inject } from '@angular/core';
import { Router } from '@angular/router';

import { adresaStavke, kadaStiglo } from '../data-access/obavestenja.pravila';
import { StavkaZvona } from '../data-access/obavestenja.models';
import { ZvonoStore } from '../data-access/zvono.store';

/**
 * Zvono u zaglavlju naloga (spec „Aplikacija i obaveštenja“ 6.8): ista obaveštenja kao push (čas otkazan / ipak se održava,
 * ocene, posle časa), najnovija prva. Crvena tačka dok student ne otvori zvono; otvaranje je gasi na svim njegovim
 * uređajima. Klik na stavku vodi tamo gde i push. Prikazuje se tek posle prvog uspešnog učitavanja (prijavljen student).
 * Stoji u ljusci tabova (`NalogTabovi`), iznad sadržaja taba; sopstveni `ZvonoStore`.
 */
@Component({
  selector: 'app-zvono-naloga',
  providers: [ZvonoStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'klikVan($event)',
    '(document:keydown.escape)': 'store.zatvori()',
  },
  template: `
    @if (store.ucitano()) {
      <button type="button" class="zvono" [attr.aria-expanded]="store.otvoren()" aria-controls="zvono-spisak"
              [attr.aria-label]="store.novo() ? 'Obaveštenja, ima novih' : 'Obaveštenja'" (click)="prekidac()" data-zvono>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M18 16v-5a6 6 0 0 0-12 0v5l-2 2h16z" /><path d="M10 20a2 2 0 0 0 4 0" />
        </svg>
        @if (store.novo()) {
          <span class="tacka" data-tacka></span>
        }
      </button>
      @if (store.otvoren()) {
        <section id="zvono-spisak" class="panel" aria-label="Obaveštenja" data-zvono-spisak>
          <h2 class="naslov">Obaveštenja</h2>
          @if (store.stavke().length === 0) {
            <p class="prazno">Još nema obaveštenja. Ovde stižu otkazani časovi, ocene i šta je novo posle časa.</p>
          } @else {
            <ul class="spisak">
              @for (s of store.stavke(); track s.id) {
                <li>
                  <button type="button" class="stavka" [attr.data-vrsta]="s.vrsta" (click)="idi(s)">
                    <span class="stavka-naslov">{{ s.naslov }}</span>
                    @if (s.tekst) {
                      <span class="stavka-tekst">{{ s.tekst }}</span>
                    }
                    <span class="stavka-vreme">{{ kada(s) }}</span>
                  </button>
                </li>
              }
            </ul>
          }
        </section>
      }
    }
  `,
  styles: `
    :host { position: relative; display: inline-block; }
    .zvono { position: relative; display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px;
      padding: 0; border: 0; border-radius: 50%; background: transparent; color: var(--hero-ink); cursor: pointer; }
    .zvono:hover { background: rgb(255 255 255 / 12%); }
    .zvono:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
    .zvono svg { width: 24px; height: 24px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round;
      stroke-linejoin: round; }
    .tacka { position: absolute; top: 9px; right: 10px; width: 10px; height: 10px; border: 2px solid var(--hero-bg);
      border-radius: 50%; background: var(--danger); }
    .panel { position: absolute; top: calc(100% + 6px); right: 0; z-index: 5; width: min(360px, calc(100vw - 24px));
      max-height: 70vh; overflow: auto; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface);
      color: var(--ink); box-shadow: var(--shadow); text-align: left; }
    .naslov { margin: 0; padding: 12px 16px 8px; font-size: 15px; }
    .prazno { margin: 0; padding: 0 16px 14px; color: var(--muted); font-size: 14px; }
    .spisak { margin: 0; padding: 0 0 6px; list-style: none; }
    .stavka { display: grid; gap: 2px; width: 100%; min-height: 48px; padding: 10px 16px; border: 0; border-top: 1px solid var(--line);
      background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
    .stavka:hover { background: var(--surface-2); }
    .stavka:focus-visible { outline: 3px solid var(--focus); outline-offset: -3px; }
    .stavka-naslov { font-weight: 600; }
    .stavka-tekst { color: var(--ink-2); font-size: 14px; overflow-wrap: anywhere; }
    .stavka-vreme { color: var(--muted); font-size: 12.5px; }
  `,
})
export class ZvonoNaloga {
  protected readonly store = inject(ZvonoStore);
  private readonly router = inject(Router);
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly dokument = inject(DOCUMENT);

  protected prekidac(): void {
    if (this.store.otvoren()) {
      this.store.zatvori();
    } else {
      this.store.otvori();
    }
  }

  protected klikVan(e: Event): void {
    if (this.store.otvoren() && e.target instanceof Node && this.dokument.contains(e.target) && !this.el.nativeElement.contains(e.target)) {
      this.store.zatvori();
    }
  }

  protected idi(s: StavkaZvona): void {
    this.store.zatvori();
    void this.router.navigateByUrl(adresaStavke(s.putanja));
  }

  protected kada(s: StavkaZvona): string {
    return kadaStiglo(s.kreirano, new Date());
  }
}
