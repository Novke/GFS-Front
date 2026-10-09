import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormControl, FormGroup, FormRecord, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatError, MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatProgressSpinner } from '@angular/material/progress-spinner';

import { PORUKA_SISTEM, toApiError } from '../../../core/api/api-error';
import { FormErrorBanner } from '../../../shared/forms/form-error-banner';
import { porukaValidacije } from '../../../shared/forms/poruke-validacije';
import { SaveStatus, StanjeCuvanja } from '../../../shared/ui/save-status';
import { OceneApi } from '../data-access/ocene.api';
import { KoeficijentiInfo, PODRAZUMEVANI_KOEFICIJENTI, SaveKoeficijentiCmd } from '../data-access/ocene.models';

/** Tip testa kako ga zna hub (H5): naziv i da li je aktivan. */
export interface TipZaKoeficijente {
  id: number;
  naziv: string | null;
  aktivan?: boolean | null;
}

/** Red "max poena po tipu" u formi. */
export interface RedTipa {
  id: number;
  naziv: string;
  aktivan: boolean;
}

/**
 * Tipovi u formi: svi iz koeficijenata (i isključeni koji imaju sačuvan red), pa tipovi huba kojih tamo nema (nov tip).
 * Naziv i `aktivan` dolaze iz huba kad ga zna (preimenovanje se vidi odmah), inače iz koeficijenata.
 */
export function redoviTipova(koef: KoeficijentiInfo | null | undefined, tipovi: readonly TipZaKoeficijente[]): RedTipa[] {
  const poId = new Map(tipovi.filter(t => typeof t?.id === 'number').map(t => [t.id, t]));
  const redovi: RedTipa[] = [];
  const vidjeno = new Set<number>();
  for (const k of koef?.koeficijentiTipova ?? []) {
    if (typeof k?.tipTestaId !== 'number' || vidjeno.has(k.tipTestaId)) {
      continue;
    }
    vidjeno.add(k.tipTestaId);
    const t = poId.get(k.tipTestaId);
    redovi.push({ id: k.tipTestaId, naziv: t?.naziv?.trim() || k.tipTestaNaziv?.trim() || `Tip ${k.tipTestaId}`, aktivan: t?.aktivan !== false });
  }
  for (const t of tipovi) {
    if (typeof t?.id === 'number' && !vidjeno.has(t.id)) {
      vidjeno.add(t.id);
      redovi.push({ id: t.id, naziv: t.naziv?.trim() || `Tip ${t.id}`, aktivan: t.aktivan !== false });
    }
  }
  return redovi;
}

type Broj = FormControl<number | null>;
const obavezan = () => new FormControl<number | null>(null, [Validators.required, Validators.min(0)]);
const opcioni = () => new FormControl<number | null>(null, [Validators.min(0)]);

const LABELE: Record<string, string> = {
  koefPrisustvo: 'Prisustvo',
  koefZadatak: 'Zadatak',
  koefZvezdica: 'Zvezdica',
  domaciFlat: 'Fiksno po domaćem',
  domaciVarijansa: 'Varijabilno',
};

