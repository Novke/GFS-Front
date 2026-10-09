import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, OnInit, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatButtonToggle, MatButtonToggleGroup } from '@angular/material/button-toggle';
import { MatError, MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { MatOption, MatSelect } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom, startWith } from 'rxjs';

import { PORUKA_SISTEM, toApiError } from '../../../core/api/api-error';
import { JE_ID } from '../../../core/route-matchers';
import { ReferenceStore } from '../../../core/state/reference.store';
import { FormErrorBanner } from '../../../shared/forms/form-error-banner';
import { porukaValidacije } from '../../../shared/forms/poruke-validacije';
import { NemaNesacuvanih } from '../../../shared/forms/unsaved-changes.guard';
import { ErrorPanel } from '../../../shared/ui/list-states';
import { PageHeader } from '../../../shared/ui/page-header';
import { PORUKA_PRAGA } from '../data-access/test.store';
import { TestoviApi } from '../../../core/api/testovi.api';
import { VARIJANTE } from '../../../core/api/testovi.models';

/** Vrednost izbora tipa za "Nov tip…" (pravi id je uvek pozitivan). */
export const NOV_TIP = -1;
/** Server: `@Max(100)` za max poena. */
export const MAX_POENA_TESTA = 100;
/** Naziv tipa: najmanje 2 znaka (`CreateTipTestaCmd`), najviše 60 (`UpdateTipTestaCmd`). */
const MAX_NAZIV_TIPA = 60;
const ISO_DATUM = /^\d{4}-\d{2}-\d{2}$/;

/** Opcije segmentiranog izbora varijanti: 1 -> `A`, 2 -> `A–B`, … 4 -> `A–D`. */
export const OPCIJE_VARIJANTI = [1, 2, 3, 4].map(n => ({ broj: n, labela: n === 1 ? 'A' : `A–${VARIJANTE[n - 1]}` }));

function idIzParametra(v: string | undefined): number | null {
  return v !== undefined && JE_ID.test(v) ? Number(v) : null;
}

