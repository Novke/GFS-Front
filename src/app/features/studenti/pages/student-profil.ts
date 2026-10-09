import { ChangeDetectionStrategy, Component, computed, effect, inject, input, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';

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
 * rute. Store je na ovoj komponenti, pa ga tabovi dele. Godina upisa, kontakt i id grupe dolaze u `GET studenti/{id}`;
 * ono što student nema prikazuje se kao `—`. Prethodni/sledeći otvaraju isti tab.
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
            <span class="oznaka mono" data-indeks><span class="sr-only">Indeks: </span>{{ store.indeks() }}</span>
            @if (p.grupaId; as gid) {
              <a class="oznaka ton-info" [routerLink]="['/grupe', gid]" data-grupa><span class="sr-only">Grupa: </span>{{ p.grupa }}</a>
            } @else {
              <span class="oznaka" data-grupa><span class="sr-only">Grupa: </span>{{ p.grupa || 'Bez grupe' }}</span>
            }
            <span class="oznaka" data-godina>Upis: {{ p.godina ?? '—' }}</span>
            @if (mail(); as href) {
              <a class="oznaka ton-info" [href]="href" data-mail><mat-icon svgIcon="mail" aria-hidden="true" /><span class="sr-only">Email: </span>{{ p.email }}</a>
            } @else {
              <span class="oznaka nema" data-bez-maila><mat-icon svgIcon="mail" aria-hidden="true" /><span class="sr-only">Email: nema </span><span aria-hidden="true">—</span></span>
            }
            @if (tel(); as href) {
              <a class="oznaka ton-info" [href]="href" data-tel><mat-icon svgIcon="call" aria-hidden="true" /><span class="sr-only">Telefon: </span>{{ p.brojTelefona }}</a>
            } @else {
              <span class="oznaka nema" data-bez-telefona><mat-icon svgIcon="call" aria-hidden="true" /><span class="sr-only">Telefon: nema </span><span aria-hidden="true">—</span></span>
            }
          </div>
        </div>
        <div class="desno">
          @if (store.susedi().mesto !== null) {
            <nav class="susedi" aria-label="Studenti grupe" data-susedi>
              @if (store.susedi().prethodni; as id) {
                <a matIconButton [routerLink]="['/studenti', id, tab()]" aria-label="Prethodni student" data-prethodni><mat-icon svgIcon="chevron_left" /></a>
              } @else {
                <button matIconButton type="button" disabled aria-label="Prethodni student" data-prethodni><mat-icon svgIcon="chevron_left" /></button>
              }
              <span class="mesto mono" aria-live="polite">{{ store.susedi().mesto }} / {{ store.susedi().ukupno }}</span>
              @if (store.susedi().sledeci; as id) {
                <a matIconButton [routerLink]="['/studenti', id, tab()]" aria-label="Sledeći student" data-sledeci><mat-icon svgIcon="chevron_right" /></a>
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
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /** Id iz putanje (`withComponentInputBinding`); matcher rute već propušta samo brojeve. */
  readonly id = input.required<string>();

  protected readonly tabovi = [
    { putanja: 'pregled', naslov: 'Pregled' },
    { putanja: 'hronologija', naslov: 'Hronologija' },
    { putanja: 'beleske', naslov: 'Beleške' },
  ] as const;

  protected readonly sId = computed(() => (JE_ID.test(this.id()) ? Number(this.id()) : null));
  protected readonly mail = computed(() => mailtoHref(this.store.podaci()?.email));
  protected readonly tel = computed(() => telHref(this.store.podaci()?.brojTelefona));
  /** Tab koji je sada otvoren; prethodni/sledeći student otvaraju isti tab. */
  protected readonly tab = toSignal(
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      map(() => this.trenutniTab()),
      startWith(this.trenutniTab()),
    ),
    { requireSync: true },
  );
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

  /** Segment child rute (`pregled`, `hronologija`, `beleske`); nepoznat ili odsutan je `pregled`. */
  private trenutniTab(): string {
    const segment = this.route.firstChild?.snapshot?.url[0]?.path;
    return this.tabovi.some(t => t.putanja === segment) ? (segment as string) : 'pregled';
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
    StudentIzmenaDialog.otvori(this.dialog, { id, nacin, grupaId: this.store.podaci()?.grupaId ?? null })
      .pipe(filter(Boolean))
      .subscribe(() => this.store.ucitaj(id));
  }
}