/** Konačan broj ili `null` (prazno polje). */
function broj(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Koeficijenti ocenjivanja predmeta (Podešavanja u hubu; ista polja i objašnjenja kao stari editor na `ocene`):
 * koeficijenti aktivnosti i domaćih, maksimumi za normalizaciju, max poena po tipu testa, MAX ili poslednji rezultat,
 * zbirni prikaz. Čuva se eksplicitno ("Sačuvaj", `SaveStatus`); nijedna vrednost ne sme biti negativna (forma tada ne
 * šalje ništa). Prazan maksimum = bez normalizacije (`null`). Roditelj pita `imaNesacuvanihIzmena()` pre napuštanja.
 */
@Component({
  selector: 'app-koeficijenti-forma',
  imports: [
    FormErrorBanner, MatButton, MatCheckbox, MatError, MatFormField, MatHint, MatInput, MatLabel, MatProgressSpinner,
    ReactiveFormsModule, SaveStatus,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form [formGroup]="forma" (ngSubmit)="sacuvaj()" novalidate>
      <app-form-error-banner [poruka]="greska()" />
      <p class="objasnjenje">
        Koeficijenti određuju relativnu težinu između aktivnosti. Max poena (normalizacija) skalira ukupan rezultat na
        željeni broj poena. Ako ostavite max poena prazno, rezultat se ne normalizuje.
      </p>
      <div class="grupe-polja">
        <fieldset>
          <legend>Aktivnosti</legend>
          @for (ime of poljaAktivnosti; track ime) {
            <mat-form-field appearance="outline">
              <mat-label>{{ labela(ime) }} (koef)</mat-label>
              <input matInput type="number" inputmode="decimal" min="0" step="0.5" [formControlName]="ime" [attr.data-polje]="ime" />
              @if (poruka(ime); as m) {
                <mat-error>{{ m }}</mat-error>
              }
            </mat-form-field>
          }
          <mat-form-field appearance="outline">
            <mat-label>Max poena aktivnosti</mat-label>
            <input matInput type="number" inputmode="decimal" min="0" step="1" formControlName="maxAktivnost" placeholder="Bez normalizacije" data-polje="maxAktivnost" />
            <mat-hint>Prazno = bez normalizacije</mat-hint>
            @if (poruka('maxAktivnost'); as m) {
              <mat-error>{{ m }}</mat-error>
            }
          </mat-form-field>
        </fieldset>

        <fieldset>
          <legend>Domaći</legend>
          <mat-form-field appearance="outline">
            <mat-label>Fiksno po domaćem (flat)</mat-label>
            <input matInput type="number" inputmode="decimal" min="0" step="0.5" formControlName="domaciFlat" data-polje="domaciFlat" />
            @if (poruka('domaciFlat'); as m) {
              <mat-error>{{ m }}</mat-error>
            }
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Varijabilno (0-10 bodova)</mat-label>
            <input matInput type="number" inputmode="decimal" min="0" step="0.5" formControlName="domaciVarijansa" data-polje="domaciVarijansa" />
            @if (poruka('domaciVarijansa'); as m) {
              <mat-error>{{ m }}</mat-error>
            }
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Max poena domaći</mat-label>
            <input matInput type="number" inputmode="decimal" min="0" step="1" formControlName="maxDomaci" placeholder="Bez normalizacije" data-polje="maxDomaci" />
            <mat-hint>Prazno = bez normalizacije</mat-hint>
            @if (poruka('maxDomaci'); as m) {
              <mat-error>{{ m }}</mat-error>
            }
          </mat-form-field>
        </fieldset>

        <fieldset>
          <legend>Tipovi testova (max poena)</legend>
          @for (t of tipovi$(); track t.id) {
            @if (kontrolaTipa(t.id); as c) {
              <mat-form-field appearance="outline">
                <mat-label>{{ t.naziv }}{{ t.aktivan ? '' : ' (neaktivan)' }}</mat-label>
                <input matInput type="number" inputmode="decimal" min="0" step="1" [formControl]="c" placeholder="Originalno" [attr.data-polje]="'tip-' + t.id" />
                <mat-hint>Prazno = originalni poeni</mat-hint>
                @if (porukaTipa(c); as m) {
                  <mat-error>{{ m }}</mat-error>
                }
              </mat-form-field>
            }
          } @empty {
            <p class="prazno">Nema tipova testa za ovaj predmet</p>
          }
        </fieldset>
      </div>

      <fieldset class="opcije">
        <legend>Opcije</legend>
        <mat-checkbox formControlName="koristiMaxRezultat" data-polje="koristiMaxRezultat">Koristi MAX rezultat testa (umesto poslednjeg)</mat-checkbox>
        <mat-checkbox formControlName="prikaziZbirno" data-polje="prikaziZbirno">Prikaži domaći i aktivnost zbirno (kao "Predispitne")</mat-checkbox>
      </fieldset>

      <div class="akcije">
        <app-save-status [stanje]="stanje()" (ponovo)="sacuvaj()" />
        <button matButton type="button" [disabled]="cuva() || !izmenjeno()" (click)="vrati()" data-vrati>Vrati sačuvano</button>
        <button matButton="filled" type="submit" [disabled]="cuva()" data-sacuvaj>
          @if (cuva()) {
            <mat-progress-spinner mode="indeterminate" diameter="18" aria-label="Čuvanje" />
          }
          Sačuvaj koeficijente
        </button>
      </div>
    </form>
  `,
  styles: `
    :host { display: block; }
    .objasnjenje { margin: 0 0 16px; color: var(--muted); max-width: 72ch; }
    .grupe-polja { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 8px 24px; }
    fieldset { display: flex; flex-direction: column; gap: 4px; min-width: 0; margin: 0; padding: 0; border: 0; }
    legend { margin-bottom: 10px; padding: 0; font-size: 15px; font-weight: 600; }
    .opcije { gap: 4px; margin-top: 12px; }
    .prazno { margin: 0; color: var(--muted); }
    .akcije { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px 12px; margin-top: 16px; }
    .akcije app-save-status { margin-right: auto; }
    button mat-progress-spinner { display: inline-block; margin-right: 8px; }
  `,
})
export class KoeficijentiForma {
  private readonly api = inject(OceneApi);

  readonly predmetId = input.required<number>();
  readonly koeficijenti = input.required<KoeficijentiInfo>();
  /** Tipovi testa iz huba (H5): nov tip dobija polje, preimenovan tip nov naziv. */
  readonly tipovi = input<readonly TipZaKoeficijente[]>([]);
  readonly sacuvano = output<KoeficijentiInfo>();

  protected readonly forma = new FormGroup({
    koefPrisustvo: obavezan(),
    koefZadatak: obavezan(),
    koefZvezdica: obavezan(),
    domaciFlat: obavezan(),
    domaciVarijansa: obavezan(),
    maxAktivnost: opcioni(),
    maxDomaci: opcioni(),
    koristiMaxRezultat: new FormControl(true, { nonNullable: true }),
    prikaziZbirno: new FormControl(false, { nonNullable: true }),
    tipovi: new FormRecord<Broj>({}),
  });

  /** Poslednje sačuvano stanje (server); "Vrati sačuvano" i provera izmena porede sa njim. */
  private readonly osnova = signal<KoeficijentiInfo | null>(null);
  protected readonly tipovi$ = computed(() => redoviTipova(this.osnova() ?? this.koeficijenti(), this.tipovi()));
  protected readonly stanje = signal<StanjeCuvanja | null>(null);
  protected readonly cuva = computed(() => this.stanje() === 'cuva');
  protected readonly greska = signal<string | null>(null);
  /** `dirty` forme kao signal (forma nije signal, a OnPush šablon treba da vidi promenu). */
  protected readonly izmenjeno = signal(false);

  constructor() {
    effect(() => {
      const k = this.koeficijenti();
      untracked(() => this.postavi(k));
    });
    // nov tip iz huba: dodaj polje, ne diraj ostale (izmene ostaju)
    effect(() => {
      const redovi = this.tipovi$();
      untracked(() => {
        for (const t of redovi) {
          if (!this.forma.controls.tipovi.contains(String(t.id))) {
            this.forma.controls.tipovi.addControl(String(t.id), opcioni(), { emitEvent: false });
          }
        }
      });
    });
    const pretplata = this.forma.valueChanges.subscribe(() => {
      this.izmenjeno.set(this.forma.dirty);
      if (this.stanje() === 'sacuvano') {
        this.stanje.set(null);
      }
    });
    inject(DestroyRef).onDestroy(() => pretplata.unsubscribe());
  }

  /** Za `CanDeactivate` (Podešavanja u hubu). */
  imaNesacuvanihIzmena(): boolean {
    return this.forma.dirty;
  }

  protected readonly poljaAktivnosti = ['koefPrisustvo', 'koefZadatak', 'koefZvezdica'] as const;

  protected labela(ime: string): string {
    return LABELE[ime] ?? ime;
  }

  protected poruka(ime: keyof typeof this.forma.controls): string | null {
    const c = this.forma.controls[ime];
    return c.touched ? porukaValidacije(c.errors as ValidationErrors | null, LABELE[ime] ?? 'Polje') : null;
  }

  protected porukaTipa(c: Broj): string | null {
    return porukaValidacije(c.errors, 'Max poena');
  }

  protected kontrolaTipa(id: number): Broj | null {
    return (this.forma.controls.tipovi.get(String(id)) as Broj | null) ?? null;
  }

  protected vrati(): void {
    const k = this.osnova();
    if (k) {
      this.postavi(k);
      this.greska.set(null);
      this.stanje.set(null);
    }
  }

  protected sacuvaj(): void {
    if (this.cuva()) {
      return;
    }
    this.forma.markAllAsTouched();
    if (this.forma.invalid) {
      this.greska.set(null);
      return;
    }
    const v = this.forma.getRawValue();
    const cmd: SaveKoeficijentiCmd = {
      koefPrisustvo: v.koefPrisustvo as number,
      koefZadatak: v.koefZadatak as number,
      koefZvezdica: v.koefZvezdica as number,
      domaciFlat: v.domaciFlat as number,
      domaciVarijansa: v.domaciVarijansa as number,
      koristiMaxRezultat: v.koristiMaxRezultat,
      prikaziZbirno: v.prikaziZbirno,
      maxAktivnost: broj(v.maxAktivnost),
      maxDomaci: broj(v.maxDomaci),
      // svi tipovi: server briše sačuvan max poena tipa kog nema u listi
      koeficijentiTipova: this.tipovi$().map(t => ({ tipTestaId: t.id, maxPoena: broj(v.tipovi[String(t.id)]) })),
    };
    this.stanje.set('cuva');
    this.greska.set(null);
    this.api.sacuvajKoeficijente(this.predmetId(), cmd, { tiho: true }).subscribe({
      next: k => {
        this.postavi(k);
        this.stanje.set('sacuvano');
        this.sacuvano.emit(k);
      },
      error: (e: unknown) => {
        this.stanje.set('greska');
        this.greska.set(e instanceof HttpErrorResponse ? toApiError(e).reason : PORUKA_SISTEM);
      },
    });
  }

  /** Forma = sačuvano stanje (posle učitavanja ili čuvanja); polja tipova se prave iznova. */
  private postavi(k: KoeficijentiInfo): void {
    const p = PODRAZUMEVANI_KOEFICIJENTI;
    this.osnova.set(k);
    const tipovi = this.forma.controls.tipovi;
    for (const kljuc of Object.keys(tipovi.controls)) {
      tipovi.removeControl(kljuc, { emitEvent: false });
    }
    for (const t of redoviTipova(k, this.tipovi())) {
      const sacuvan = (k.koeficijentiTipova ?? []).find(x => x?.tipTestaId === t.id);
      const c = opcioni();
      c.setValue(broj(sacuvan?.maxPoena));
      tipovi.addControl(String(t.id), c, { emitEvent: false });
    }
    this.forma.patchValue(
      {
        koefPrisustvo: broj(k.koefPrisustvo) ?? p.koefPrisustvo,
        koefZadatak: broj(k.koefZadatak) ?? p.koefZadatak,
        koefZvezdica: broj(k.koefZvezdica) ?? p.koefZvezdica,
        domaciFlat: broj(k.domaciFlat) ?? p.domaciFlat,
        domaciVarijansa: broj(k.domaciVarijansa) ?? p.domaciVarijansa,
        maxAktivnost: broj(k.maxAktivnost),
        maxDomaci: broj(k.maxDomaci),
        koristiMaxRezultat: k.koristiMaxRezultat ?? p.koristiMaxRezultat,
        prikaziZbirno: k.prikaziZbirno ?? p.prikaziZbirno,
      },
      { emitEvent: false },
    );
    this.forma.markAsPristine();
    this.forma.markAsUntouched();
    this.izmenjeno.set(false);
  }
}
