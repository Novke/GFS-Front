import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, OnInit, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { MatSelect, MatOption } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import { catchError, map, of } from 'rxjs';

import { toApiError } from '../../../core/api/api-error';
import { JE_ID } from '../../../core/route-matchers';
import { ReferenceStore } from '../../../core/state/reference.store';
import { FormErrorBanner } from '../../../shared/forms/form-error-banner';
import { porukaValidacije } from '../../../shared/forms/poruke-validacije';
import { ErrorPanel } from '../../../shared/ui/list-states';
import { PageHeader } from '../../../shared/ui/page-header';
import { formatDatum } from '../../../shared/util/datum.pipe';
import { PredavanjaApi } from '../../../core/api/predavanja.api';

type ImeKontrole = 'predmet' | 'grupa';

/** Id iz query parametra (`?predmet=3`): samo ispravan pozitivan ceo broj, inače `null`. */
function idIzParametra(v: string | undefined): number | null {
  return v !== undefined && JE_ID.test(v) ? Number(v) : null;
}

/**
 * Započinjanje predavanja (`/predavanja/novo?predmet&grupa`): predmet i grupa su obavezni, datum je danas, a redni broj
 * se predlaže kao najveći postojeći + 1, isto što dodeljuje server ("Biće predavanje broj N"). "Započni" -> `POST predavanja/start` -> detalj.
 * Greška servera ide u traku iznad forme (`LOCAL_ERRORS`), ne u snackbar.
 *
 * `predmet` i `grupa` su ulazi iz query parametara (`withComponentInputBinding`): predizbor iz filtera liste.
 */
@Component({
  selector: 'app-novo-predavanje',
  imports: [
    ErrorPanel,
    FormErrorBanner,
    MatButton,
    MatError,
    MatFormField,
    MatLabel,
    MatOption,
    MatProgressSpinner,
    MatSelect,
    PageHeader,
    ReactiveFormsModule,
    RouterLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './novo-predavanje.html',
  styleUrl: './novo-predavanje.scss',
})
export class NovoPredavanje implements OnInit {
  protected readonly reference = inject(ReferenceStore);
  private readonly api = inject(PredavanjaApi);
  private readonly router = inject(Router);

  /** Predizbor iz linka (`?predmet=&grupa=`); neispravna ili nepostojeća vrednost se ignoriše. */
  readonly predmet = input<string>();
  readonly grupa = input<string>();

  protected readonly forma = new FormGroup({
    predmet: new FormControl<number | null>(null, Validators.required),
    grupa: new FormControl<number | null>(null, Validators.required),
  });

  protected readonly salje = signal(false);
  protected readonly greska = signal<string | null>(null);
  protected readonly danas = formatDatum(new Date());

  /**
   * Redni broj koji će server dodeliti: `max(rb) + 1` preko svih predavanja, učitano jednom pri otvaranju. Prazna baza
   * daje 1; greška je tiha (nema predloga, "Započni" radi i bez njega).
   */
  protected readonly sledeciRb = toSignal(
    this.api.poslednjiRb().pipe(
      map(s => (s?.content?.[0]?.rb ?? 0) + 1),
      catchError(() => of(null)),
    ),
    { initialValue: null },
  );

  protected readonly referencePodaci = computed(() => this.reference.predmeti().length > 0 || this.reference.grupe().length > 0);

  constructor() {
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
  }

  ngOnInit(): void {
    this.reference.ucitaj();
  }

  /** Postavlja vrednost iz linka samo dok korisnik nije ništa izabrao i dok ta stavka postoji. */
  private predizbor(kontrola: FormControl<number | null>, id: number | null, postojeci: number[]): void {
    if (id !== null && kontrola.value === null && !kontrola.dirty && postojeci.includes(id)) {
      kontrola.setValue(id);
    }
  }

  protected poruka(ime: ImeKontrole): string | null {
    const k = this.forma.controls[ime];
    return k.touched || k.dirty ? porukaValidacije(k.errors, ime === 'predmet' ? 'Predmet' : 'Grupa') : null;
  }

  protected posalji(): void {
    if (this.salje()) {
      return;
    }
    const { predmet, grupa } = this.forma.getRawValue();
    if (!this.forma.valid || predmet === null || grupa === null) {
      this.forma.markAllAsTouched();
      return;
    }
    this.salje.set(true);
    this.greska.set(null);
    this.api.start({ predmetId: predmet, grupaId: grupa }, { tiho: true }).subscribe({
      next: p => {
        void this.router.navigate(['/predavanja', p.id]).finally(() => this.salje.set(false));
      },
      error: (e: unknown) => {
        this.salje.set(false);
        this.greska.set(e instanceof HttpErrorResponse ? toApiError(e).reason : 'Sistemska greška. Pokušaj ponovo.');
      },
    });
  }
}
