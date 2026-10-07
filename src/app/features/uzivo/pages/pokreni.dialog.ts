import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { Observable, catchError, forkJoin, of } from 'rxjs';
import { IzvodjenjaApi } from '../data-access/izvodjenja.api';
import { PrezentacijeApi } from '../data-access/prezentacije.api';
import { razlogGreske } from '../data-access/razlog-greske';
import { GrupaKratko, IzvodjenjeInfo, PokreniCmd, PredavanjeZaPokretanje } from '../data-access/uzivo.models';

export type IzborPokretanja = 'predavanje' | 'grupa' | 'bezGrupe' | 'necuvaj';

export interface PokreniPodaci { prezentacijaId: number; naziv: string; }

/**
 * Pokretanje bez dijaloga (spec 1.10, 6.3): ruta sa `?predavanje=ID` vezuje izvođenje za to predavanje; prezentacija
 * bez pitanja samo krene, bez čuvanja. `null` = treba pitati nastavnika.
 */
export function pokretanjeBezDijaloga(predavanje: string | null, brojPitanja: number): PokreniCmd | null {
  const id = predavanje !== null && /^\d+$/.test(predavanje) ? Number(predavanje) : 0;
  if (id > 0) return { cuvanje: true, grupaId: null, predavanjeId: id };
  if (brojPitanja === 0) return { cuvanje: false, grupaId: null, predavanjeId: null };
  return null;
}

/** Komanda iz izbora u dijalogu; `null` dok izbor nije potpun (nije izabrano predavanje ili grupa). */
export function pokreniCmd(izbor: IzborPokretanja, predavanjeId: number | null, grupaId: number | null): PokreniCmd | null {
  switch (izbor) {
    case 'predavanje': return predavanjeId ? { cuvanje: true, grupaId: null, predavanjeId } : null;
    case 'grupa': return grupaId ? { cuvanje: true, grupaId, predavanjeId: null } : null;
    case 'bezGrupe': return { cuvanje: true, grupaId: null, predavanjeId: null };
    case 'necuvaj': return { cuvanje: false, grupaId: null, predavanjeId: null };
  }
}

/** "7.10.2026. · 3. predavanje · GD-2025 · Statika" */
export function opisPredavanja(p: PredavanjeZaPokretanje): string {
  const [g, m, d] = (p.datum ?? '').slice(0, 10).split('-').map(Number);
  const datum = g && m && d ? `${d}.${m}.${g}.` : p.datum;
  return [datum, `${p.rb}. predavanje`, p.grupa?.naziv, p.tema].filter(Boolean).join(' · ');
}

/** Otvara dijalog; emituje pokrenuto izvođenje ili `undefined` kad nastavnik odustane. */
export function otvoriPokreni(dialog: MatDialog, podaci: PokreniPodaci): Observable<IzvodjenjeInfo | undefined> {
  return dialog.open<PokreniDialog, PokreniPodaci, IzvodjenjeInfo>(PokreniDialog, {
    data: podaci, width: '560px', maxWidth: '95vw', autoFocus: 'first-tabbable',
  }).afterClosed();
}

