import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { MatProgressSpinner } from '@angular/material/progress-spinner';

import { porukaValidacije } from '../../../shared/forms/poruke-validacije';
import { StatTile } from '../../../shared/ui/stat-tile';
import { StatusChip } from '../../../shared/ui/status-chip';
import { DatumPipe } from '../../../shared/util/datum.pipe';
import { BrojeviPredavanja, IzmenaZaglavlja } from '../data-access/predavanje.store';
import { PredavanjeDetails } from '../data-access/predavanja.models';

/** Kolona `predavanja.tema` je `varchar(255)`. */
const MAX_TEMA = 255;
const ISO_DATUM = /^\d{4}-\d{2}-\d{2}$/;

/** `14. 10.` -> ISO danas za podrazumevani datum kad ga predavanje nema. */
function danasIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Zaglavlje predavanja: status, "Predavanje N · Tema", predmet / grupa / datum kao chipovi, KPI (prisutno x od y,
 * zadaci, zvezdice) i meni ⋮ (Izmeni, Obriši). Izmena (tema, rb, datum) je forma na mestu naslova; čuva je
 * `sacuvaj` (vraća `true` kad je server prihvatio, tada se forma zatvara).
 */
@Component({
  selector: 'app-predavanje-zaglavlje',
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
    StatTile,
    StatusChip,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './predavanje-zaglavlje.html',
  styleUrl: './predavanje-zaglavlje.scss',
})
export class PredavanjeZaglavlje {
  readonly predavanje = input.required<PredavanjeDetails>();
  readonly brojevi = input.required<BrojeviPredavanja>();
  readonly sacuvaj = input.required<(izmena: IzmenaZaglavlja) => Promise<boolean>>();
  readonly obrisi = output<void>();

  protected readonly izmena = signal(false);
  protected readonly cuva = signal(false);
  protected readonly maxTema = MAX_TEMA;

  protected readonly naslov = computed(() => {
    const p = this.predavanje();
    const tema = p.tema?.trim();
    return `Predavanje ${p.rb}${tema ? ' · ' + tema : ''}`;
  });
  protected readonly zavrseno = computed(() => this.predavanje().zavrseno === true);
  protected readonly prisutnoPodtekst = computed(() => {
    const b = this.brojevi();
    const delovi = [];
    if (this.predavanje().grupa) {
      delovi.push(`od ${b.studenataGrupe}`);
    }
    if (b.prisutnoStarijih > 0) {
      delovi.push(`+${b.prisutnoStarijih} stariji`);
    }
    return delovi.join(' · ');
  });

  protected readonly forma = new FormGroup({
    tema: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(MAX_TEMA)] }),
    rb: new FormControl<number | null>(null, [Validators.required, Validators.min(1), Validators.max(999), Validators.pattern(/^\d+$/)]),
    datum: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(ISO_DATUM)] }),
  });

  protected pocniIzmenu(): void {
    const p = this.predavanje();
    this.forma.reset({ tema: p.tema ?? '', rb: p.rb, datum: p.datum ?? danasIso() });
    this.izmena.set(true);
  }

  protected poruka(ime: 'tema' | 'rb' | 'datum'): string | null {
    const k = this.forma.controls[ime];
    const labela = { tema: 'Tema', rb: 'Redni broj', datum: 'Datum' }[ime];
    return k.touched || k.dirty ? porukaValidacije(k.errors, labela) : null;
  }

  protected async posalji(): Promise<void> {
    if (this.cuva()) {
      return;
    }
    const { tema, rb, datum } = this.forma.getRawValue();
    if (this.forma.invalid || rb === null) {
      this.forma.markAllAsTouched();
      return;
    }
    this.cuva.set(true);
    try {
      if (await this.sacuvaj()({ tema: tema.trim(), rb: Number(rb), datum })) {
        this.izmena.set(false);
      }
    } finally {
      this.cuva.set(false);
    }
  }
}
