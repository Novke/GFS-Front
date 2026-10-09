import { ChangeDetectionStrategy, Component, computed, effect, inject, input, untracked } from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';

import { BreadcrumbService } from '../../../core/layout/breadcrumbs';
import { JE_ID } from '../../../core/route-matchers';
import { PreferencesStore } from '../../../core/state/preferences.store';
import { ErrorPanel, SkeletonRows } from '../../../shared/ui/list-states';
import { StudentStore } from '../data-access/student.store';
import { mailtoHref, telHref } from '../data-access/studenti.models';
import { StudentIzmenaDialog } from '../ui/student-izmena-dialog';

/**
 * Profil studenta (`/studenti/:id/{pregled,hronologija,beleske}`): zaglavlje (ime, indeks sa godinom upisa, grupa kao
 * link, `mailto:` i `tel:` linkovi, meni Izmeni / Premesti), prethodni i sledeći student grupe (S5) i tabovi kao child
 * rute. Store je na ovoj komponenti, pa ga tabovi dele. Podaci koje `GET studenti/{id}` nema (godina, kontakt, id grupe)
 * stižu odvojeno; dok ih nema (ili ih student nema) prikazuje se `—`.
 */
@Component({
  selector: 'app-student-profil',
  imports: [ErrorPanel, MatButton, MatIcon, MatIconButton, MatMenu, MatMenuItem, MatMenuTrigger, RouterLink, RouterLinkActive, RouterOutlet, SkeletonRows],
  providers: [StudentStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.podaci(); as p) {
      <header class="zaglavlje">
        <div class="naslov-blok">
          <h1>{{ store.ime() }}</h1>
          <div class="kontekst">
            <span class="oznaka mono" title="Indeks" data-indeks>{{ store.indeks() }}</span>
            @if (store.zaglavlje()?.grupa; as g) {
              <a class="oznaka ton-info" [routerLink]="['/grupe', g.id]" data-grupa title="Grupa">{{ g.naziv }}</a>
            } @else {
              <span class="oznaka" data-grupa title="Grupa">{{ p.grupa || 'Bez grupe' }}</span>
            }
            @if (store.zaglavljeUcitano()) {
              <span class="oznaka" title="Godina upisa" data-godina>Upis: {{ store.zaglavlje()?.godina ?? '—' }}</span>
              @if (mail(); as href) {
                <a class="oznaka ton-info" [href]="href" data-mail><mat-icon svgIcon="mail" aria-hidden="true" />{{ store.zaglavlje()?.email }}</a>
              } @else {
                <span class="oznaka nema" data-bez-maila><mat-icon svgIcon="mail" aria-hidden="true" />—</span>
              }
              @if (tel(); as href) {
                <a class="oznaka ton-info" [href]="href" data-tel><mat-icon svgIcon="call" aria-hidden="true" />{{ store.zaglavlje()?.brojTelefona }}</a>
              } @else {
                <span class="oznaka nema" data-bez-telefona><mat-icon svgIcon="call" aria-hidden="true" />—</span>
              }
            }
          </div>
        </div>
        <div class="desno">
          @if (store.susedi().mesto !== null) {
            <nav class="susedi" aria-label="Studenti grupe" data-susedi>
              @if (store.susedi().prethodni; as id) {
                <a matIconButton [routerLink]="['/studenti', id]" aria-label="Prethodni student" data-prethodni><mat-icon svgIcon="chevron_left" /></a>
              } @else {
                <button matIconButton type="button" disabled aria-label="Prethodni student" data-prethodni><mat-icon svgIcon="chevron_left" /></button>
              }
              <span class="mesto mono" aria-live="polite">{{ store.susedi().mesto }} / {{ store.susedi().ukupno }}</span>
              @if (store.susedi().sledeci; as id) {
                <a matIconButton [routerLink]="['/studenti', id]" aria-label="Sledeći student" data-sledeci><mat-icon svgIcon="chevron_right" /></a>
              } @else {
                <button matIconButton type="button" disabled aria-label="Sledeći student" data-sledeci><mat-icon svgIcon="chevron_right" /></button>
              }
            </nav>
          }
          <button matIconButton type="button" [matMenuTriggerFor]="meni" aria-label="Još akcija" data-meni><mat-icon svgIcon="more_vert" /></button>
          <mat-menu #meni="matMenu" xPosition="before">
            <button mat-menu-item type="button" data-izmeni (click)="izmeni('izmena')"><mat-icon svgIcon="edit" />Izmeni podatke</button>
            <button mat-menu-item type="button" data-premesti (click)="izmeni('premesti')"><mat-icon svgIcon="swap_horiz" />Premesti u drugu grupu</button>
          </mat-menu>
        </div>
      </header>

      <nav class="tabovi" aria-label="Odeljci studenta">
        @for (t of tabovi; track t.putanja) {
          <a [routerLink]="t.putanja" routerLinkActive="aktivan" ariaCurrentWhenActive="page" [attr.data-tab]="t.putanja">{{ t.naslov }}</a>
        }
      </nav>
      <router-outlet />
    } @else if (store.imaGresku()) {
      <app-error-panel naslov="Student nije učitan." [poruka]="store.greska()" (ponovo)="ponovo()" />
      <a matButton routerLink="/studenti"><mat-icon svgIcon="arrow_back" aria-hidden="true" />Svi studenti</a>
    } @else {
      <app-skeleton-rows [redovi]="6" />
    }
  `,
  styles: `
    :host { display: block; }
    .zaglavlje { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 12px 16px; margin-bottom: 8px; }
    .naslov-blok { flex: 1 1 320px; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
    h1 { font-size: 26px; overflow-wrap: anywhere; }
    .kontekst { display: flex; flex-wrap: wrap; gap: 6px; }
    .kontekst a.oznaka { text-decoration: none; white-space: normal; overflow-wrap: anywhere; }
    .kontekst a.oznaka:hover { text-decoration: underline; }
    .nema { color: var(--muted); }
    .desno { display: flex; align-items: center; gap: 4px; margin-left: auto; }
    .susedi { display: flex; align-items: center; }
    .mesto { min-width: 5ch; text-align: center; font-size: 13px; color: var(--muted); }
    .tabovi { display: flex; gap: 4px; margin-bottom: 16px; border-bottom: 1px solid var(--line); overflow-x: auto; }
    .tabovi a { display: inline-flex; align-items: center; min-height: 44px; padding: 0 14px; border-bottom: 2px solid transparent;
      color: var(--muted); font-weight: 600; text-decoration: none; white-space: nowrap; }
    .tabovi a:hover { color: var(--ink); }
    .tabovi a.aktivan { color: var(--ink); border-bottom-color: var(--primary); }
    @media (max-width: 599.98px) { h1 { font-size: 22px; } .desno { width: 100%; justify-content: space-between; } }
  `,
})
export class StudentProfil {
  protected readonly store = inject(StudentStore);
  private readonly dialog = inject(MatDialog);
  private readonly mrvice = inject(BreadcrumbService);
  private readonly preference = inject(PreferencesStore);

  /** Id iz putanje (`withComponentInputBinding`); matcher rute već propušta samo brojeve. */
  readonly id = input.required<string>();

  protected readonly tabovi = [
    { putanja: 'pregled', naslov: 'Pregled' },
    { putanja: 'hronologija', naslov: 'Hronologija' },
    { putanja: 'beleske', naslov: 'Beleške' },
  ] as const;

  protected readonly sId = computed(() => (JE_ID.test(this.id()) ? Number(this.id()) : null));
  protected readonly mail = computed(() => mailtoHref(this.store.zaglavlje()?.email));
  protected readonly tel = computed(() => telHref(this.store.zaglavlje()?.brojTelefona));
  /** Id i ime učitanog studenta; poređenje po vrednostima, pa osvežavanje istog studenta ne pokreće ponovo efekat. */
  private readonly oznaka = computed(
    () => {
      const id = this.store.podaci()?.id;
      const ime = this.store.ime();
      return id !== undefined && ime ? { id, ime } : null;
    },
    { equal: (a, b) => a?.id === b?.id && a?.ime === b?.ime },
  );

  constructor() {
    effect(() => {
      const id = this.sId();
      if (id !== null) {
        untracked(() => this.store.ucitaj(id));
      }
    });

    // mrvice i "Nedavno" kad stigne student (ključ je string, pa se ne ponavlja na svaku izmenu stanja)
    effect(() => {
      const kljuc = this.oznaka();
      if (kljuc === null) {
        return;
      }
      untracked(() => {
        this.mrvice.postavi(kljuc.ime);
        this.preference.zabeleziNedavno({ tip: 'student', id: kljuc.id, naslov: kljuc.ime, url: `/studenti/${kljuc.id}` });
      });
    });
  }

  protected ponovo(): void {
    const id = this.sId();
    if (id !== null) {
      this.store.ucitaj(id);
    }
  }

  protected izmeni(nacin: 'izmena' | 'premesti'): void {
    const id = this.sId();
    if (id === null) {
      return;
    }
    StudentIzmenaDialog.otvori(this.dialog, { id, nacin, grupaId: this.store.zaglavlje()?.grupa?.id ?? null })
      .pipe(filter(Boolean))
      .subscribe(() => this.store.ucitaj(id));
  }
}
