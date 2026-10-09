import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { MatOption, MatSelect } from '@angular/material/select';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { TipTestaInfo } from '../../../core/api/reference.api';
import { porukaValidacije } from '../../../shared/forms/poruke-validacije';
import { StatusChip } from '../../../shared/ui/status-chip';
import { DatumPipe } from '../../../shared/util/datum.pipe';
import { formatBroja, PORUKA_PRAGA } from '../data-access/test.store';
import { TestDetails, UpdateTestCmd, VARIJANTE } from '../data-access/testovi.models';
import { PragProlaza } from './prag-prolaza';

const ISO_DATUM = /^\d{4}-\d{2}-\d{2}$/;

/** `['A','B']` -> `A–B`, `['A']` -> `A`; bez varijanti `—`. */
export function varijantePrikaz(grupe: readonly string[] | null | undefined): string {
  const v = VARIJANTE.filter(x => (grupe ?? []).includes(x));
  return v.length === 0 ? '—' : v.length === 1 ? v[0] : `${v[0]}–${v[v.length - 1]}`;
}

/**
 * Zaglavlje testa (detalj i statistika): status, naziv tipa, predmet / grupa / datum / max / varijante kao chipovi,
 * tabovi "Unos poena" i "Statistika" (rute) i meni ⋮. Dok test nije evidentiran, tip, datum i max poena su izmenljivi
 * (forma na mestu naslova, `sacuvaj` vraća `null` kad server prihvati, inače razlog); novi max ne sme biti manji od
 * unetih poena ni od praga.
 * Prag prolaza je zasebno polje (`cuvajPrag`) koje se čuva samo i menja se i na evidentiranom testu.
 */
