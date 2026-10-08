import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, input, output, viewChild } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';

import { StudentListItem } from '../../../core/api/studenti.api';
import { IndeksPipe } from '../../../shared/util/indeks.pipe';
import { StanjeStudenta } from '../data-access/predavanje.store';

/** Dugo držanje (dodir) otvara meni pločice. */
export const DUGO_DRZANJE_MS = 550;

const OPIS: Record<StanjeStudenta, string> = {
  odsutan: 'odsutan',
  prisutan: 'prisutan',
  zadatak: 'prisutan, uradio zadatak',
  zvezdica: 'prisutan, zadatak sa zvezdicom',
};

/**
 * Pločica studenta na live predavanju (spec 4): klik kruži stanja (`klik`), meni (⋮, desni klik, dugo držanje) nudi
 * napomenu i "Ukloni prisustvo". Stanje se vidi i bez boje: isprekidan okvir = odsutan, ispuna = prisutan, ikone
 * `task_alt` (zadatak) i `star` (zvezdica), tekst za čitač ekrana. `samoCitanje` (završeno predavanje): bez klika i menija.
 */
@Component({
  selector: 'app-studentska-plocica',
  imports: [IndeksPipe, MatIcon, NgTemplateOutlet, MatIconButton, MatMenu, MatMenuItem, MatMenuTrigger],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': "'plocica s-' + stanje()",
    '[class.ceka]': 'cekanje()',
    '[class.citanje]': 'samoCitanje()',
    '[attr.data-student]': 'student().id',
    '[attr.data-stanje]': 'stanje()',
  },
  template: `
    @if (samoCitanje()) {
      <div class="glavno">
        <ng-container [ngTemplateOutlet]="sadrzaj" />
      </div>
    } @else {
      <button type="button" class="glavno" [attr.aria-busy]="cekanje()" (click)="naKlik()" (contextmenu)="naDesniKlik($event)"
        (pointerdown)="pocniDrzanje($event)" (pointerup)="prekiniDrzanje()" (pointercancel)="prekiniDrzanje()"
        (pointerleave)="prekiniDrzanje()">
        <ng-container [ngTemplateOutlet]="sadrzaj" />
      </button>
      <button matIconButton type="button" class="meni" [matMenuTriggerFor]="meni" [attr.aria-label]="'Opcije: ' + imePrezime()">
        <mat-icon svgIcon="more_vert" />
      </button>
      <mat-menu #meni="matMenu">
        <button mat-menu-item type="button" data-napomena [disabled]="stanje() === 'odsutan'" (click)="napomena.emit()">
          <mat-icon svgIcon="sticky_note_2" />Napomena
        </button>
        <button mat-menu-item type="button" data-ukloni [disabled]="stanje() === 'odsutan'" (click)="ukloni.emit()">
          <mat-icon svgIcon="close" />Ukloni prisustvo
        </button>
      </mat-menu>
    }
    <ng-template #sadrzaj>
      <span class="ime">{{ imePrezime() }}</span>
      <span class="red">
        <span class="indeks">{{ student().indeks | indeks: student().godina }}</span>
        @if (stariji()) {
          <span class="stariji">stariji</span>
        }
      </span>
      <span class="sr-only">: {{ opis() }}{{ stariji() ? ', stariji student' : '' }}</span>
    </ng-template>
    <span class="znaci" aria-hidden="true">
      @if (napomenaTekst()) {
        <mat-icon class="znak-napomena" svgIcon="sticky_note_2" [attr.title]="napomenaTekst()" />
      }
      @if (stanje() === 'zadatak') {
        <mat-icon class="znak" svgIcon="task_alt" />
      } @else if (stanje() === 'zvezdica') {
        <span class="zvezda"><mat-icon svgIcon="star" /></span>
      }
    </span>
  `,
  styleUrl: './studentska-plocica.scss',
})
export class StudentskaPlocica {
  readonly student = input.required<StudentListItem>();
  readonly stanje = input<StanjeStudenta>('odsutan');
  readonly stariji = input(false);
  readonly cekanje = input(false);
  readonly samoCitanje = input(false);
  readonly napomenaTekst = input<string | null | undefined>(null);

  readonly klik = output<void>();
  readonly napomena = output<void>();
  readonly ukloni = output<void>();

  private readonly okidac = viewChild(MatMenuTrigger);
  private tajmer: ReturnType<typeof setTimeout> | null = null;
  /** Posle dugog držanja stiže i `click`; on se ignoriše. */
  private potisniKlik = false;

  protected readonly imePrezime = computed(() => [this.student().ime, this.student().prezime].filter(Boolean).join(' ') || '—');
  protected readonly opis = computed(() => OPIS[this.stanje()]);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.prekiniDrzanje());
  }

  protected naKlik(): void {
    if (this.potisniKlik) {
      this.potisniKlik = false;
      return;
    }
    this.klik.emit();
  }

  protected naDesniKlik(e: MouseEvent): void {
    e.preventDefault();
    this.prekiniDrzanje();
    this.otvoriMeni();
  }

  protected pocniDrzanje(e: PointerEvent): void {
    this.potisniKlik = false;
    if (e.pointerType !== 'touch') {
      return;
    }
    this.prekiniDrzanje();
    this.tajmer = setTimeout(() => {
      this.tajmer = null;
      this.potisniKlik = true;
      this.otvoriMeni();
    }, DUGO_DRZANJE_MS);
  }

  protected prekiniDrzanje(): void {
    if (this.tajmer !== null) {
      clearTimeout(this.tajmer);
      this.tajmer = null;
    }
  }

  private otvoriMeni(): void {
    const t = this.okidac();
    if (t && !t.menuOpen) {
      t.openMenu();
    }
  }
}
