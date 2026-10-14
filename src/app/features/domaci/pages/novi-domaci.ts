import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, OnInit, signal, untracked } from '@angular/core';
import { rxResource, takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatError, MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { MatOption, MatSelect } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import { catchError, concatMap, map, of, startWith } from 'rxjs';

import { toApiError } from '../../../core/api/api-error';
import { JE_ID } from '../../../core/route-matchers';
import { NotificationStore } from '../../../core/state/notification.store';
import { ReferenceStore } from '../../../core/state/reference.store';
import { FormErrorBanner } from '../../../shared/forms/form-error-banner';
import { porukaValidacije } from '../../../shared/forms/poruke-validacije';
import { NemaNesacuvanih } from '../../../shared/forms/unsaved-changes.guard';
import { ErrorPanel } from '../../../shared/ui/list-states';
import { PageHeader } from '../../../shared/ui/page-header';
import { formatDatum } from '../../../shared/util/datum.pipe';
import { PredavanjaApi } from '../../../core/api/predavanja.api';
import { PredavanjeListItem } from '../../../core/api/predavanja.models';
import { DomaciApi } from '../../../core/api/domaci.api';

/** Kolone: `domaci.naslov` je `varchar(255)`, `domaci.text` `varchar(3000)`. */
const MAX_NASLOV = 255;
const MAX_OPIS = 3000;
const ISO_DATUM = /^\d{4}-\d{2}-\d{2}$/;
/** Najviše predavanja koje server vraća u jednoj strani; to je i najviše što se nudi za izbor. */
const MAX_PREDAVANJA = 100;

type ImeKontrole = 'predmet' | 'grupa' | 'naslov' | 'datum' | 'opis';

/** Id iz query parametra (`?predmet=3`): samo ispravan pozitivan ceo broj, inače `null`. */
function idIzParametra(v: string | undefined): number | null {
  return v !== undefined && JE_ID.test(v) ? Number(v) : null;
}

function danasIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Nov domaći (`/domaci/novo?predmet&grupa&predavanje`): predmet i grupa su obavezni, predavanje (iz liste za taj par),
 * naslov, datum (danas) i opis su opcioni. Server pri kreiranju prima samo predmet, grupu i predavanje i postavlja datum
 * na današnji (`POST domaci`), pa se naslov, opis i drugačiji datum šalju odmah posle toga (`PUT domaci/{id}`); ako taj
 * drugi korak ne uspe, domaći ipak postoji: otvara se njegov detalj uz poruku o grešci. Greška prvog koraka ide u traku
 * iznad forme (`LOCAL_ERRORS`), ne u snackbar.
 *
 * `predmet`, `grupa` i `predavanje` su ulazi iz query parametara (`withComponentInputBinding`): predizbor iz filtera liste.
 */
@Component({
  selector: 'app-novi-domaci',
  imports: [
    ErrorPanel,
    FormErrorBanner,
    MatButton,
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
  templateUrl: './novi-domaci.html',
  styleUrl: './novi-domaci.scss',
})
export class NoviDomaci implements OnInit, NemaNesacuvanih {
  protected readonly reference = inject(ReferenceStore);
  private readonly api = inject(DomaciApi);
  private readonly predavanjaApi = inject(PredavanjaApi);
  private readonly router = inject(Router);
  private readonly obavestenja = inject(NotificationStore);

  /** Predizbor iz linka (`?predmet=&grupa=&predavanje=`); neispravna ili nepostojeća vrednost se ignoriše. */
  readonly predmet = input<string>();
  readonly grupa = input<string>();
  readonly predavanje = input<string>();

  protected readonly forma = new FormGroup({
    predmet: new FormControl<number | null>(null, Validators.required),
    grupa: new FormControl<number | null>(null, Validators.required),
    predavanje: new FormControl<number | null>(null),
    naslov: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(MAX_NASLOV)] }),
    datum: new FormControl(danasIso(), { nonNullable: true, validators: [Validators.required, Validators.pattern(ISO_DATUM)] }),
    opis: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(MAX_OPIS)] }),
  });

  protected readonly salje = signal(false);
  protected readonly greska = signal<string | null>(null);
  protected readonly maxNaslov = MAX_NASLOV;
  protected readonly maxOpis = MAX_OPIS;
  /** Posle uspešnog kreiranja forma se napušta bez pitanja o nesačuvanim izmenama. */
  private napustanje = false;

  protected readonly referencePodaci = computed(() => this.reference.predmeti().length > 0 || this.reference.grupe().length > 0);

  private readonly vrednostiForme = toSignal(this.forma.valueChanges.pipe(startWith(null)), { initialValue: null });

  /**
   * Izabrani par predmet + grupa (`undefined` dok nisu oba izabrana); od njega zavisi lista predavanja. Poređenje po
   * vrednostima: izbor predavanja ili unos naslova ne sme da pokrene ponovno učitavanje liste.
   */
  private readonly par = computed(
    () => {
      this.vrednostiForme();
      const { predmet, grupa } = this.forma.getRawValue();
      return predmet !== null && grupa !== null ? { predmet, grupa } : undefined;
    },
    { equal: (a, b) => a?.predmet === b?.predmet && a?.grupa === b?.grupa },
  );

  /** Predavanja izabranog para, najnovija prva (do 100); greška je tiha: domaći se može zadati i bez veze sa predavanjem. */
  protected readonly predavanja = rxResource({
    params: () => this.par(),
    stream: ({ params }) =>
      this.predavanjaApi
        .pretraga(
          {
            filteri: { predmet: params.predmet, grupa: params.grupa, godina: null, status: null, q: null, od: null, do: null },
            sort: 'datum,desc',
            strana: 1,
            velicina: MAX_PREDAVANJA,
          },
          { tiho: true },
        )
        .pipe(
          map(s => ({ stavke: s?.content ?? [], greska: false })),
          catchError(() => of({ stavke: [] as PredavanjeListItem[], greska: true })),
        ),
  });

  protected readonly ponudaPredavanja = computed(() => this.predavanja.value()?.stavke ?? []);
  protected readonly predavanjaGreska = computed(() => this.predavanja.value()?.greska === true);

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

    // predavanje iz linka tek kad stigne lista za izabrani par
    effect(() => {
      const ponuda = this.ponudaPredavanja();
      const id = idIzParametra(this.predavanje());
      untracked(() => this.predizbor(this.forma.controls.predavanje, id, ponuda.map(x => x.id)));
    });

    // promena predmeta ili grupe poništava izbor predavanja (pripada drugom paru)
    for (const k of [this.forma.controls.predmet, this.forma.controls.grupa]) {
      k.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.forma.controls.predavanje.setValue(null, { emitEvent: false }));
    }
  }

  ngOnInit(): void {
    this.reference.ucitaj();
  }

  imaNesacuvanihIzmena(): boolean {
    return !this.napustanje && this.forma.dirty;
  }

  /** Postavlja vrednost iz linka samo dok korisnik nije ništa izabrao i dok ta stavka postoji. */
  private predizbor(kontrola: FormControl<number | null>, id: number | null, postojeci: number[]): void {
    if (id !== null && kontrola.value === null && !kontrola.dirty && postojeci.includes(id)) {
      kontrola.setValue(id);
    }
  }

  protected opisPredavanja(p: PredavanjeListItem): string {
    const tema = p.tema?.trim();
    return `Predavanje ${p.rb}${tema ? ' · ' + tema : ''} · ${formatDatum(p.datum)}`;
  }

  protected poruka(ime: ImeKontrole): string | null {
    const k = this.forma.controls[ime];
    const labela = { predmet: 'Predmet', grupa: 'Grupa', naslov: 'Naslov', datum: 'Datum', opis: 'Opis' }[ime];
    return k.touched || k.dirty ? porukaValidacije(k.errors, labela) : null;
  }

  protected posalji(): void {
    if (this.salje()) {
      return;
    }
    const { predmet, grupa, predavanje, naslov, datum, opis } = this.forma.getRawValue();
    if (!this.forma.valid || predmet === null || grupa === null) {
      this.forma.markAllAsTouched();
      return;
    }
    this.salje.set(true);
    this.greska.set(null);
    this.api
      .dodaj({ predmetId: predmet, grupaId: grupa, predavanjeId: predavanje }, { tiho: true })
      .pipe(
        concatMap(({ id }) => {
          const dopuna = naslov.trim() !== '' || opis.trim() !== '' || datum !== danasIso();
          if (!dopuna) {
            return of({ id, dopunaGreska: null as string | null });
          }
          return this.api.update(id, { naslov: naslov.trim(), text: opis.trim(), datum }, { tiho: true }).pipe(
            map(() => ({ id, dopunaGreska: null as string | null })),
            catchError((e: unknown) => of({ id, dopunaGreska: e instanceof HttpErrorResponse ? toApiError(e).reason : 'Sistemska greška.' })),
          );
        }),
      )
      .subscribe({
        next: ({ id, dopunaGreska }) => {
          this.napustanje = true;
          if (dopunaGreska) {
            this.obavestenja.greska(`Domaći je napravljen, ali naslov, opis i datum nisu sačuvani: ${dopunaGreska} Izmeni ih na stranici domaćeg.`);
          }
          void this.router.navigate(['/domaci', id]).finally(() => {
            this.salje.set(false);
            this.napustanje = false;
          });
        },
        error: (e: unknown) => {
          this.salje.set(false);
          this.greska.set(e instanceof HttpErrorResponse ? toApiError(e).reason : 'Sistemska greška. Pokušaj ponovo.');
        },
      });
  }
}