@Component({
  selector: 'app-test-zaglavlje',
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
    MatOption,
    MatProgressSpinner,
    MatSelect,
    PragProlaza,
    ReactiveFormsModule,
    RouterLink,
    RouterLinkActive,
    StatusChip,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="naslov-blok">
      @if (test().pregledan === true) {
        <app-status-chip tekst="Evidentiran" ton="ok" />
      } @else {
        <app-status-chip tekst="Za evidentiranje" ton="warn" />
      }

      @if (izmena()) {
        <form class="izmena" [formGroup]="forma" (ngSubmit)="posalji()" novalidate aria-label="Izmena testa">
          @if (greskaForme(); as g) {
            <p class="greska-forme" role="alert" data-greska-forme>{{ g }}</p>
          }
          <mat-form-field appearance="outline" class="tip">
            <mat-label>Tip testa</mat-label>
            <mat-select formControlName="tipTestaId" data-tip>
              @for (t of opcijeTipa(); track t.id) {
                <mat-option [value]="t.id">{{ t.naziv }}</mat-option>
              }
            </mat-select>
            @if (poruka('tipTestaId'); as m) {
              <mat-error>{{ m }}</mat-error>
            }
          </mat-form-field>
          <mat-form-field appearance="outline" class="datum">
            <mat-label>Datum</mat-label>
            <input matInput type="date" formControlName="datum" data-datum />
            @if (poruka('datum'); as m) {
              <mat-error>{{ m }}</mat-error>
            }
          </mat-form-field>
          <mat-form-field appearance="outline" class="max">
            <mat-label>Max poena</mat-label>
            <input matInput type="number" inputmode="numeric" min="1" max="100" formControlName="maxPoena" data-max />
            @if (poruka('maxPoena'); as m) {
              <mat-error>{{ m }}</mat-error>
            }
          </mat-form-field>
          <div class="dugmad">
            <button matButton type="button" (click)="izmena.set(false)">Odustani</button>
            <button matButton="filled" type="submit" data-sacuvaj [disabled]="cuva()">
              @if (cuva()) {
                <mat-progress-spinner mode="indeterminate" diameter="18" aria-label="Čuvanje" />
              }
              Sačuvaj
            </button>
          </div>
        </form>
      } @else {
        <div class="naslov-red">
          <h1>{{ naslov() }}</h1>
          @if (izmenljivo()) {
            <button matIconButton type="button" class="izmeni" aria-label="Izmeni tip, datum i max poena" data-izmeni (click)="pocniIzmenu()">
              <mat-icon svgIcon="edit" />
            </button>
          }
        </div>
      }

      <div class="kontekst">
        <span class="oznaka ton-neutral" title="Predmet">{{ test().predmet?.naziv || '—' }}</span>
        <span class="oznaka ton-neutral" title="Grupa">{{ test().grupa?.naziv || '—' }}</span>
        <span class="oznaka ton-neutral mono" title="Datum"><mat-icon svgIcon="event" aria-hidden="true" />{{ test().datum | datum }}</span>
        <span class="oznaka ton-neutral mono" title="Max poena">max {{ test().maxPoena ?? '—' }}</span>
        <span class="oznaka ton-neutral mono" title="Varijante">var. {{ varijante() }}</span>
      </div>
      @if (cuvajPrag(); as cuvaj) {
        <app-prag-prolaza [prag]="test().pragProlaza ?? null" [max]="test().maxPoena ?? null" [cuvaj]="cuvaj" />
      }
    </div>

    <div class="desno">
      <ng-content select="[akcije]" />
      <button matIconButton type="button" [matMenuTriggerFor]="meni" aria-label="Još akcija" data-meni>
        <mat-icon svgIcon="more_vert" />
      </button>
      <mat-menu #meni="matMenu" xPosition="before">
        @if (izmenljivo()) {
          <button mat-menu-item type="button" (click)="pocniIzmenu()"><mat-icon svgIcon="edit" />Izmeni tip, datum i max poena</button>
        }
        <button mat-menu-item type="button" class="opasno" data-obrisi (click)="obrisi.emit()"><mat-icon svgIcon="delete" />Obriši test</button>
      </mat-menu>
    </div>

    <nav class="tabovi" aria-label="Delovi testa">
      <a [routerLink]="['/testovi', test().id]" routerLinkActive="aktivan" ariaCurrentWhenActive="page" [routerLinkActiveOptions]="{ exact: true }"
        data-tab="unos">{{ test().pregledan === true ? 'Rezultati' : 'Unos poena' }}</a>
      <a [routerLink]="['/testovi', test().id, 'statistika']" routerLinkActive="aktivan" ariaCurrentWhenActive="page" data-tab="statistika">Statistika</a>
    </nav>
  `,
  styles: `
    :host { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 16px; margin-bottom: 16px; }
    .naslov-blok { flex: 1 1 320px; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 6px; }
    .naslov-red { display: flex; align-items: center; gap: 4px; max-width: 100%; }
    h1 { font-size: 26px; overflow-wrap: anywhere; }
    .izmeni { color: var(--muted); flex: none; }
    .kontekst { display: flex; flex-wrap: wrap; gap: 6px; }
    .kontekst .oznaka { white-space: normal; overflow-wrap: anywhere; }
    .kontekst .mat-icon { width: 16px; height: 16px; }
    .izmena { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 0 12px; width: 100%; margin-top: 4px; }
    .izmena .tip { flex: 1 1 200px; }
    .izmena .datum { flex: 0 1 180px; }
    .izmena .max { flex: 0 0 130px; }
    .dugmad { display: flex; gap: 8px; padding-top: 8px; }
    .greska-forme { flex: 1 0 100%; margin: 0 0 8px; color: var(--danger); font-size: 13px; }
    .dugmad mat-progress-spinner { display: inline-block; margin-right: 8px; }
    .desno { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-left: auto; }
    .opasno { color: var(--danger); }
    .tabovi { flex: 1 0 100%; display: flex; gap: 4px; border-bottom: 1px solid var(--line); }
    .tabovi a { padding: 10px 14px; margin-bottom: -1px; border-bottom: 3px solid transparent; color: var(--ink-2); font-weight: 600;
      text-decoration: none; }
    .tabovi a:hover { color: var(--ink); }
    .tabovi a.aktivan { border-bottom-color: var(--primary); color: var(--primary); }
    @media (max-width: 599.98px) {
      h1 { font-size: 22px; }
      .desno { width: 100%; justify-content: flex-end; }
      .tabovi a { flex: 1; text-align: center; min-height: 44px; }
    }
  `,
})
export class TestZaglavlje {
  readonly test = input.required<TestDetails>();
  /** Aktivni tipovi predmeta (`ReferenceStore.tipoviTesta`); trenutni tip se dodaje i kad je neaktivan. */
  readonly tipovi = input<readonly TipTestaInfo[]>([]);
  /** Tip, datum i max se menjaju samo dok test nije evidentiran (server odbija izmenu evidentiranog). */
  readonly izmenljivo = input(false);
  /** Najveći uneti poeni (novi max ne sme biti manji); `null` kad nema unetih. */
  readonly najviseUneto = input<number | null>(null);
  /** Čuva zaglavlje; vraća `null` kad je sačuvano, inače razlog greške (prikazuje se u formi). */
  readonly sacuvaj = input<(izmena: UpdateTestCmd) => Promise<string | null>>(() => Promise.resolve(null));
  /** Čuva prag prolaza (`null` briše); bez ovog ulaza polje praga se ne prikazuje. Radi i na evidentiranom testu. */
  readonly cuvajPrag = input<((prag: number | null) => Promise<string | null>) | null>(null);
  readonly obrisi = output<void>();

  protected readonly izmena = signal(false);
  protected readonly cuva = signal(false);
  protected readonly greskaForme = signal<string | null>(null);

  protected readonly naslov = computed(() => this.test().tipTesta?.naziv?.trim() || 'Test');
  protected readonly varijante = computed(() => varijantePrikaz(this.test().grupe));
  protected readonly opcijeTipa = computed(() => {
    const t = this.test().tipTesta;
    const lista = [...this.tipovi()];
    if (t && !lista.some(x => x.id === t.id)) {
      lista.unshift(t);
    }
    return lista;
  });

  protected readonly forma = new FormGroup({
    tipTestaId: new FormControl<number | null>(null, Validators.required),
    datum: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(ISO_DATUM)] }),
    maxPoena: new FormControl<number | null>(null, [Validators.required, Validators.min(1), Validators.max(100), Validators.pattern(/^\d+$/)]),
  });

  protected pocniIzmenu(): void {
    const t = this.test();
    this.forma.reset({ tipTestaId: t.tipTesta?.id ?? null, datum: t.datum ?? '', maxPoena: t.maxPoena });
    this.greskaForme.set(null);
    this.izmena.set(true);
  }

  protected poruka(ime: 'tipTestaId' | 'datum' | 'maxPoena'): string | null {
    const k = this.forma.controls[ime];
    if (!(k.touched || k.dirty)) {
      return null;
    }
    if (k.errors?.['ispodUnetih']) {
      return `Neko već ima ${formatBroja(this.najviseUneto())} poena.`;
    }
    if (k.errors?.['ispodPraga']) {
      return `Max ne može biti manji od praga prolaza (${this.test().pragProlaza}).`;
    }
    if (k.errors?.['server']) {
      return k.errors['server'] as string;
    }
    if (ime === 'maxPoena' && k.errors?.['pattern'] && !k.errors?.['min']) {
      return 'Unesi ceo broj.';
    }
    return porukaValidacije(k.errors, { tipTestaId: 'Tip testa', datum: 'Datum', maxPoena: 'Max poena' }[ime]);
  }

  protected async posalji(): Promise<void> {
    if (this.cuva()) {
      return;
    }
    const { tipTestaId, datum, maxPoena } = this.forma.getRawValue();
    const najvise = this.najviseUneto();
    const prag = this.test().pragProlaza;
    if (maxPoena !== null && najvise !== null && Number(maxPoena) < najvise) {
      this.forma.controls.maxPoena.setErrors({ ispodUnetih: true });
    } else if (maxPoena !== null && prag !== null && prag !== undefined && Number(maxPoena) < prag) {
      this.forma.controls.maxPoena.setErrors({ ispodPraga: true });
    }
    if (this.forma.invalid || tipTestaId === null || maxPoena === null) {
      this.forma.markAllAsTouched();
      return;
    }
    this.cuva.set(true);
    try {
      this.greskaForme.set(null);
      const greska = await this.sacuvaj()({ tipTestaId, datum, maxPoena: Number(maxPoena) });
      if (greska === null) {
        this.izmena.set(false);
      } else if (greska === PORUKA_PRAGA) {
        // max manji od praga prolaza: greška pripada polju max poena
        this.forma.controls.maxPoena.setErrors({ server: greska });
        this.forma.controls.maxPoena.markAsTouched();
      } else {
        this.greskaForme.set(greska);
      }
    } finally {
      this.cuva.set(false);
    }
  }
}
