// Koren editora platna (F4b): traka, okvir platna (prikaz + sloj izbora) i paneli. Lenj: stranica editora ga crta samo u
// `@defer` bloku PLATNO slajda, jedna instanca po slajdu (`@for ... track kljuc`), pa istorija pripada slajdu i nestaje
// pri promeni slajda, a ne nestaje kad nacrt dobije pravi id (odluka 8). Svaku zabeleženu izmenu sam predaje
// `EditorStore.izmeniPlatno` (izlaz store-a), a otvorenu sesiju (gest F5, tekst F12) registruje za pražnjenje pre čuvanja.
import {
  ChangeDetectionStrategy, Component, ElementRef, OnDestroy, OnInit, afterNextRender, computed, inject, input, viewChild,
} from '@angular/core';
import { MatTabsModule } from '@angular/material/tabs';
import { EditorStore } from '../data-access/editor.store';
import type { Tema } from '../data-access/platno.models';
import type { SlajdDetails } from '../data-access/uzivo.models';
import { PlatnoPrikazComponent } from '../ui/platno-prikaz.component';
import { FokusPlatna } from './fokus-platna';
import { nazivSloja } from './komande';
import { OtpremanjeSlike } from './otpremanje-slike';
import { OZNAKA_EDITORA_PLATNA } from './oznake';
import { PanelSlojeviComponent } from './panel-slojevi.component';
import { PanelSvojstvaComponent } from './panel-svojstva.component';
import { PlatnoEditorStore, type TabPanela } from './platno-editor.store';
import { PlatnoOverlayComponent } from './platno-overlay.component';
import { komandaTastature, jeSnimanje, uPoljuZaUnos } from './tastatura-platna';
import { TrakaAlataComponent } from './traka-alata.component';

/** Tabovi panela redom (indeks `mat-tab-group`-a); "Animacije" dolazi u F17. */
const TABOVI: readonly TabPanela[] = ['SVOJSTVA', 'SLOJEVI'];

@Component({
  selector: 'app-platno-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // OtpremanjeSlike živi koliko editor slajda: promena izbora ili taba ne prekida otpremanje (F6)
  providers: [PlatnoEditorStore, FokusPlatna, OtpremanjeSlike],
  imports: [
    MatTabsModule, PlatnoPrikazComponent, PlatnoOverlayComponent, PanelSlojeviComponent, PanelSvojstvaComponent,
    TrakaAlataComponent,
  ],
  host: { 'data-oznaka': OZNAKA_EDITORA_PLATNA, class: 'uz-ep' },
  template: `
    <app-traka-alata />
    <div class="uz-ep-telo">
      <div class="uz-ep-glavno">
        <!-- okvir (fokus prsten, ivica) prati režim editora; samo platno je uvek dnevno (rezim-dan uz-dan) -->
        <div #okvir class="uz-ep-platno uz-okvir" tabindex="0" role="group" aria-label="Platno slajda"
             aria-describedby="uz-ep-precice" (keydown)="tastatura($event)">
          <div class="uz-platno rezim-dan uz-dan">
            <app-platno-prikaz [platno]="store.zaPrikaz()" />
            <app-platno-overlay />
          </div>
        </div>
        <p id="uz-ep-precice" class="cdk-visually-hidden">
          Strelice pomeraju izabrano (Shift: 10), Delete briše, Ctrl+Z poništava, Ctrl+Y ponavlja, Ctrl+D duplira,
          Ctrl+] i Ctrl+[ menjaju redosled, Esc poništava izbor.
        </p>
        <p class="cdk-visually-hidden" aria-live="polite">{{ najava() }}</p>
      </div>
      <mat-tab-group class="uz-ep-paneli" mat-stretch-tabs="false" [selectedIndex]="indeksTaba()"
                     (selectedIndexChange)="promenaTaba($event)">
        <mat-tab label="Svojstva"><app-panel-svojstva [tema]="tema()" /></mat-tab>
        <mat-tab label="Slojevi"><app-panel-slojevi /></mat-tab>
      </mat-tab-group>
    </div>
  `,
  styles: `
    :host { display: block; container: uz-ep / inline-size; margin-bottom: 16px; }
    .uz-ep-telo { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px 16px; align-items: start; }
    @container uz-ep (min-width: 1100px) {
      .uz-ep-telo { grid-template-columns: minmax(0, 1fr) 300px; }
    }
    .uz-ep-glavno { min-width: 0; }
    .uz-ep-platno {
      position: relative;
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 6px;
      overflow: hidden;
      outline: none;
    }
    .uz-ep-platno:focus { outline: 2px solid var(--focus); outline-offset: 2px; }
    .uz-ep-paneli { min-width: 0; }
  `,
})
export class PlatnoEditorComponent implements OnInit, OnDestroy {
  /** Čita se jednom (`ngOnInit`), kao u `SlajdFormaComponent`; id se čita u trenutku izmene (nacrt dobija pravi id). */
  readonly slajd = input.required<SlajdDetails>();
  /** Tema prezentacije: novi slojevi uzimaju njene fontove i boje (F7, F12, F14, F16). */
  readonly tema = input.required<Tema>();

