import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, input, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl, FormArray, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators,
} from '@angular/forms';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatError, MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { MatOption, MatSelect } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';

import { PORUKA_SISTEM, toApiError } from '../../../core/api/api-error';
import { JE_ID } from '../../../core/route-matchers';
import { NotificationStore } from '../../../core/state/notification.store';
import { ReferenceStore } from '../../../core/state/reference.store';
import { FormErrorBanner } from '../../../shared/forms/form-error-banner';
import { porukaValidacije } from '../../../shared/forms/poruke-validacije';
import { NemaNesacuvanih } from '../../../shared/forms/unsaved-changes.guard';
import { ErrorPanel, SkeletonRows } from '../../../shared/ui/list-states';
import { PageHeader } from '../../../shared/ui/page-header';
import { DANI, danIDatum } from '../../../shared/util/termin';
import { RasporedApi } from '../data-access/raspored.api';
import { MAX_DANA, MAX_NAZIV, MAX_STAVKI, PODRAZUMEVANI_PRAG, RasporedDetails } from '../data-access/raspored.models';
import {
  cmdIzForme, danaUPeriodu, formaIzRasporeda, izgubljenaOtkazivanja, kopijaRasporeda, StavkaForme, VrednostiForme,
} from '../data-access/raspored.pravila';

const ISO_DATUM = /^\d{4}-\d{2}-\d{2}$/;
const VREME = /^\d{2}:\d{2}$/;

type StavkaGrupa = FormGroup<{
  id: FormControl<number | null>;
  predmet: FormControl<number | null>;
  grupa: FormControl<number | null>;
  dan: FormControl<number | null>;
  pocetak: FormControl<string>;
  kraj: FormControl<string>;
}>;

/** Početak pre kraja (oba `HH:mm`, pa se porede kao tekst). */
const pocetakPreKraja: ValidatorFn = (g: AbstractControl): ValidationErrors | null => {
  const { pocetak, kraj } = g.value as { pocetak: string; kraj: string };
  return VREME.test(pocetak ?? '') && VREME.test(kraj ?? '') && pocetak >= kraj ? { vreme: true } : null;
};

/** Period: od pre do, najviše 400 dana. */
const ispravanPeriod: ValidatorFn = (g: AbstractControl): ValidationErrors | null => {
  const { vaziOd, vaziDo } = g.value as { vaziOd: string; vaziDo: string };
  if (!ISO_DATUM.test(vaziOd ?? '') || !ISO_DATUM.test(vaziDo ?? '')) {
    return null;
  }
  if (vaziOd > vaziDo) {
    return { redosled: true };
  }
  return danaUPeriodu(vaziOd, vaziDo) > MAX_DANA ? { predug: true } : null;
};

/**
 * Nov raspored, izmena i „Kopiraj u novi“ (`/raspored/novi`, `/raspored/:id`, `/raspored/novi?kopija=<id>`; spec najave
 * odsustva, odeljak 3): naziv, period važenja, prag najava („Obavesti me kad više od N studenata najavi odsustvo“) i
 * termini (dan, početak, kraj, predmet, grupa). Kopija nosi termine i prag, a period se bira iznova. Server proverava sve
 * ponovo; njegova poruka ide u traku iznad forme. Promena predmeta ili grupe postojećeg termina briše njegove najave.
 */
