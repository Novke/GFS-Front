import { BreakpointObserver } from '@angular/cdk/layout';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, DOCUMENT, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { map } from 'rxjs';

import { PredavanjaApi } from '../../../core/api/predavanja.api';
import { PredavanjeDetails } from '../../../core/api/predavanja.models';
import { JE_ID } from '../../../core/route-matchers';
import { NotificationStore } from '../../../core/state/notification.store';
import { ALATI } from '../../uzivo/crtanje/crtanje.models';
import { Crtac } from '../../uzivo/crtanje/crtac';
import { CrtanjeApi } from '../../uzivo/crtanje/crtanje.api';
import { kanalTable } from '../../uzivo/crtanje/kanal-crtanja';
import { PovrsinaCrtanjaComponent } from '../../uzivo/crtanje/povrsina-crtanja.component';
import { RasporedCrtanjaComponent } from '../../uzivo/crtanje/raspored-crtanja.component';
import { SlojCrtezaComponent } from '../../uzivo/crtanje/sloj-crteza.component';
import { preskociPrecicu, prebaciCeoEkran } from '../../uzivo/pages/precice';
import { kljucPrecice, tasterCrtanja } from '../../uzivo/tastatura';
import { izborEkrana } from '../../uzivo/ui/izbor-ekrana.dialog';
import { PORUKA_BLOKIRAN, PROZOR_TABLE, otvoriIliFokusiraj, otvoriPublikuNaMonitoru } from '../../uzivo/ui/monitor';
import { KLJUC_TABLE, naslovTable, publikaTable } from '../ui/tabla';

/**
 * Tabla sa predavanja (`/predavanja/:id/tabla`, spec crtanja 5.7): projektorski raspored bez ljuske, odmah bela strana i
 * crtanje, bez prezentacije i bez STOMP-a. Ista mašinerija kao konzola (`Crtac`: istorija, upis jedan po jedan, kanal
 * `gfs-tabla-<id>` ka publici), jedna strana po predavanju. Zaglavlje: „Tabla · <predmet>, predavanje <datum>”, publika u
 * prozoru, na monitoru, ceo ekran. Tasteri: `1`-`7` alat, `Ctrl+Z`/`Ctrl+Y`, `Esc` prekida potez, `F` ceo ekran, `P` publika.
 */
@Component({
  selector: 'app-tabla-predavanja',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, MatTooltipModule, RouterLink, PovrsinaCrtanjaComponent, RasporedCrtanjaComponent, SlojCrtezaComponent],
  host: { class: 'uz-kon tb', lang: 'sr-Latn', '[class.uz-kon--usko]': 'usko()', '(document:keydown)': 'tastatura($event)' },
  styles: `
    :host { display: flex; flex-direction: column; height: 100dvh; min-height: 0; }
    :host(.uz-kon--usko) { height: auto; min-height: 100dvh; }
    .crt-raspored { flex: 1; }
    .tb-scena { position: absolute; inset: 0; background: #fff; }
    .tb-znak { font-size: 12px; font-weight: 600; color: var(--danger); padding: 0 6px; }
    .tb-napomena { position: absolute; z-index: 6; left: 50%; bottom: 12px; transform: translateX(-50%); margin: 0; padding: 6px 12px;
      border-radius: 8px; background: var(--snack-bg); color: var(--snack-ink); font-size: 14px; pointer-events: none; }
  `,
  template: `
    <header class="uz-kon-zaglavlje">
      <a mat-icon-button [routerLink]="['/predavanja', id()]" aria-label="Nazad na predavanje" matTooltip="Nazad na predavanje">
        <mat-icon svgIcon="arrow_back" />
      </a>
      <div class="uz-kon-naslovi">
        <h1 class="uz-kon-naziv" data-naslov-table>{{ naslov() }}</h1>
        <p class="uz-kon-meta"><span>pokrenuto sa predavanja, bez prezentacije</span></p>
      </div>
      <div class="uz-kon-akcije">
        <button mat-stroked-button type="button" aria-keyshortcuts="P" (click)="otvoriPublikuProzor()">
          <mat-icon svgIcon="open_in_new" />Otvori publiku
        </button>
        @if (!usko()) {
          <button mat-stroked-button type="button" (click)="naMonitor()"><mat-icon svgIcon="tv" />Otvori na monitoru</button>
        }
        <button mat-stroked-button type="button" aria-keyshortcuts="F" (click)="ceoEkran()"><mat-icon svgIcon="fullscreen" />Ceo ekran</button>
      </div>
    </header>
    @if (crtac(); as c) {
      <app-raspored-crtanja [crtac]="c" [usko]="usko()">
        @if (c.nesacuvano()) { <span crt-traka class="tb-znak" role="status">Nije sačuvano</span> }
        @if (c.puno()) { <span crt-traka class="tb-znak" role="status">Tabla je puna</span> }
        <div crt-scena class="tb-scena rezim-dan uz-dan" data-tabla>
          <app-sloj-crteza [elementi]="c.elementi()" [uToku]="c.uToku()" />
          <app-povrsina-crtanja [aktivna]="c.spremno()" [alat]="c.alat()" [boja]="c.boja()" [debljina]="c.debljina()"
                                (uToku)="c.uTokuJe($event)" (gotov)="c.dodaj($event)" />
          @if (!c.spremno()) { <p class="tb-napomena" role="status">Učitavanje table…</p> }
        </div>
      </app-raspored-crtanja>
    } @else {
      <p class="tb-napomena" role="alert">Predavanje ne postoji.</p>
    }
  `,
})
export class TablaPredavanja {
  private readonly predavanja = inject(PredavanjaApi);
  private readonly crtanjeApi = inject(CrtanjeApi);
  private readonly dialog = inject(MatDialog);
  private readonly obavestenja = inject(NotificationStore);
  private readonly dokument = inject(DOCUMENT);

