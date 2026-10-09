import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';

import { porukaValidacije } from '../../../shared/forms/poruke-validacije';
import { StatTile } from '../../../shared/ui/stat-tile';
import { StatusChip } from '../../../shared/ui/status-chip';
import { DatumPipe } from '../../../shared/util/datum.pipe';
import { DomaciPodaci, naslovDomaceg } from '../data-access/domaci.models';
import { BrojeviDomaceg, IzmenaZaglavljaDomaceg } from '../data-access/domaci.store';

/** Kolone: `domaci.naslov` je `varchar(255)`, `domaci.text` `varchar(3000)`. */
const MAX_NASLOV = 255;
const MAX_OPIS = 3000;
const ISO_DATUM = /^\d{4}-\d{2}-\d{2}$/;

function danasIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** `7,4` (prosek bodova sa jednom decimalom, zarez kao u srpskom); bez bodova `null`. */
export function formatProsek(p: number | null): string | null {
  return p === null ? null : (Math.round(p * 10) / 10).toFixed(1).replace('.', ',');
}

/**
 * Zaglavlje domaćeg: status (za pregled / pregledan), naslov, predmet / grupa / datum / predavanje (link) kao chipovi,
 * opis, KPI (evidentirano x od y, prosek, oslobođeno) i meni ⋮ (Izmeni, Obriši). Izmena (naslov, datum, opis) je forma na
 * mestu naslova; čuva je `sacuvaj` (vraća `true` kad je server prihvatio, tada se forma zatvara). Domaći bez predavanja,
 * grupe, naslova ili opisa prikazuje `—` odnosno ništa, bez izuzetaka.
 */
@Component({
  selector: 'app-domaci-zaglavlje',
  imports: [
    DatumPipe,
    MatButton,
    MatError,
    MatFormField,
    MatIcon,
    MatIconButton,
    MatInput,
    MatLabel,
    MatMenu,
    MatMenuItem,
    MatMenuTrigger,
    MatProgressSpinner,
    ReactiveFormsModule,
    RouterLink,
    StatTile,
    StatusChip,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './domaci-zaglavlje.html',
  styleUrl: './domaci-zaglavlje.scss',
})
export class DomaciZaglavlje {
  readonly domaci = input.required<DomaciPodaci>();
  readonly brojevi = input.required<BrojeviDomaceg>();
  readonly sacuvaj = input.required<(izmena: IzmenaZaglavljaDomaceg) => Promise<boolean>>();
  readonly obrisi = output<void>();

  protected readonly izmena = signal(false);
  protected readonly cuva = signal(false);
  protected readonly maxNaslov = MAX_NASLOV;
  protected readonly maxOpis = MAX_OPIS;

  protected readonly naslov = computed(() => naslovDomaceg(this.domaci()));
  protected readonly bezNaslova = computed(() => !this.domaci().naslov?.trim());
  protected readonly pregledan = computed(() => this.domaci().pregledan === true);
  protected readonly opis = computed(() => this.domaci().text?.trim() ?? '');
  protected readonly prosek = computed(() => formatProsek(this.brojevi().prosek));

  protected readonly forma = new FormGroup({
    naslov: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(MAX_NASLOV)] }),
    datum: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(ISO_DATUM)] }),
    opis: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(MAX_OPIS)] }),
  });

  protected pocniIzmenu(): void {
    const d = this.domaci();
    this.forma.reset({ naslov: d.naslov ?? '', datum: d.datum ?? danasIso(), opis: d.text ?? '' });
    this.izmena.set(true);
  }

  protected poruka(ime: 'naslov' | 'datum' | 'opis'): string | null {
    const k = this.forma.controls[ime];
    const labela = { naslov: 'Naslov', datum: 'Datum', opis: 'Opis' }[ime];
    return k.touched || k.dirty ? porukaValidacije(k.errors, labela) : null;
  }

  protected async posalji(): Promise<void> {
    if (this.cuva()) {
      return;
    }
    const { naslov, datum, opis } = this.forma.getRawValue();
    if (this.forma.invalid) {
      this.forma.markAllAsTouched();
      return;
    }
    this.cuva.set(true);
    try {
      if (await this.sacuvaj()({ naslov: naslov.trim(), text: opis.trim(), datum })) {
        this.izmena.set(false);
      }
    } finally {
      this.cuva.set(false);
    }
  }
}