/** Izbor čuvanja pre starta (prezentacija sa pitanjima): uz predavanje, za grupu, bez grupe, ne čuvaj. */
@Component({
  selector: 'gfs-pokreni-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule, MatFormFieldModule, MatProgressBarModule, MatRadioModule, MatSelectModule],
  template: `
    <h2 mat-dialog-title>Pokreni prezentaciju</h2>
    <mat-dialog-content class="uz-ed-dijalog">
      <p>„{{ data.naziv }}“ ima pitanja. Gde se čuvaju odgovori studenata?</p>
      @if (ucitava()) {
        <mat-progress-bar mode="indeterminate" aria-label="Učitavanje predavanja i grupa" />
      }
      <mat-radio-group class="uz-ed-izbori" aria-label="Čuvanje odgovora" [value]="izbor()" (change)="izbor.set($event.value)">
        <mat-radio-button value="predavanje" [disabled]="!predavanja().length">Uz predavanje</mat-radio-button>
        @if (izbor() === 'predavanje') {
          <mat-form-field class="uz-ed-uvuceno">
            <mat-label>Predavanje</mat-label>
            <mat-select [value]="predavanjeId()" (selectionChange)="predavanjeId.set($event.value)">
              @for (p of predavanja(); track p.id) {
                <mat-option [value]="p.id">{{ opis(p) }}</mat-option>
              }
            </mat-select>
            <mat-hint>Rezultati se vezuju za predavanje i njegovu grupu.</mat-hint>
          </mat-form-field>
        } @else if (!ucitava() && !predavanja().length) {
          <p class="uz-ed-napomena uz-ed-uvuceno">Za ovaj predmet nema nezavršenih ni današnjih predavanja.</p>
        }
        <mat-radio-button value="grupa">Za grupu</mat-radio-button>
        @if (izbor() === 'grupa') {
          <mat-form-field class="uz-ed-uvuceno">
            <mat-label>Grupa</mat-label>
            <mat-select [value]="grupaId()" (selectionChange)="grupaId.set($event.value)">
              @for (g of grupe(); track g.id) {
                <mat-option [value]="g.id">{{ g.naziv }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        }
        <mat-radio-button value="bezGrupe">Bez grupe, sačuvaj rezultate</mat-radio-button>
        <mat-radio-button value="necuvaj">Ne čuvaj (odgovori postoje samo tokom izvođenja)</mat-radio-button>
      </mat-radio-group>
      @if (greska(); as g) {
        <p class="uz-ed-greska" role="alert">{{ g }}</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Otkaži</button>
      <button mat-flat-button color="primary" type="button" [disabled]="!cmd() || salje()" (click)="pokreni()">Pokreni</button>
    </mat-dialog-actions>
  `,
})
export class PokreniDialog {
  protected readonly data = inject<PokreniPodaci>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<PokreniDialog, IzvodjenjeInfo>>(MatDialogRef);
  private readonly api = inject(PrezentacijeApi);
  private readonly izvodjenja = inject(IzvodjenjaApi);

  protected readonly opis = opisPredavanja;
  protected readonly ucitava = signal(true);
  protected readonly salje = signal(false);
  protected readonly greska = signal<string | null>(null);
  protected readonly predavanja = signal<PredavanjeZaPokretanje[]>([]);
  protected readonly grupe = signal<GrupaKratko[]>([]);
  protected readonly izbor = signal<IzborPokretanja>('bezGrupe');
  protected readonly predavanjeId = signal<number | null>(null);
  protected readonly grupaId = signal<number | null>(null);
  protected readonly cmd = computed(() => pokreniCmd(this.izbor(), this.predavanjeId(), this.grupaId()));

  constructor() {
    const neuspeh = <T>(poruka: string) => catchError<T[], Observable<T[]>>(e => {
      this.greska.set(razlogGreske(e, poruka));
      return of([]);
    });
    forkJoin({
      predavanja: this.api.predavanja(this.data.prezentacijaId).pipe(neuspeh<PredavanjeZaPokretanje>('Predavanja nisu učitana.')),
      grupe: this.api.grupe().pipe(neuspeh<GrupaKratko>('Grupe nisu učitane.')),
    }).pipe(takeUntilDestroyed()).subscribe(({ predavanja, grupe }) => {
      this.predavanja.set(predavanja);
      this.grupe.set(grupe);
      if (predavanja.length) {
        this.izbor.set('predavanje');
        this.predavanjeId.set(predavanja[0].id);
      }
      this.ucitava.set(false);
    });
  }

  protected pokreni(): void {
    const cmd = this.cmd();
    if (!cmd || this.salje()) return;
    this.salje.set(true);
    this.greska.set(null);
    this.izvodjenja.pokreni(this.data.prezentacijaId, cmd).subscribe({
      next: i => this.ref.close(i),
      error: e => {
        this.salje.set(false);
        this.greska.set(razlogGreske(e, 'Pokretanje nije uspelo.'));
      },
    });
  }
}