  readonly id = input.required<string>();
  private readonly pId = computed(() => (JE_ID.test(this.id()) ? Number(this.id()) : null));
  protected readonly crtac = signal<Crtac | null>(null);
  private readonly predavanje = signal<PredavanjeDetails | null>(null);
  protected readonly naslov = computed(() => naslovTable(this.predavanje()));
  protected readonly usko = toSignal(
    inject(BreakpointObserver).observe('(max-width: 599.98px)').pipe(map(r => r.matches)), { initialValue: false });
  private readonly povrsina = viewChild(PovrsinaCrtanjaComponent);

  constructor() {
    effect(() => {
      const id = this.pId();
      untracked(() => this.pripremi(id));
    });
    inject(DestroyRef).onDestroy(() => this.crtac()?.unisti());
  }

  private pripremi(id: number | null): void {
    this.crtac()?.unisti();
    this.crtac.set(null);
    this.predavanje.set(null);
    if (id === null) return;
    const api = this.crtanjeApi;
    const c = new Crtac({
      // bez table na serveru (204 ne bi trebalo bez `posle`, ali neka): prazna strana verzije 0
      ucitaj: () => api.tabla(id).pipe(map(r => r ?? { elementi: [], verzija: 0 })),
      upisi: (_, elementi) => api.upisiTablu(id, elementi),
    }, kanalTable(id));
    c.postavi(KLJUC_TABLE, 0);
    c.ukljuci(true);
    this.crtac.set(c);
    this.predavanja.get(id, { tiho: true }).subscribe({
      next: p => this.predavanje.set(p),
      error: () => undefined,   // zaglavlje ostaje „Tabla”; crtanje radi i bez njega
    });
  }

  protected tastatura(e: KeyboardEvent): void {
    if (preskociPrecicu(e, this.dialog.openDialogs.length > 0)) return;
    const c = this.crtac();
    const a = tasterCrtanja(e);
    if (a && 'lokalno' in a) {
      e.preventDefault();
      switch (a.lokalno) {
        case 'ALAT': {
          const alat = ALATI[a.vrednost ?? -1];
          if (alat) c?.izaberiAlat(alat.tip);
          break;
        }
        case 'PONISTI': c?.ponisti(); break;
        case 'VRATI': c?.vrati(); break;
        case 'ESC': this.povrsina()?.otkazi(); break;
      }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = kljucPrecice(e).toLowerCase();
    if (k === 'f') {
      e.preventDefault();
      prebaciCeoEkran();
    } else if (k === 'p') {
      e.preventDefault();
      this.otvoriPublikuProzor();
    }
  }

  private publikaLink(): string | null {
    const id = this.pId();
    return id === null ? null : new URL(publikaTable(id), this.dokument.baseURI).href;
  }

  protected otvoriPublikuProzor(): void {
    const link = this.publikaLink();
    if (link && !otvoriIliFokusiraj(link, PROZOR_TABLE, 'popup')) {
      this.obavestenja.greska(PORUKA_BLOKIRAN);
    }
  }

  protected async naMonitor(): Promise<void> {
    const link = this.publikaLink();
    if (!link) return;
    const izbor = izborEkrana(this.dialog);
    const w = await otvoriPublikuNaMonitoru(link, izbor.izbor, undefined, PROZOR_TABLE);
    if (!w && !izbor.otkazano()) {
      this.obavestenja.greska(PORUKA_BLOKIRAN);
    }
  }

  protected ceoEkran(): void {
    prebaciCeoEkran();
  }
}