export function danasIso(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type ImeKontrole = 'predmet' | 'grupa' | 'tip' | 'novTip' | 'datum' | 'maxPoena' | 'pragProlaza';
const LABELE: Record<ImeKontrole, string> = {
  predmet: 'Predmet',
  grupa: 'Grupa',
  tip: 'Tip testa',
  novTip: 'Naziv tipa',
  datum: 'Datum',
  maxPoena: 'Max poena',
  pragProlaza: 'Prag prolaza',
};

/**
 * Nov test (`/testovi/novo?predmet&grupa`): predmet, grupa, tip (postojeći aktivni tip predmeta ili "Nov tip…" sa
 * nazivom), datum, varijante A-D (segmentirano), max poena (1-100) i opcioni prag prolaza (poeni, 0-max; prazno = bez
 * prolaznosti). Nov tip se pravi prvo (`POST test/tip`), pa test sa njegovim id-jem; ako test posle toga ne uspe,
 * ponovni pokušaj koristi već napravljen tip (nema duplikata). Posle uspeha -> `/testovi/:id` (unos poena). Greška
 * servera ide u traku iznad forme, a greška praga ispod polja praga.
 */
@Component({
  selector: 'app-novi-test',
  imports: [
    ErrorPanel,
    FormErrorBanner,
    MatButton,
    MatButtonToggle,
    MatButtonToggleGroup,
    MatError,
    MatFormField,
    MatHint,
    MatInput,
    MatLabel,
    MatOption,
    MatProgressSpinner,
    MatSelect,
    PageHeader,
    ReactiveFormsModule,
    RouterLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header naslov="Nov test" podnaslov="Posle čuvanja dodaješ ispitanike i unosiš poene u tabelu." />

    @if (reference.imaGresku() && !referencePodaci()) {
      <app-error-panel [poruka]="reference.greska()" (ponovo)="reference.ucitaj()" />
    }

    <form class="forma" [formGroup]="forma" (ngSubmit)="posalji()" novalidate>
      <app-form-error-banner [poruka]="greska()" />

      <div class="dva">
        <mat-form-field appearance="outline">
          <mat-label>Predmet</mat-label>
          <mat-select formControlName="predmet" data-predmet>
            @for (p of reference.predmeti(); track p.id) {
              <mat-option [value]="p.id">{{ p.naziv }}</mat-option>
            }
          </mat-select>
          @if (poruka('predmet'); as m) {
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
          @if (poruka('grupa'); as m) {
            <mat-error>{{ m }}</mat-error>
          }
        </mat-form-field>
      </div>

      <div class="dva">
        <mat-form-field appearance="outline">
          <mat-label>Tip testa</mat-label>
          <mat-select formControlName="tip" data-tip>
            @for (t of tipovi(); track t.id) {
              <mat-option [value]="t.id">{{ t.naziv }}</mat-option>
            }
            <mat-option [value]="novTipVrednost" data-nov-tip>Nov tip…</mat-option>
          </mat-select>
          @if (predmetId() === null) {
            <mat-hint>Prvo izaberi predmet.</mat-hint>
          }
          @if (poruka('tip'); as m) {
            <mat-error>{{ m }}</mat-error>
          }
        </mat-form-field>

        @if (novTip()) {
          <mat-form-field appearance="outline">
            <mat-label>Naziv novog tipa</mat-label>
            <input matInput formControlName="novTip" [maxlength]="maxNaziv" autocomplete="off" data-naziv-tipa />
            <mat-hint>npr. Kolokvijum 2, Popravni</mat-hint>
            @if (poruka('novTip'); as m) {
              <mat-error>{{ m }}</mat-error>
            }
          </mat-form-field>
        }
      </div>

      <div class="dva">
        <mat-form-field appearance="outline">
          <mat-label>Datum</mat-label>
          <input matInput type="date" formControlName="datum" data-datum />
          @if (poruka('datum'); as m) {
            <mat-error>{{ m }}</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Max poena</mat-label>
          <input matInput type="number" inputmode="numeric" min="1" [max]="maxPoena" formControlName="maxPoena" data-max />
          @if (poruka('maxPoena'); as m) {
            <mat-error>{{ m }}</mat-error>
          }
        </mat-form-field>
      </div>

      <div class="dva">
        <mat-form-field appearance="outline">
          <mat-label>Prag prolaza (poeni)</mat-label>
          <input matInput type="number" inputmode="numeric" min="0" formControlName="pragProlaza" data-prag />
          <mat-hint>Bez praga test nema prolaznost.</mat-hint>
          @if (poruka('pragProlaza'); as m) {
            <mat-error>{{ m }}</mat-error>
          }
        </mat-form-field>
      </div>

      <fieldset class="varijante">
        <legend id="varijante-labela">Varijante testa</legend>
        <mat-button-toggle-group formControlName="brojGrupa" aria-labelledby="varijante-labela" [hideSingleSelectionIndicator]="true" data-varijante>
          @for (o of opcijeVarijanti; track o.broj) {
            <mat-button-toggle [value]="o.broj" [attr.data-broj]="o.broj">{{ o.labela }}</mat-button-toggle>
          }
        </mat-button-toggle-group>
        <p class="pomoc">Svaki ispitanik dobija jednu varijantu; statistika se vidi i po varijantama.</p>
      </fieldset>

      <div class="dugmad">
        <a matButton routerLink="/testovi">Odustani</a>
        <button matButton="filled" type="submit" data-sacuvaj [disabled]="salje()">
          @if (salje()) {
            <mat-progress-spinner mode="indeterminate" diameter="18" aria-label="Čuvanje" />
          }
          Napravi test
        </button>
      </div>
    </form>
  `,
  styles: `
    :host { display: block; }
    .forma { display: flex; flex-direction: column; gap: 4px; max-width: 640px; padding: 20px 16px 8px; border: 1px solid var(--line);
      border-radius: var(--radius); background: var(--surface); box-shadow: var(--shadow); }
    .dva { display: grid; grid-template-columns: 1fr 1fr; gap: 0 12px; }
    mat-form-field { width: 100%; }
    .varijante { margin: 0 0 16px; padding: 0; border: 0; }
    legend { margin-bottom: 6px; font-size: 13px; font-weight: 600; color: var(--ink-2); }
    .varijante mat-button-toggle-group { --mat-button-toggle-height: 40px; }
    .pomoc { margin: 6px 0 0; font-size: 12.5px; color: var(--muted); }
    .dugmad { display: flex; justify-content: flex-end; gap: 8px; padding-bottom: 12px; }
    .dugmad mat-progress-spinner { display: inline-block; margin-right: 8px; }
    @media (max-width: 599.98px) {
      .forma { max-width: none; }
      .dva { grid-template-columns: 1fr; }
      .dugmad .mat-mdc-button-base { min-height: 44px; }
      .varijante mat-button-toggle-group { --mat-button-toggle-height: 44px; }
    }
  `,
})
export class NoviTest implements OnInit, NemaNesacuvanih {
  protected readonly reference = inject(ReferenceStore);
  private readonly api = inject(TestoviApi);
  private readonly router = inject(Router);

  /** Predizbor iz linka (`?predmet=&grupa=`); neispravna ili nepostojeća vrednost se ignoriše. */
  readonly predmet = input<string>();
  readonly grupa = input<string>();

  protected readonly novTipVrednost = NOV_TIP;
  protected readonly maxNaziv = MAX_NAZIV_TIPA;
  protected readonly maxPoena = MAX_POENA_TESTA;
  protected readonly opcijeVarijanti = OPCIJE_VARIJANTI;

  protected readonly forma = new FormGroup({
    predmet: new FormControl<number | null>(null, Validators.required),
    grupa: new FormControl<number | null>(null, Validators.required),
    tip: new FormControl<number | null>({ value: null, disabled: true }, Validators.required),
    novTip: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2), Validators.maxLength(MAX_NAZIV_TIPA)],
    }),
    datum: new FormControl(danasIso(), { nonNullable: true, validators: [Validators.required, Validators.pattern(ISO_DATUM)] }),
    brojGrupa: new FormControl(1, { nonNullable: true }),
    maxPoena: new FormControl<number | null>(null, [
      Validators.required,
      Validators.min(1),
      Validators.max(MAX_POENA_TESTA),
      Validators.pattern(/^\d+$/),
    ]),
    /** Opciono: prazno = bez praga (test nema prolaznost); ceo broj 0-max poena. */
    pragProlaza: new FormControl<number | null>(null, [Validators.min(0), Validators.pattern(/^\d+$/)]),
  });

  protected readonly salje = signal(false);
  protected readonly greska = signal<string | null>(null);
  private poslato = false;
  /** Tip napravljen u ovom pokušaju (ako test posle toga ne uspe, sledeći pokušaj ga koristi). */
  private napravljenTip: { predmetId: number; naziv: string; id: number } | null = null;

  protected readonly predmetId = toSignal(this.forma.controls.predmet.valueChanges.pipe(startWith(this.forma.controls.predmet.value)), {
    initialValue: null,
  });
  private readonly tipVrednost = toSignal(this.forma.controls.tip.valueChanges.pipe(startWith(this.forma.controls.tip.value)), {
    initialValue: null,
  });
  protected readonly novTip = computed(() => this.tipVrednost() === NOV_TIP);
  protected readonly tipovi = computed(() => {
    const p = this.predmetId();
    return p === null ? [] : this.reference.tipoviTesta(p)();
  });
  protected readonly referencePodaci = computed(() => this.reference.predmeti().length > 0 || this.reference.grupe().length > 0);

  constructor() {
    this.forma.controls.novTip.disable();
    effect(() => {
      const predmeti = this.reference.predmeti();
      const grupe = this.reference.grupe();
      const p = idIzParametra(this.predmet());
      const g = idIzParametra(this.grupa());
      untracked(() => {
        this.predizbor(this.forma.controls.predmet, p, predmeti.map(x => x.id));
        this.predizbor(this.forma.controls.grupa, g, grupe.map(x => x.id));
      });
    });
    // tip zavisi od predmeta: nov predmet briše izabran tip
    this.forma.controls.predmet.valueChanges.subscribe(p => {
      const tip = this.forma.controls.tip;
      if (tip.value !== NOV_TIP) {
        tip.setValue(null);
      }
      if (p === null) {
        tip.disable();
      } else {
        tip.enable();
      }
    });
    // prag se proverava prema max poena: nov max briše staru grešku praga (`iznadMax`, `server`) i proverava ponovo
    this.forma.controls.maxPoena.valueChanges.subscribe(() => this.forma.controls.pragProlaza.updateValueAndValidity());
    this.forma.controls.tip.valueChanges.subscribe(t => {
      if (t === NOV_TIP) {
        this.forma.controls.novTip.enable();
      } else {
        this.forma.controls.novTip.disable();
      }
    });
  }

  ngOnInit(): void {
    this.reference.ucitaj();
  }

  imaNesacuvanihIzmena(): boolean {
    return this.forma.dirty && !this.poslato;
  }

  private predizbor(kontrola: FormControl<number | null>, id: number | null, postojeci: number[]): void {
    if (id !== null && kontrola.value === null && !kontrola.dirty && postojeci.includes(id)) {
      kontrola.setValue(id);
    }
  }

  protected poruka(ime: ImeKontrole): string | null {
    const k = this.forma.controls[ime];
    if (!(k.touched || k.dirty)) {
      return null;
    }
    if ((ime === 'maxPoena' || ime === 'pragProlaza') && k.errors?.['pattern'] && !k.errors?.['min']) {
      return 'Unesi ceo broj.';
    }
    if (ime === 'pragProlaza' && (k.errors?.['min'] || k.errors?.['iznadMax'])) {
      return PORUKA_PRAGA;
    }
    if (k.errors?.['server']) {
      return k.errors['server'] as string;
    }
    return porukaValidacije(k.errors, LABELE[ime]);
  }

  /** Id tipa: postojeći, ili nov napravljen sada (isti naziv za isti predmet se ne pravi dvaput). */
  private async idTipa(predmetId: number, tip: number, naziv: string): Promise<number> {
    if (tip !== NOV_TIP) {
      return tip;
    }
    const n = naziv.trim();
    const t = this.napravljenTip;
    if (t && t.predmetId === predmetId && t.naziv.toLocaleLowerCase('sr') === n.toLocaleLowerCase('sr')) {
      return t.id;
    }
    const nov = await firstValueFrom(this.api.noviTip({ naziv: n, predmetId }, { tiho: true }));
    this.napravljenTip = { predmetId, naziv: n, id: nov.id };
    this.reference.invalidiraj('tipovi', predmetId);
    return nov.id;
  }

  protected async posalji(): Promise<void> {
    if (this.salje()) {
      return;
    }
    const v = this.forma.getRawValue();
    const prag = v.pragProlaza === null || String(v.pragProlaza) === '' ? null : Number(v.pragProlaza);
    if (prag !== null && v.maxPoena !== null && prag > Number(v.maxPoena)) {
      this.forma.controls.pragProlaza.setErrors({ iznadMax: true });
    }
    if (this.forma.invalid || v.predmet === null || v.grupa === null || v.tip === null || v.maxPoena === null) {
      this.forma.markAllAsTouched();
      return;
    }
    this.salje.set(true);
    this.greska.set(null);
    try {
      const tipTestaId = await this.idTipa(v.predmet, v.tip, v.novTip);
      const test = await firstValueFrom(
        this.api.create(
          {
            tipTestaId,
            predmetId: v.predmet,
            grupaId: v.grupa,
            datum: v.datum,
            brojGrupa: v.brojGrupa,
            maxPoena: Number(v.maxPoena),
            pragProlaza: prag,
          },
          { tiho: true },
        ),
      );
      this.poslato = true;
      await this.router.navigate(['/testovi', test.id]);
    } catch (e: unknown) {
      const razlog = e instanceof HttpErrorResponse ? toApiError(e).reason : PORUKA_SISTEM;
      if (razlog === PORUKA_PRAGA) {
        // greška praga pripada polju praga, ne traci iznad forme
        this.forma.controls.pragProlaza.setErrors({ server: razlog });
        this.forma.controls.pragProlaza.markAsTouched();
      } else {
        this.greska.set(razlog);
      }
    } finally {
      this.salje.set(false);
    }
  }
}