  protected readonly store = inject(PlatnoEditorStore);
  private readonly editorStore = inject(EditorStore);
  private readonly fokusPlatna = inject(FokusPlatna);
  private readonly okvir = viewChild.required<ElementRef<HTMLElement>>('okvir');
  /** Odjava SAMO ove registracije pražnjenja (nova instanca se može registrovati pre nego što ova nestane). */
  private odjava: (() => void) | null = null;

  protected readonly indeksTaba = computed(() => Math.max(0, TABOVI.indexOf(this.store.tab())));
  protected readonly najava = computed(() => {
    const izabrani = this.store.izabraniSlojevi();
    if (!izabrani.length) return 'Ništa nije izabrano';
    if (izabrani.length === 1) return `Izabrano: ${nazivSloja(this.store.platno(), izabrani[0])}`;
    return `Izabrano slojeva: ${izabrani.length}`;
  });

  constructor() {
    afterNextRender(() => this.fokusPlatna.postavi(this.okvir().nativeElement));
  }

  ngOnInit(): void {
    this.store.inicijalizuj(this.slajd().platno!);
    this.store.postaviIzlaz((p) => this.editorStore.izmeniPlatno(this.slajd().id, p));
    this.odjava = this.editorStore.registrujPraznjenje(() => this.store.isprazni(), () => this.store.imaOtvoreno());
  }

  ngOnDestroy(): void {
    // otvoreno prvo u dokument (dok je izlaz još tu), pa odjava samo svoje registracije
    this.store.isprazni();
    this.odjava?.();
    this.odjava = null;
    this.fokusPlatna.postavi(null);
  }

  protected promenaTaba(indeks: number): void {
    this.store.postaviTab(TABOVI[indeks] ?? 'SVOJSTVA');
  }

  /** Prečice SAMO na okviru platna (odluka 24). */
  protected tastatura(e: KeyboardEvent): void {
    if (jeSnimanje(e)) {
      this.store.isprazni(); // otvorena sesija teksta i gest u dokument; događaj ide dalje do stranice (sacuvajOdmah)
      return;
    }
    if (uPoljuZaUnos(e.target)) return;
    if (e.key === 'Escape' && this.store.gest()) return; // Esc usred gesta: samo F5 prekida gest (izbor ostaje)
    const k = komandaTastature(e);
    if (!k) return;
    e.preventDefault();
    switch (k.tip) {
      case 'OBRISI': this.store.obrisiIzabrane(); break;
      case 'KOPIRAJ': this.store.kopiraj(); break;
      case 'NALEPI': this.store.nalepi(); break;
      case 'DUPLIRAJ': this.store.duplirajIzabrane(); break;
      case 'PONISTI': this.store.ponisti(); break;
      case 'PONOVI': this.store.ponovi(); break;
      case 'PONISTI_IZBOR': this.store.ponistiIzbor(); break;
      case 'IZABERI_SVE': this.store.izaberiSve(); break;
      case 'Z': this.store.zOsaIzabranih(k.smer); break;
      case 'POMERI': this.store.pomeriIzabrane(k.dx, k.dy); break;
      case 'UREDI': break; // F12 (tekst), F14 (ćelija), F16 (formula); u 4a nema šta da se uređuje
    }
  }
}
