import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { RouterLink } from '@angular/router';

import { NazivIkone } from '../../../core/layout/icons';
import { NivoComponent } from '../../../shared/ui/nivo.component';
import { StatusChip, TonStatusa } from '../../../shared/ui/status-chip';
import { StatusVarijante, svgUrl, VarijantaInfo } from '../data-access/banka.models';

export interface PrikazStatusa {
  tekst: string;
  ton: TonStatusa;
  ikona: NazivIkone | null;
}

const STATUSI: Record<StatusVarijante, PrikazStatusa> = {
  NACRT: { tekst: 'Nacrt', ton: 'info', ikona: 'edit' },
  AKTIVNA: { tekst: 'Aktivna', ton: 'ok', ikona: 'check_circle' },
  ARHIVIRANA: { tekst: 'Arhivirana', ton: 'neutral', ikona: null },
};

/** Oznaka statusa varijante (tekst, ton i ikona za `app-status-chip`). */
export function prikazStatusa(s: StatusVarijante): PrikazStatusa {
  return STATUSI[s];
}

/** "1011 u dekadni" ili, bez naziva, "Zadatak 3" (redni broj u grupi). */
export function imeVarijante(v: Pick<VarijantaInfo, 'naziv' | 'rb'>): string {
  return v.naziv?.trim() || `Zadatak ${v.rb}`;
}

/**
 * Kartica varijante u mreži grupe: renderovan zadatak (SVG sa `api/public/mediji/{id}`, uvek na beloj podlozi) ili zamena
 * ("Greška u LaTeX-u", "Nije renderovano"), naziv kao link na editor (cela kartica je klikabilna), status i meni ⋮ sa
 * radnjama koje status dozvoljava: Uredi, Odobri (nacrt sa uspelim renderom), Arhiviraj (aktivna), Vrati u nacrt
 * (arhivirana), Dupliraj, Obriši. Uz status je nivo (★ do ★★★) koji se bira na mestu, u svakom statusu (nije deo cele-kartice
 * veze). Emituje nameru; potvrdu brisanja i poziv servera radi stranica.
 */
@Component({
  selector: 'app-varijanta-kartica',
  imports: [MatIcon, MatIconButton, MatMenu, MatMenuItem, MatMenuTrigger, NivoComponent, RouterLink, StatusChip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-varijanta]': 'varijanta().id' },
  styleUrl: './varijanta-kartica.component.css',
  template: `
    @let v = varijanta();
    <div class="bk-kartica-slika rezim-dan">
      @if (v.renderStatus === 'GRESKA') {
        <span class="bk-zamena bk-zamena-greska"><mat-icon svgIcon="error" aria-hidden="true" />Greška u LaTeX-u</span>
      } @else if (v.renderStatus === 'OK' && v.svgId) {
        <img [src]="slika()" [alt]="'Zadatak ' + (v.naziv?.trim() || v.rb)" loading="lazy" />
      } @else {
        <span class="bk-zamena"><mat-icon svgIcon="schedule" aria-hidden="true" />Nije renderovano</span>
      }
    </div>
    <div class="bk-kartica-dno">
      <a class="bk-kartica-veza" [routerLink]="['/banka/varijante', v.id]">
        <span class="bk-rb">{{ v.rb }}.</span> {{ ime() }}
      </a>
      <gfs-nivo class="bk-kartica-nivo" [nivo]="v.nivo" izbor [natpis]="false" (promena)="promeniNivo($event)" />
      <span class="bk-kartica-oznake">
        <app-status-chip [tekst]="status().tekst" [ton]="status().ton" [ikona]="status().ikona" />
        @if (v.izvor === 'CLAUDE') {
          <span class="oznaka" title="Varijantu je napravio Claude">Claude</span>
        }
      </span>
      <button matIconButton type="button" class="bk-kartica-meni" data-meni [matMenuTriggerFor]="meni"
        [attr.aria-label]="'Radnje za varijantu ' + ime()">
        <mat-icon svgIcon="more_vert" aria-hidden="true" />
      </button>
    </div>
    <mat-menu #meni="matMenu" xPosition="before">
      <a mat-menu-item [routerLink]="['/banka/varijante', v.id]"><mat-icon svgIcon="edit" aria-hidden="true" />Uredi</a>
      @if (v.status === 'NACRT' && v.renderStatus === 'OK') {
        <button mat-menu-item type="button" (click)="odobri.emit()"><mat-icon svgIcon="check_circle" aria-hidden="true" />Odobri</button>
      }
      @if (v.status === 'AKTIVNA') {
        <button mat-menu-item type="button" (click)="arhiviraj.emit()"><mat-icon svgIcon="visibility_off" aria-hidden="true" />Arhiviraj</button>
      }
      @if (v.status === 'ARHIVIRANA') {
        <button mat-menu-item type="button" (click)="vratiUNacrt.emit()"><mat-icon svgIcon="undo" aria-hidden="true" />Vrati u nacrt</button>
      }
      <button mat-menu-item type="button" disabledInteractive [disabled]="zauzeto()" (click)="!zauzeto() && dupliraj.emit()">
        <mat-icon svgIcon="content_copy" aria-hidden="true" />Dupliraj
      </button>
      <button mat-menu-item type="button" disabledInteractive [disabled]="zauzeto()" (click)="!zauzeto() && obrisi.emit()">
        <mat-icon svgIcon="delete" aria-hidden="true" />Obriši
      </button>
    </mat-menu>
  `,
})
export class VarijantaKarticaComponent {
  readonly varijanta = input.required<VarijantaInfo>();
  /** Kreiranje, dupliranje ili brisanje je u toku (`BankaStore.zauzeto`): Dupliraj i Obriši čekaju. */
  readonly zauzeto = input(false);

  readonly odobri = output<void>();
  readonly arhiviraj = output<void>();
  readonly vratiUNacrt = output<void>();
  readonly dupliraj = output<void>();
  readonly obrisi = output<void>();
  /** Izabran drugi nivo varijante (1-3); poziv servera i vraćanje na grešku radi `BankaStore.promeniNivo`. */
  readonly nivoPromena = output<number>();

  protected promeniNivo(nivo: number | null): void {
    if (nivo !== null) {
      this.nivoPromena.emit(nivo);
    }
  }

  protected readonly ime = computed(() => imeVarijante(this.varijanta()));
  protected readonly status = computed(() => prikazStatusa(this.varijanta().status));
  protected readonly slika = computed(() => {
    const id = this.varijanta().svgId;
    return id ? svgUrl(id) : null;
  });
}
