import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, input, untracked } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { filter } from 'rxjs';

import { BreadcrumbService } from '../../../core/layout/breadcrumbs';
import { JE_ID } from '../../../core/route-matchers';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
import { ErrorPanel, SkeletonRows } from '../../../shared/ui/list-states';
import { PageHeader } from '../../../shared/ui/page-header';
import { StatTile } from '../../../shared/ui/stat-tile';
import { StatusChip, TonStatusa } from '../../../shared/ui/status-chip';
import { DatumPipe } from '../../../shared/util/datum.pipe';
import { NAZIV_STATUSA_PRIJAVE, PrijavaInfo, StatusPrijave, statusSesije } from '../../../core/api/onboarding.api';
import { FILTERI_PRIJAVA, FilterPrijava, OnboardingSesijaStore, parseFilterPrijava } from '../data-access/onboarding-sesija.store';
import { OdbijDialog } from '../ui/odbij-dialog';

/** Automatsko osvežavanje liste (studenti se prijavljuju dok je QR na projektoru); pauzirano dok se prijava menja. */
export const AUTO_OSVEZAVANJE_MS = 15_000;

const TON_PRIJAVE: Record<StatusPrijave, TonStatusa> = { NA_CEKANJU: 'warn', PRIHVACENA: 'ok', ODBIJENA: 'danger' };

/**
 * Prijave jedne sesije (`/grupe/:id/onboarding/:sid`): brojači, filter po statusu (`?status=NA_CEKANJU`; nepoznata
 * vrednost je "Sve"), "Prihvati", "Odbij" (dijalog sa napomenom), "Izmeni" (inline: Enter čuva, Esc otkazuje),
 * "Prihvati sve na čekanju" uz potvrdu i zbirna poruka servera. Tekstovi su kao u starom UI-ju (staging smoke).
 * Sesija druge grupe (ručno izmenjen link) se jednom preusmerava na svoju grupu.
 */
