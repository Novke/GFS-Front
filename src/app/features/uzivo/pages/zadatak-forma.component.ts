import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { RouterLink } from '@angular/router';
import { startWith, switchMap } from 'rxjs';
import { NivoComponent } from '../../../shared/ui/nivo.component';
import type { CvorIzbora } from '../../../core/api/banka-izbor.api';
import { GrupaPutanja, PoljeZadatka, TipPoljaZadatka, ZadatakSlajda, ZadatakSlajdaInfo } from '../data-access/uzivo.models';
import { IzborGrupeOtvarac } from './izbor-grupe-otvarac';

/** Vreme i broj su tekst (prazno = bez tajmera / sve aktivne), kao trajanje prelaza: `type=number` bi prazno i "abc" izjednačio. */
export type ZadatakForma = FormGroup<{
  grupaId: FormControl<number | null>;
  vremeSekunde: FormControl<string>;
  brojVarijanti: FormControl<string>;
  /** `null` = svi nivoi. */
  nivo: FormControl<number | null>;
}>;

const nn = { nonNullable: true } as const;

/** Forma iz zadatka slajda (`null`: slajd bez zadatka, npr. stari odgovor). */
export function zadatakForma(z: ZadatakSlajda | null): ZadatakForma {
  return new FormGroup({
    grupaId: new FormControl<number | null>(z?.grupaId ?? null),
    vremeSekunde: new FormControl(z?.vremeSekunde == null ? '' : String(z.vremeSekunde), nn),
    brojVarijanti: new FormControl(z?.brojVarijanti == null ? '' : String(z.brojVarijanti), nn),
    nivo: new FormControl<number | null>(z?.nivo ?? null),
  });
}

/** Prazno -> `null`; samo cifre -> broj; sve ostalo `NaN`, pa poruka iz `greskeSlajda` (ne tiho "bez ograničenja"). */
function broj(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  return /^\d+$/.test(t) ? Number(t) : NaN;
}

/** Komanda zadatka iz forme (`SlajdCmd.zadatak`); granice proverava `greskeSlajda` istim porukama kao server. */
export function zadatakIzForme(f: ZadatakForma): ZadatakSlajda {
  const v = f.getRawValue();
  return { grupaId: v.grupaId, vremeSekunde: broj(v.vremeSekunde), brojVarijanti: broj(v.brojVarijanti), nivo: v.nivo };
}

const TIP_POLJA: Record<TipPoljaZadatka, string> = {
  BROJ: 'broj', TEKST: 'tekst', JEDAN_TACAN: 'jedan tačan', VISE_TACNIH: 'više tačnih',
};

/** Šta forma prikazuje o grupi: opis sa servera ili, dok on ne stigne, čvor upravo izabran u dijalogu. */
interface OpisGrupe {
  grupaId: number | null;
  putanja: GrupaPutanja[];
  list: boolean;
  brojAktivnih: number;
  /** Kandidati po nivoima (1, 2, 3); `null` dok server nije opisao grupu. */
  poNivou: number[] | null;
  polja: PoljeZadatka[] | null;
  upozorenja: string[];
}

/**
 * Polja Zadatak slajda (deo forme slajda): grupa iz banke (putanja, broj aktivnih varijanti, polja odgovora lista,
 * "Promeni grupu…" kroz lenji dijalog izbora), vreme za odgovor i broj različitih zadataka. Opis grupe (putanja, kandidati,
 * upozorenja) računa server (`ZadatakSlajdaInfo`); posle izbora u dijalogu, dok server ne odgovori, prikazuje se izabran čvor.
 * Upozorenja ne blokiraju čuvanje (`--warn`, `role="status"`); bez aktivnih varijanti veza vodi na čvor u banci.
 */
