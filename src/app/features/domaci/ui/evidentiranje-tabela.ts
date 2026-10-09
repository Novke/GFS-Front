import { ChangeDetectionStrategy, Component, ElementRef, inject, input, output, signal } from '@angular/core';
import { MatIcon } from '@angular/material/icon';

import { SaveStatus, StanjeCuvanja } from '../../../shared/ui/save-status';
import { StatusChip } from '../../../shared/ui/status-chip';
import { IndeksPipe } from '../../../shared/util/indeks.pipe';
import { TipAktivnosti } from '../../predavanja/data-access/predavanja.models';
import { MAX_BODOVA, MAX_NAPOMENA, RedStudenta, VrednostiReda } from '../data-access/domaci.store';

export type PoljeReda = 'bodovi' | 'napomene';

/** Izmena jednog polja reda (`studentId` + deo vrednosti) koju tabela javlja roditelju. */
export interface IzmenaReda {
  studentId: number;
  izmena: Partial<VrednostiReda>;
}

const AKTIVNOST_TEKST: Record<TipAktivnosti, string> = { PRISUSTVO: 'Prisutan', ZADATAK: 'Zadatak', SA_ZVEZDICOM: 'Zadatak sa zvezdicom' };

/**
 * Tabela evidentiranja domaćeg (D1, spec 4 "Tabelarni unos"): red po studentu (ime, indeks, aktivnost na predavanju,
 * bodovi 0-10, prepisivanje, napomena, status čuvanja). `Enter` u polju bodova ili napomene ide u isto polje sledećeg
 * reda (preskače redove koji nemaju polje) i traži da se red odmah sačuva; `Tab` ide na sledeće polje. Oslobođeni redovi
 * i `samoCitanje` (pregledan domaći) nemaju polja, samo tekst. Bodovi koji nisu ceo broj 0-10 se ne javljaju roditelju
 * (ne čuvaju se) i dobijaju poruku u koloni statusa. Ispod 600 px redovi su kartice.
 */
@Component({
  selector: 'app-evidentiranje-tabela',
  imports: [IndeksPipe, MatIcon, SaveStatus, StatusChip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './evidentiranje-tabela.html',
  styleUrl: './evidentiranje-tabela.scss',
})
export class EvidentiranjeTabela {
  readonly studenti = input.required<readonly RedStudenta[]>();
  readonly vrednosti = input.required<Readonly<Record<number, VrednostiReda>>>();
  readonly statusi = input<Readonly<Record<number, StanjeCuvanja | null>>>({});
  /** Pregledan domaći: bez polja. */
  readonly samoCitanje = input(false);
  /** Domaći bez predavanja nema aktivnosti, pa kolona pokazuje `—`. */
  readonly imaPredavanje = input(true);

  /** Izmena polja reda (vidljivo odmah, čuva se posle debounce-a u store-u). */
  readonly izmena = output<IzmenaReda>();
  /** `Enter` u polju: red treba odmah sačuvati. */
  readonly sacuvajOdmah = output<number>();
  /** "Pokušaj ponovo" posle greške čuvanja. */
  readonly ponovo = output<number>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly maxBodova = MAX_BODOVA;
  protected readonly maxNapomena = MAX_NAPOMENA;
  /** Redovi u kojima je u polju bodova nešto što nije ceo broj 0-10. */
  protected readonly neispravniBodovi = signal<ReadonlySet<number>>(new Set());

  protected aktivnost(s: RedStudenta): string {
    if (!this.imaPredavanje()) {
      return '—';
    }
    return s.tip ? (AKTIVNOST_TEKST[s.tip] ?? s.tip) : 'Odsutan';
  }

  protected bodovi(s: RedStudenta): number | null {
    return this.vrednosti()[s.id]?.bodovi ?? null;
  }

  protected prepisivanje(s: RedStudenta): boolean {
    return this.vrednosti()[s.id]?.prepisivanje === true;
  }

  protected napomena(s: RedStudenta): string {
    return this.vrednosti()[s.id]?.napomene ?? '';
  }

  protected ime(s: RedStudenta): string {
    return [s.ime, s.prezime].filter(Boolean).join(' ') || '—';
  }

  protected unosBodova(s: RedStudenta, polje: HTMLInputElement): void {
    const sirovo = polje.value.trim();
    const broj = sirovo === '' ? null : Number(sirovo);
    const ispravno = !polje.validity.badInput && (broj === null || (Number.isInteger(broj) && broj >= 0 && broj <= MAX_BODOVA));
    this.neispravniBodovi.update(skup => {
      const novi = new Set(skup);
      if (ispravno) {
        novi.delete(s.id);
      } else {
        novi.add(s.id);
      }
      return novi;
    });
    if (ispravno) {
      this.izmena.emit({ studentId: s.id, izmena: { bodovi: broj } });
    }
  }

  protected unosNapomene(s: RedStudenta, polje: HTMLInputElement): void {
    this.izmena.emit({ studentId: s.id, izmena: { napomene: polje.value } });
  }

  protected unosPrepisivanja(s: RedStudenta, polje: HTMLInputElement): void {
    this.izmena.emit({ studentId: s.id, izmena: { prepisivanje: polje.checked } });
  }

  /** `Enter`: čuva red i prelazi u isto polje sledećeg reda koji ga ima. */
  protected enter(dogadjaj: Event, s: RedStudenta, polje: PoljeReda): void {
    dogadjaj.preventDefault();
    this.sacuvajOdmah.emit(s.id);
    const polja = Array.from(this.host.nativeElement.querySelectorAll<HTMLInputElement>(`input[data-polje="${polje}"]`));
    const sledece = polja[polja.indexOf(dogadjaj.target as HTMLInputElement) + 1];
    sledece?.focus();
    sledece?.select();
  }
}