@Component({
  selector: 'app-raspored-forma-page',
  imports: [
    ErrorPanel, FormErrorBanner, MatButton, MatError, MatFormField, MatHint, MatIcon, MatIconButton, MatInput, MatLabel,
    MatOption, MatProgressSpinner, MatSelect, PageHeader, ReactiveFormsModule, RouterLink, SkeletonRows,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [naslov]="naslov()" podnaslov="Čas se ponavlja svake nedelje u periodu važenja. Periodi mogu da se preklapaju." />

    @if (ucitavanje()) {
      <app-skeleton-rows redovi="4" />
    } @else if (greskaUcitavanja(); as g) {
      <app-error-panel [poruka]="g" (ponovo)="ucitaj()" />
    } @else {
      @if (reference.imaGresku() && reference.predmeti().length === 0) {
        <app-error-panel [poruka]="reference.greska()" (ponovo)="reference.ucitaj()" />
      }
      <form class="forma" [formGroup]="forma" (ngSubmit)="sacuvaj()" novalidate>
        <app-form-error-banner [poruka]="greska()" />

        <section class="kartica" aria-labelledby="rf-period">
          <h2 id="rf-period">Period</h2>
          <div class="red">
            <mat-form-field appearance="outline" class="siroko">
              <mat-label>Naziv</mat-label>
              <input matInput formControlName="naziv" [maxlength]="maxNaziv" autocomplete="off" data-naziv />
              @if (poruka(forma.controls.naziv, 'Naziv'); as m) {
                <mat-error>{{ m }}</mat-error>
              }
            </mat-form-field>
          </div>
          <div class="red">
            <mat-form-field appearance="outline">
              <mat-label>Važi od</mat-label>
              <input matInput type="date" formControlName="vaziOd" data-vazi-od />
              @if (poruka(forma.controls.vaziOd, 'Datum'); as m) {
                <mat-error>{{ m }}</mat-error>
              }
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Važi do</mat-label>
              <input matInput type="date" formControlName="vaziDo" data-vazi-do />
              @if (poruka(forma.controls.vaziDo, 'Datum'); as m) {
                <mat-error>{{ m }}</mat-error>
              }
            </mat-form-field>
          </div>
          @if (greskaPerioda(); as m) {
            <p class="greska-polja" role="alert" data-greska-perioda>{{ m }}</p>
          }
          <mat-form-field appearance="outline" class="prag">
            <mat-label>Obavesti me kad više od N studenata najavi odsustvo</mat-label>
            <input matInput type="number" min="1" max="100" step="1" formControlName="pragNajava" data-prag />
            <mat-hint>Za jedan čas stiže jedno obaveštenje (zvono i mejl), jednom.</mat-hint>
            @if (poruka(forma.controls.pragNajava, 'Prag'); as m) {
              <mat-error>{{ m }}</mat-error>
            }
          </mat-form-field>
        </section>

        <section class="kartica" aria-labelledby="rf-termini">
          <h2 id="rf-termini">Termini</h2>
          @if (izmena()) {
            <p class="napomena">Promena predmeta ili grupe postojećeg termina briše najave odsustva za taj termin.</p>
          }
          <div role="status" class="izgubljena-okvir">
            @if (izgubljena().length > 0) {
              <div class="izgubljena" data-izgubljena-otkazivanja>
                <p><strong>Čuvanje ukida {{ izgubljena().length === 1 ? 'jedan otkazan čas' : 'otkazane časove (' + izgubljena().length + ')' }}:</strong></p>
                <ul>
                  @for (o of izgubljena(); track o.stavkaId + ':' + o.datum) {
                    <li>{{ o.predmet }} · {{ o.grupa }} · {{ danIDatum(o.datum) }}</li>
                  }
                </ul>
                <p>Termin uklonjen, sa drugim predmetom, grupom ili danom, ili van novog perioda gubi otkazivanje. Ako taj čas i
                  dalje ne treba da se održi, otkaži ga ponovo na „Naredni termini“.</p>
              </div>
            }
          </div>
          @if (stavke.length === 0) {
            <p class="prazno">Još nema termina. Dodaj čas za svaki dan u nedelji kada se održava.</p>
          }
          <ol class="stavke" formArrayName="stavke">
            @for (s of stavke.controls; track s; let i = $index) {
              <li [formGroupName]="i" data-stavka>
                <mat-form-field appearance="outline">
                  <mat-label>Dan</mat-label>
                  <mat-select formControlName="dan" data-dan>
                    @for (d of dani; track d.vrednost) {
                      <mat-option [value]="d.vrednost">{{ d.naziv }}</mat-option>
                    }
                  </mat-select>
                  @if (poruka(s.controls.dan, 'Dan'); as m) {
                    <mat-error>{{ m }}</mat-error>
                  }
                </mat-form-field>
                <mat-form-field appearance="outline" class="vreme">
                  <mat-label>Početak</mat-label>
                  <input matInput type="time" formControlName="pocetak" data-pocetak />
                  @if (poruka(s.controls.pocetak, 'Vreme'); as m) {
                    <mat-error>{{ m }}</mat-error>
                  }
                </mat-form-field>
                <mat-form-field appearance="outline" class="vreme">
                  <mat-label>Kraj</mat-label>
                  <input matInput type="time" formControlName="kraj" data-kraj />
                  @if (poruka(s.controls.kraj, 'Vreme'); as m) {
                    <mat-error>{{ m }}</mat-error>
                  }
                </mat-form-field>
                <mat-form-field appearance="outline">
                  <mat-label>Predmet</mat-label>
                  <mat-select formControlName="predmet" data-predmet>
                    @for (p of reference.predmeti(); track p.id) {
                      <mat-option [value]="p.id">{{ p.naziv }}</mat-option>
                    }
                  </mat-select>
                  @if (poruka(s.controls.predmet, 'Predmet'); as m) {
                    <mat-error>{{ m }}</mat-error>
                  }
                </mat-form-field>
                <mat-form-field appearance="outline">
                  <mat-label>Grupa</mat-label>
                  <mat-select formControlName="grupa" data-grupa>
                    @for (g of reference.grupe(); track g.id) {
                      <mat-option [value]="g.id">{{ g.naziv }}</mat-option>
                    }
                  </mat-select>
                  @if (poruka(s.controls.grupa, 'Grupa'); as m) {
                    <mat-error>{{ m }}</mat-error>
                  }
                </mat-form-field>
                <button matIconButton type="button" class="ukloni" [attr.aria-label]="'Ukloni termin ' + (i + 1)"
                        (click)="ukloni(i)" data-ukloni>
                  <mat-icon svgIcon="delete" aria-hidden="true" />
                </button>
                @if ((s.touched || s.dirty) && s.hasError('vreme')) {
                  <p class="greska-polja red-cela" role="alert">Početak mora biti pre kraja.</p>
                }
              </li>
            }
          </ol>
          <button matButton="outlined" type="button" [disabled]="stavke.length >= maxStavki" (click)="dodaj()" data-dodaj>
            <mat-icon svgIcon="add" aria-hidden="true" />Dodaj termin
          </button>
        </section>

        <div class="dugmad">
          <a matButton routerLink="/raspored">Odustani</a>
          <button matButton="filled" type="submit" [disabled]="salje()" data-sacuvaj>
            @if (salje()) {
              <mat-progress-spinner mode="indeterminate" diameter="18" aria-hidden="true" />
            }
            Sačuvaj
          </button>
        </div>
      </form>
    }
  `,
  styles: `
    :host { display: block; }
    .forma { display: flex; flex-direction: column; gap: 16px; }
    .kartica { padding: 16px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface);
      box-shadow: var(--shadow); min-width: 0; }
    h2 { margin: 0 0 12px; font-size: 17px; }
    .red { display: flex; flex-wrap: wrap; gap: 0 12px; }
    .siroko { flex: 1 1 320px; }
    .prag { width: 100%; max-width: 520px; }
    .napomena, .prazno { margin: 0 0 12px; color: var(--ink-2); font-size: 14px; }
    .greska-polja { margin: -8px 0 12px; color: var(--danger); font-size: 13px; }
    .izgubljena { margin: 0 0 12px; padding: 10px 12px; border: 1px solid var(--warn); border-radius: var(--radius);
      background: var(--warn-soft); color: var(--ink); font-size: 14px; }
    .izgubljena p { margin: 0 0 6px; }
    .izgubljena p:last-child { margin: 6px 0 0; color: var(--ink-2); }
    .izgubljena ul { margin: 0; padding-left: 20px; }
    .stavke { margin: 0 0 12px; padding: 0; list-style: none; }
    .stavke li { display: grid; grid-template-columns: 150px 120px 120px minmax(160px, 1fr) minmax(140px, 1fr) auto;
      gap: 0 10px; align-items: start; padding-top: 8px; border-top: 1px solid var(--line); }
    .stavke li:first-child { border-top: 0; }
    .ukloni { margin-top: 8px; }
    .red-cela { grid-column: 1 / -1; }
    .dugmad { display: flex; justify-content: flex-end; gap: 8px; }
    .dugmad mat-progress-spinner { display: inline-block; margin-right: 8px; vertical-align: middle; }
    @media (max-width: 899.98px) {
      .stavke li { grid-template-columns: 1fr 1fr; }
      .ukloni { justify-self: end; }
    }
  `,
})
export class RasporedFormaPage implements OnInit, NemaNesacuvanih {
  protected readonly reference = inject(ReferenceStore);
  private readonly api = inject(RasporedApi);
  private readonly router = inject(Router);
  private readonly poruke = inject(NotificationStore);
  private readonly destroyRef = inject(DestroyRef);

  /** Id iz putanje (`/raspored/:id`, izmena) i `?kopija=<id>` (nov iz postojećeg). */
  readonly id = input<string>();
  readonly kopija = input<string>();

  protected readonly forma = new FormGroup(
    {
      naziv: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(MAX_NAZIV)] }),
      vaziOd: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(ISO_DATUM)] }),
      vaziDo: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(ISO_DATUM)] }),
      pragNajava: new FormControl<number | null>(PODRAZUMEVANI_PRAG, [Validators.required, Validators.min(1), Validators.max(100)]),
      stavke: new FormArray<StavkaGrupa>([]),
    },
    { validators: ispravanPeriod },
  );
  protected readonly stavke = this.forma.controls.stavke;
  protected readonly dani = DANI.slice(1).map((naziv, i) => ({ vrednost: i + 1, naziv }));
  protected readonly maxNaziv = MAX_NAZIV;
  protected readonly maxStavki = MAX_STAVKI;

  protected readonly ucitavanje = signal(false);
  protected readonly greskaUcitavanja = signal<string | null>(null);
  protected readonly salje = signal(false);
  protected readonly greska = signal<string | null>(null);
  protected readonly naslov = signal('Nov raspored');
  private napustanje = false;
  /** Izmena postojećeg (ne nov ni kopija). */
  protected readonly izmena = computed(() => this.izId(this.id()) !== null);
  /** Sačuvan raspored koji se menja (za upozorenje o otkazanim časovima); null za nov i kopiju. */
  private readonly original = signal<RasporedDetails | null>(null);
  private readonly vrednost = toSignal(this.forma.valueChanges, { initialValue: null });
  /** Otkazani časovi od danas koje bi čuvanje ukinulo (isto pravilo kao server). */
  protected readonly izgubljena = computed(() => {
    const r = this.original();
    this.vrednost();
    return r ? izgubljenaOtkazivanja(r, this.forma.getRawValue() as VrednostiForme) : [];
  });
  protected readonly danIDatum = danIDatum;

  ngOnInit(): void {
    this.reference.ucitaj();
    this.ucitaj();
  }

  /** Izmena ili kopija učitavaju postojeći raspored; nov počinje jednim praznim terminom. */
  protected ucitaj(): void {
    const id = this.izId(this.id());
    const kopija = this.izId(this.kopija());
    const izvor = id ?? kopija;
    this.naslov.set(id !== null ? 'Izmena rasporeda' : kopija !== null ? 'Nov raspored (kopija)' : 'Nov raspored');
    if (izvor === null) {
      if (this.stavke.length === 0) {
        this.postavi({ naziv: '', vaziOd: '', vaziDo: '', pragNajava: PODRAZUMEVANI_PRAG, stavke: [] });
        this.dodaj();
        this.forma.markAsPristine();
      }
      return;
    }
    this.ucitavanje.set(true);
    this.greskaUcitavanja.set(null);
    this.api.detalj(izvor, { tiho: true }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (r: RasporedDetails) => {
        this.original.set(id !== null ? r : null);
        this.postavi(id !== null ? formaIzRasporeda(r) : kopijaRasporeda(r));
        this.ucitavanje.set(false);
      },
      error: (e: unknown) => {
        this.greskaUcitavanja.set(e instanceof HttpErrorResponse ? toApiError(e).reason : PORUKA_SISTEM);
        this.ucitavanje.set(false);
      },
    });
  }

  imaNesacuvanihIzmena(): boolean {
    return !this.napustanje && this.forma.dirty;
  }

  protected dodaj(): void {
    // nov termin nasleđuje predmet, grupu i vreme poslednjeg (najčešće se razlikuje samo dan)
    const posl = this.stavke.at(this.stavke.length - 1)?.getRawValue();
    this.stavke.push(this.novaStavka({
      id: null, predmet: posl?.predmet ?? null, grupa: posl?.grupa ?? null, dan: null,
      pocetak: posl?.pocetak ?? '', kraj: posl?.kraj ?? '',
    }));
    this.forma.markAsDirty();
  }

  protected ukloni(i: number): void {
    this.stavke.removeAt(i);
    this.forma.markAsDirty();
  }

  protected poruka(k: AbstractControl, labela: string): string | null {
    return k.touched || k.dirty ? porukaValidacije(k.errors, labela) : null;
  }

  protected greskaPerioda(): string | null {
    const f = this.forma;
    if (!(f.controls.vaziOd.touched || f.controls.vaziDo.touched || f.controls.vaziOd.dirty || f.controls.vaziDo.dirty)) {
      return null;
    }
    if (f.hasError('redosled')) {
      return 'Raspored mora da počne pre nego što se završi.';
    }
    return f.hasError('predug') ? `Raspored može da traje najviše ${MAX_DANA} dana.` : null;
  }

  protected sacuvaj(): void {
    if (this.salje()) {
      return;
    }
    this.forma.markAllAsTouched();
    if (this.forma.invalid) {
      this.greska.set('Proveri označena polja.');
      return;
    }
    this.greska.set(null);
    this.salje.set(true);
    const cmd = cmdIzForme(this.forma.getRawValue() as VrednostiForme);
    const id = this.izId(this.id());
    const zahtev = id !== null ? this.api.izmeni(id, cmd, { tiho: true }) : this.api.kreiraj(cmd, { tiho: true });
    zahtev.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (r: RasporedDetails) => {
        this.salje.set(false);
        this.napustanje = true;
        const n = r.izgubljenaOtkazivanja ?? 0;
        this.poruke.uspeh(n > 0 ? `Raspored je sačuvan. Ukinuto otkazanih časova: ${n}.` : 'Raspored je sačuvan.');
        void this.router.navigateByUrl('/raspored');
      },
      error: (e: unknown) => {
        this.salje.set(false);
        this.greska.set(e instanceof HttpErrorResponse ? toApiError(e).reason : PORUKA_SISTEM);
      },
    });
  }

  private izId(v: string | null | undefined): number | null {
    return v && JE_ID.test(v) ? Number(v) : null;
  }

  private postavi(v: VrednostiForme): void {
    this.stavke.clear();
    for (const s of v.stavke) {
      this.stavke.push(this.novaStavka(s));
    }
    this.forma.patchValue({ naziv: v.naziv, vaziOd: v.vaziOd, vaziDo: v.vaziDo, pragNajava: v.pragNajava });
    this.forma.markAsPristine();
    this.forma.markAsUntouched();
  }

  private novaStavka(s: StavkaForme): StavkaGrupa {
    return new FormGroup(
      {
        id: new FormControl<number | null>(s.id),
        predmet: new FormControl<number | null>(s.predmet, Validators.required),
        grupa: new FormControl<number | null>(s.grupa, Validators.required),
        dan: new FormControl<number | null>(s.dan, Validators.required),
        pocetak: new FormControl(s.pocetak, { nonNullable: true, validators: [Validators.required, Validators.pattern(VREME)] }),
        kraj: new FormControl(s.kraj, { nonNullable: true, validators: [Validators.required, Validators.pattern(VREME)] }),
      },
      { validators: pocetakPreKraja },
    );
  }
}
