import { ChangeDetectionStrategy, Component, effect, input, output, untracked } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatProgressSpinner } from '@angular/material/progress-spinner';

import { FormErrorBanner } from '../../../shared/forms/form-error-banner';
import { IndeksPolja, indeksKontrole, vrednostIndeksa } from '../../../shared/forms/indeks-polja';
import { samoCifreBroja } from '../../../shared/util/indeks';
import { IndeksIGodina } from '../data-access/nalog.models';

/**
 * Korak "indeks" prijave studenta kodom (spec prijave 5.1 tačka 1): indeks u tri dela (`GD` + broj + godina upisa, godina
 * predložena), "Pošalji kod" i "Imam kod od nastavnika" (prelazi na unos koda bez slanja mejla: kod je nastavnik izdiktirao).
 * Prezentaciona komponenta (bez HTTP-a): roditelj šalje zahtev i vraća `salje`/`greska`. Koriste je `/nalog` i `/nalog/moodle`.
 */
@Component({
  selector: 'app-nalog-indeks-korak',
  imports: [FormErrorBanner, IndeksPolja, MatButton, MatProgressSpinner, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-form-error-banner [poruka]="greska()" />
    <p class="uvod">Upiši broj indeksa i godinu upisa. Kod za prijavu stiže na mejl koji si dao pri upisu.</p>
    <form class="forma" [formGroup]="forma" (ngSubmit)="posalji()" novalidate>
      <app-indeks-polja [grupa]="forma" [hintGodine]="hintGodine()" />
      <button type="submit" mat-flat-button class="dugme" [disabled]="salje()">
        @if (salje()) {
          <mat-progress-spinner mode="indeterminate" diameter="18" aria-hidden="true" />
        }
        Pošalji kod
      </button>
    </form>
    <button type="button" matButton class="imam-kod" [disabled]="salje()" (click)="imamKodOdNastavnika()">
      Imam kod od nastavnika
    </button>
  `,
  styles: `
    :host { display: block; }
    .uvod { margin: 0 0 18px; color: var(--ink-2); }
    .forma { display: flex; flex-direction: column; gap: 18px; }
    .dugme { width: 100%; min-height: 48px; font-size: 16px; }
    .dugme mat-progress-spinner { display: inline-block; margin-right: 8px; vertical-align: middle; }
    .imam-kod { display: block; width: 100%; min-height: 44px; margin-top: 10px; }
  `,
})
export class IndeksKorak {
  /** Početni indeks (`GD5`, npr. posle "Drugi indeks"); prazno = prazno polje broja. */
  readonly indeks = input('');
  /** Predložena godina upisa (iz izvođenja ili tekuća školska godina). */
  readonly godina = input<number | null>(null);
  /** Pomoćni tekst ispod godine. */
  readonly hintGodine = input('Promeni ako si upisan ranije.');
  readonly salje = input(false);
  /** Tekst greške servera za baner (`null` sakriva). */
  readonly greska = input<string | null>(null);
  /** Kanonski indeks (`GD5`) i godina: pošalji kod na mejl. */
  readonly posaljiKod = output<IndeksIGodina>();
  /** Isto, ali bez slanja: student ima kod od nastavnika. */
  readonly imamKod = output<IndeksIGodina>();

  protected readonly forma = indeksKontrole(null);

  constructor() {
    effect(() => {
      const indeks = this.indeks();
      const godina = this.godina();
      untracked(() => {
        this.forma.reset({ broj: samoCifreBroja(indeks.split('/')[0]), godina: godina === null ? '' : String(godina) });
      });
    });
  }

  protected posalji(): void {
    const v = this.proveri();
    if (v) {
      this.posaljiKod.emit(v);
    }
  }

  protected imamKodOdNastavnika(): void {
    const v = this.proveri();
    if (v) {
      this.imamKod.emit(v);
    }
  }

  private proveri(): IndeksIGodina | null {
    if (this.salje()) {
      return null;
    }
    this.forma.markAllAsTouched();
    return vrednostIndeksa(this.forma);
  }
}