@Component({
  selector: 'app-zadatak-forma',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, MatButtonModule, MatFormFieldModule, MatInputModule, NivoComponent],
  template: `
    @let f = forma();
    @let o = opis();
    <div class="uz-ed-grupa">
      <span class="uz-ed-oznaka-grupe">Grupa zadataka</span>
      <span class="uz-zf-putanja" data-putanja>{{ putanja() || 'Nije izabrana' }}</span>
      <button mat-stroked-button type="button" (click)="promeniGrupu()">{{ o && o.grupaId !== null ? 'Promeni grupu…' : 'Izaberi grupu…' }}</button>
    </div>
    @if (o && o.grupaId !== null) {
      <p class="uz-ed-napomena">{{ o.list ? 'Aktivnih varijanti' : 'Aktivnih varijanti u podgrupama' }}: {{ o.brojAktivnih }}</p>
      @if (o.polja?.length) {
        <p class="uz-ed-napomena">Polja odgovora: {{ opisPolja(o.polja!) }}</p>
      } @else if (o.polja) {
        <p class="uz-ed-napomena">Bez polja odgovora: rad na papiru (telefon samo prikazuje zadatak).</p>
      }
    }
    <div class="uz-ed-red">
      <mat-form-field class="uz-zf-polje" subscriptSizing="dynamic">
        <mat-label>Vreme (s)</mat-label>
        <input matInput inputmode="numeric" autocomplete="off" [formControl]="f.controls.vremeSekunde">
        <mat-hint>Prazno = bez ograničenja.</mat-hint>
      </mat-form-field>
      <mat-form-field class="uz-zf-polje" subscriptSizing="dynamic">
        <mat-label>Broj različitih zadataka</mat-label>
        <input matInput inputmode="numeric" autocomplete="off" [formControl]="f.controls.brojVarijanti">
        <mat-hint>Prazno = sve aktivne ({{ brojZaNivo() }}). Menja se i u konzoli pre otvaranja.</mat-hint>
      </mat-form-field>
    </div>
    <div class="uz-ed-red" data-zadatak-nivo>
      <app-nivo izbor saSvima [nivo]="nivo()" [brojevi]="o?.poNivou" (promena)="postaviNivo($event)" />
    </div>
    <p class="uz-ed-napomena">Kad je nivo izabran, svi studenti dobijaju varijante tog nivoa; broj uz nivo su aktivne varijante.</p>
    <!-- region postoji uvek, da čitač ekrana najavi promenu (kao upozorenja formula u formi pitanja) -->
    <div role="status">
      @for (u of o?.upozorenja ?? []; track u) {
        <p class="uz-ed-upozorenje">{{ u }}</p>
      }
    </div>
    @if (o && o.grupaId !== null && o.brojAktivnih === 0) {
      <div>
        <a mat-button routerLink="/banka" [queryParams]="{ predmet: predmetId(), namena: 'PREDAVANJE', grupa: o.grupaId }">Otvori u banci</a>
      </div>
    }
  `,
  styles: `
    .uz-zf-putanja { overflow-wrap: anywhere; }
    .uz-zf-polje { width: 280px; max-width: 100%; }
  `,
})
export class ZadatakFormaComponent {
  readonly forma = input.required<ZadatakForma>();
  /** Opis sa servera (prati odgovore servera; forma se gradi jednom, ovo ne). */
  readonly info = input<ZadatakSlajdaInfo | null>(null);
  /** Predmet prezentacije: izbor grupe i veza na banku. */
  readonly predmetId = input.required<number>();

  /** Izabrani nivo iz forme (`null` = svi), kao signal da prikaz prati i izmenu forme spolja. */
  protected readonly nivo = toSignal(
    toObservable(this.forma).pipe(switchMap(f => f.controls.nivo.valueChanges.pipe(startWith(f.controls.nivo.value)))),
    { initialValue: null },
  );

  private readonly otvarac = inject(IzborGrupeOtvarac);
  private readonly destroyRef = inject(DestroyRef);

  /** Čvor izabran u dijalogu dok server ne vrati opis te grupe. */
  private readonly izabran = signal<CvorIzbora | null>(null);

  protected readonly opis = computed<OpisGrupe | null>(() => {
    const info = this.info();
    const c = this.izabran();
    // lokalni prikaz izmene (`slajdIzCmd`: prazan opis za drugu grupu) nema naziv; server ga uvek ima uz postojeću grupu
    const izServera = info && !(c && (info.grupaId !== c.id || info.grupaNaziv === null)) ? info : null;
    if (izServera) {
      return {
        grupaId: izServera.grupaId, putanja: izServera.putanja, list: izServera.list, brojAktivnih: izServera.brojAktivnihVarijanti,
        poNivou: izServera.brojAktivnihPoNivou,
        polja: izServera.polja, upozorenja: izServera.upozorenja,
      };
    }
    return c
      ? { grupaId: c.id, putanja: [{ id: c.id, naziv: c.naziv }], list: c.list, brojAktivnih: c.brojAktivnih, poNivou: null, polja: null, upozorenja: [] }
      : null;
  });
  /** Kandidati za nivo iz forme (ne sačuvani): iz brojeva po nivoima kad ih server dao, inače ukupan broj čvora. */
  protected readonly brojZaNivo = computed(() => {
    const o = this.opis();
    if (!o) return 0;
    const n = this.nivo();
    if (!o.poNivou) return o.brojAktivnih;
    return n === null ? o.poNivou.reduce((a, b) => a + b, 0) : o.poNivou[n - 1] ?? 0;
  });
  protected readonly putanja = computed(() => (this.opis()?.putanja ?? []).map(p => p.naziv).join(' › '));

  protected postaviNivo(n: number | null): void {
    this.forma().controls.nivo.setValue(n);
    this.forma().markAsDirty();
  }

  protected opisPolja(polja: PoljeZadatka[]): string {
    return polja.map(p => `${p.oznaka} (${TIP_POLJA[p.tip]})`).join(', ');
  }

  protected promeniGrupu(): void {
    const kontrola = this.forma().controls.grupaId;
    this.otvarac.izaberi({ predmetId: this.predmetId(), grupaId: kontrola.value })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(c => {
        if (!c || c.id === kontrola.value) return;
        this.izabran.set(c);
        kontrola.setValue(c.id);
      });
  }
}