@Component({
  selector: 'app-prijave',
  imports: [DatumPipe, ErrorPanel, MatButton, MatIcon, PageHeader, ReactiveFormsModule, RouterLink, SkeletonRows, StatTile, StatusChip],
  providers: [OnboardingSesijaStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.sesija(); as s) {
      <app-page-header [naslov]="'Prijave: ' + s.grupa.naziv">
        <div kontekst class="kontekst">
          <app-status-chip [tekst]="statusSesijeTekst()" [ton]="s.otvorena ? 'uToku' : 'neutral'" />
          <span class="oznaka">Važi do {{ s.istice | datum: 'sa-vremenom' }}</span>
          <span class="oznaka">Najviše {{ s.maxPrijava }} prijava</span>
        </div>
        <div akcije class="akcije">
          <a matButton="outlined" [routerLink]="['/grupe', s.grupa.id, 'onboarding', s.id, 'qr']" data-qr>
            <mat-icon svgIcon="qr_code_2" aria-hidden="true" />QR
          </a>
          <button matButton="outlined" type="button" [disabled]="store.zauzet() || store.ucitava()" (click)="store.osvezi()" data-osvezi>
            <mat-icon svgIcon="refresh" aria-hidden="true" />Osveži
          </button>
        </div>
      </app-page-header>

      <div class="brojaci" data-brojaci>
        <app-stat-tile labela="Ukupno" [vrednost]="store.brojevi().ukupno" />
        <app-stat-tile labela="Na čekanju" [vrednost]="store.brojevi().naCekanju" />
        <app-stat-tile labela="Prihvaćene" [vrednost]="store.brojevi().prihvacene" />
        <app-stat-tile labela="Odbijene" [vrednost]="store.brojevi().odbijene" />
      </div>

      <div class="traka">
        <button matButton="filled" type="button" data-prihvati-sve
          [disabled]="store.zauzet() || store.izmenaId() !== null || store.brojevi().naCekanju === 0" (click)="prihvatiSve()">
          Prihvati sve na čekanju ({{ store.brojevi().naCekanju }})
        </button>
        <div class="filteri" role="group" aria-label="Filter po statusu">
          @for (f of filteri; track f.vrednost) {
            <button type="button" class="chip" [class.aktivan]="filter() === f.vrednost" [attr.aria-pressed]="filter() === f.vrednost"
              [attr.data-filter]="f.vrednost" (click)="postaviFilter(f.vrednost)">{{ f.naziv }}</button>
          }
        </div>
      </div>
      <p class="napomena-osvezavanja">Lista se osvežava automatski na svakih 15 s (pauzirano dok menjate prijavu).</p>

      @if (store.poruka(); as poruka) {
        <div class="poruka" role="status" data-poruka>
          <mat-icon svgIcon="info" aria-hidden="true" />
          <span>{{ poruka }}</span>
          <button type="button" class="zatvori" aria-label="Zatvori poruku" (click)="store.zatvoriPoruku()"><mat-icon svgIcon="close" /></button>
        </div>
      }

      <section class="lista-kartica" aria-label="Prijave">
        <div class="tabela-okvir">
          <table class="lista-tabela prijave-tabela">
            <caption class="sr-only">Prijave studenata</caption>
            <thead>
              <tr>
                <th scope="col">Status</th>
                <th scope="col">Ime</th>
                <th scope="col">Prezime</th>
                <th scope="col">Indeks</th>
                <th scope="col">Godina</th>
                <th scope="col">Email</th>
                <th scope="col">Telefon</th>
                <th scope="col">Datum rođenja</th>
                <th scope="col">Opština</th>
                <th scope="col">Podneto</th>
                <th scope="col">Napomena</th>
                <th scope="col" class="akcije-reda"><span class="sr-only">Akcije</span></th>
              </tr>
            </thead>
            <tbody>
              @for (p of prikazane(); track p.id) {
                @if (store.izmenaId() !== p.id) {
                  <tr [attr.data-prijava]="p.id">
                    <td data-labela="Status"><app-status-chip [tekst]="nazivStatusa[p.status]" [ton]="tonPrijave[p.status]" /></td>
                    <td data-labela="Ime">{{ p.ime }}</td>
                    <td data-labela="Prezime">{{ p.prezime }}</td>
                    <td class="mono" data-labela="Indeks">{{ p.indeks }}</td>
                    <td class="mono" data-labela="Godina">{{ p.godina }}</td>
                    <td class="siroko" data-labela="Email">{{ p.email || '—' }}</td>
                    <td class="brojevi-sitno" data-labela="Telefon">{{ p.brojTelefona || '—' }}</td>
                    <td class="mono brojevi-sitno" data-labela="Datum rođenja">{{ p.datumRodjenja | datum }}</td>
                    <td data-labela="Opština">{{ p.opstina || '—' }}</td>
                    <td class="mono brojevi-sitno" data-labela="Podneto">{{ p.podneto | datum: 'sa-vremenom' }}</td>
                    <td class="napomena" data-labela="Napomena">{{ p.napomena || '—' }}</td>
                    <td class="akcije-reda">
                      @if (p.status === 'NA_CEKANJU') {
                        <button matButton="filled" type="button" [disabled]="store.zauzet()" (click)="store.prihvati(p)" data-prihvati>Prihvati</button>
                        <button matButton="outlined" type="button" class="odbij" [disabled]="store.zauzet()" (click)="odbij(p)" data-odbij>Odbij</button>
                        <button matButton type="button" [disabled]="store.zauzet() || store.izmenaId() !== null" (click)="zapocniIzmenu(p)" data-izmeni>Izmeni</button>
                      }
                      @if (p.status === 'PRIHVACENA' && p.studentId !== null) {
                        <a matButton [routerLink]="['/studenti', p.studentId]" data-student>Student</a>
                      }
                    </td>
                  </tr>
                } @else {
                  <tr class="u-izmeni" [formGroup]="nacrt" (keydown.enter)="taster($event, p, true)" (keydown.escape)="taster($event, p, false)">
                    <td data-labela="Status"><app-status-chip [tekst]="nazivStatusa[p.status]" [ton]="tonPrijave[p.status]" /></td>
                    <td data-labela="Ime"><input formControlName="ime" maxlength="60" aria-label="Ime" [class.neispravno]="nacrt.controls.ime.invalid" /></td>
                    <td data-labela="Prezime"><input formControlName="prezime" maxlength="60" aria-label="Prezime" [class.neispravno]="nacrt.controls.prezime.invalid" /></td>
                    <td data-labela="Indeks"><input formControlName="indeks" maxlength="20" aria-label="Indeks" [class.neispravno]="nacrt.controls.indeks.invalid" /></td>
                    <td data-labela="Godina"><input type="number" min="2000" step="1" formControlName="godina" aria-label="Godina" [class.neispravno]="nacrt.controls.godina.invalid" /></td>
                    <td data-labela="Email"><input type="email" formControlName="email" maxlength="120" aria-label="Email" [class.neispravno]="nacrt.controls.email.invalid" /></td>
                    <td data-labela="Telefon"><input type="tel" formControlName="brojTelefona" maxlength="20" aria-label="Telefon" [class.neispravno]="nacrt.controls.brojTelefona.invalid" /></td>
                    <td data-labela="Datum rođenja"><input type="date" formControlName="datumRodjenja" aria-label="Datum rođenja" /></td>
                    <td data-labela="Opština"><input formControlName="opstina" maxlength="100" aria-label="Opština" /></td>
                    <td class="mono brojevi-sitno" data-labela="Podneto">{{ p.podneto | datum: 'sa-vremenom' }}</td>
                    <td class="napomena" data-labela="Napomena">{{ p.napomena || '—' }}</td>
                    <td class="akcije-reda">
                      <button matButton="filled" type="button" [disabled]="store.zauzet() || nacrt.invalid" (click)="sacuvaj(p)" data-sacuvaj>Sačuvaj</button>
                      <button matButton type="button" [disabled]="store.zauzet()" (click)="store.otkaziIzmenu()" data-otkazi>Otkaži</button>
                    </td>
                  </tr>
                }
              } @empty {
                <tr class="prazno">
                  <td colspan="12">{{ store.brojevi().ukupno === 0 ? 'Još nema prijava.' : 'Nema prijava za izabrani filter.' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    } @else if (store.imaGresku()) {
      <app-page-header naslov="Prijave" />
      <app-error-panel [naslov]="store.statusGreske() === 404 ? 'Sesija ne postoji.' : 'Prijave nisu mogle da se učitaju.'"
        [poruka]="store.greska()" (ponovo)="store.osvezi()" />
      @if (gId(); as g) {
        <a matButton [routerLink]="['/grupe', g, 'onboarding']"><mat-icon svgIcon="arrow_back" aria-hidden="true" />Nazad na grupu</a>
      }
    } @else {
      <app-page-header naslov="Prijave" />
      <app-skeleton-rows [redovi]="6" />
    }
  `,
  styles: `
    :host { display: block; }
    .kontekst { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
    .brojaci { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; }
    .traka { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
    .filteri { display: flex; flex-wrap: wrap; gap: 6px; margin-left: auto; }
    .filteri .chip { align-items: center; padding: 0 12px; cursor: pointer; font: inherit; }
    .napomena-osvezavanja { margin: 4px 0 12px; font-size: 13px; color: var(--muted); }
    .poruka { display: flex; align-items: center; gap: 10px; padding: 10px 12px; margin-bottom: 12px; border-radius: var(--radius);
      background: var(--primary-soft); color: var(--primary-soft-ink); }
    .poruka span { flex: 1; }
    .zatvori { display: grid; place-items: center; width: 36px; height: 36px; border: 0; border-radius: 50%; background: none; color: inherit; cursor: pointer; }
    .prijave-tabela tbody tr { cursor: default; }
    .prijave-tabela td { padding: 8px 12px; }
    .siroko { overflow-wrap: anywhere; min-width: 12ch; }
    .napomena { min-width: 12ch; color: var(--ink-2); }
    .akcije-reda { white-space: nowrap; text-align: right; position: sticky; right: 0; background: var(--surface); }
    .u-izmeni .akcije-reda, .prijave-tabela tbody tr:hover .akcije-reda { background: var(--surface-2); }
    .akcije-reda > * + * { margin-left: 6px; }
    .odbij { color: var(--danger); }
    .u-izmeni { background: var(--surface-2); }
    .u-izmeni input { width: 100%; min-width: 9ch; height: 36px; padding: 0 8px; border: 1px solid var(--line); border-radius: var(--radius-sm);
      background: var(--surface); color: var(--ink); font: inherit; }
    .u-izmeni input.neispravno { border-color: var(--danger); }
    .prazno td { color: var(--muted); }
    @media (max-width: 599.98px) {
      .prijave-tabela tr { grid-template-columns: 1fr 1fr; gap: 6px 12px; }
      td[data-labela]::before { content: attr(data-labela); display: block; font-size: 11.5px; color: var(--muted); }
      td:first-child, .siroko, .napomena, .akcije-reda, .prazno td { grid-column: 1 / -1; }
      .akcije-reda { display: flex; flex-wrap: wrap; gap: 8px; position: static; background: none; }
      .akcije-reda > * + * { margin-left: 0; }
      .u-izmeni input { min-width: 0; height: 44px; font-size: 16px; }
    }
  `,
})
export class Prijave {
  protected readonly store = inject(OnboardingSesijaStore);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly mrvice = inject(BreadcrumbService);

  /** Id grupe i sesije iz putanje (matcher propušta samo brojeve); `status` je query parametar filtera. */
  readonly id = input<string>();
  readonly sid = input<string>();
  readonly status = input<string>();

  protected readonly filteri = FILTERI_PRIJAVA;
  protected readonly nazivStatusa = NAZIV_STATUSA_PRIJAVE;
  protected readonly tonPrijave = TON_PRIJAVE;

  protected readonly gId = computed(() => (JE_ID.test(this.id() ?? '') ? Number(this.id()) : null));
  protected readonly sId = computed(() => (JE_ID.test(this.sid() ?? '') ? Number(this.sid()) : null));
  protected readonly filter = computed<FilterPrijava>(() => parseFilterPrijava(this.status()));
  protected readonly prikazane = computed(() => {
    const f = this.filter();
    const p = this.store.prijave();
    return f === 'SVE' ? p : p.filter(x => x.status === f);
  });
  protected readonly statusSesijeTekst = computed(() => {
    const s = this.store.sesija();
    return s ? statusSesije(s) : '';
  });

  protected readonly nacrt = new FormGroup({
    ime: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(60)] }),
    prezime: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(60)] }),
    indeks: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(20)] }),
    godina: new FormControl<number | null>(null, [Validators.required, Validators.min(2000), Validators.max(2100)]),
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(120)] }),
    brojTelefona: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(20)] }),
    datumRodjenja: new FormControl('', { nonNullable: true }),
    opstina: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(100)] }),
  });

  constructor() {
    effect(() => {
      const sid = this.sId();
      if (sid !== null) {
        untracked(() => this.store.ucitaj(sid));
      }
    });

    // Sesija druge grupe: jednom na pravu putanju (posle toga se id-jevi slažu, pa nema petlje).
    effect(() => {
      const s = this.store.sesija();
      const g = this.gId();
      if (s && g !== null && s.grupa?.id && s.grupa.id !== g && s.id === this.sId()) {
        untracked(() => void this.router.navigate(['/grupe', s.grupa.id, 'onboarding', s.id], { replaceUrl: true, queryParamsHandling: 'preserve' }));
      }
    });

    effect(() => {
      const naziv = this.store.sesija()?.grupa?.naziv;
      if (naziv) {
        untracked(() => this.mrvice.postavi(`Prijave · ${naziv}`));
      }
    });

    const tajmer = setInterval(() => {
      if (this.store.izmenaId() === null && document.visibilityState !== 'hidden') {
        this.store.osvezi(true);
      }
    }, AUTO_OSVEZAVANJE_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(tajmer));
  }

  protected postaviFilter(f: FilterPrijava): void {
    void this.router.navigate([], {
      queryParams: { status: f === 'SVE' ? null : f },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected odbij(p: PrijavaInfo): void {
    OdbijDialog.otvori(this.dialog, { student: `${p.ime} ${p.prezime} (${p.indeks})` })
      .pipe(filter(r => r !== null))
      .subscribe(r => this.store.odbij(p, r.napomena));
  }

  protected prihvatiSve(): void {
    const n = this.store.brojevi().naCekanju;
    if (n === 0 || this.store.zauzet()) {
      return;
    }
    ConfirmDialog.otvori(this.dialog, {
      naslov: 'Prihvati sve na čekanju',
      tekst: `Prihvatiti sve prijave na čekanju (${n})? Svaka postaje student grupe.`,
      potvrdi: 'Prihvati sve',
    })
      .pipe(filter(Boolean))
      .subscribe(() => this.store.prihvatiSve());
  }

  protected zapocniIzmenu(p: PrijavaInfo): void {
    this.nacrt.reset({
      ime: p.ime ?? '',
      prezime: p.prezime ?? '',
      indeks: p.indeks ?? '',
      godina: p.godina ?? null,
      email: p.email ?? '',
      brojTelefona: p.brojTelefona ?? '',
      datumRodjenja: p.datumRodjenja ?? '',
      opstina: p.opstina ?? '',
    });
    this.store.zapocniIzmenu(p);
  }

  protected sacuvaj(p: PrijavaInfo): void {
    const v = this.nacrt.getRawValue();
    if (this.nacrt.invalid || !v.ime.trim() || !v.prezime.trim() || !v.indeks.trim() || !v.email.trim() || !v.brojTelefona.trim()) {
      this.nacrt.markAllAsTouched();
      return;
    }
    this.store.sacuvajIzmenu(p, {
      ime: v.ime.trim(),
      prezime: v.prezime.trim(),
      indeks: v.indeks.trim(),
      godina: v.godina,
      email: v.email.trim(),
      brojTelefona: v.brojTelefona.trim(),
      datumRodjenja: v.datumRodjenja || null,
      opstina: v.opstina.trim() || null,
    });
  }

  /** Enter u polju čuva, Esc otkazuje (samo u poljima, da Enter na dugmetu ne pokrene i čuvanje). */
  protected taster(e: Event, p: PrijavaInfo, sacuvaj: boolean): void {
    if ((e.target as HTMLElement | null)?.tagName !== 'INPUT') {
      return;
    }
    e.preventDefault();
    if (sacuvaj) {
      this.sacuvaj(p);
    } else {
      this.store.otkaziIzmenu();
    }
  }
}
