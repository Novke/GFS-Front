import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { StatusChip } from '../../../shared/ui/status-chip';
import { DatumPipe, formatDatum } from '../../../shared/util/datum.pipe';
import { formatBroja } from '../data-access/test.store';
import { TestListItem } from '../data-access/testovi.models';

/** Kolone koje ruta može da zaključa (hub grupe zaključava `grupa`, hub predmeta `predmet`). */
export type ZakljucanaKolona = 'predmet' | 'grupa';

/** Polja po kojima se tabela sortira (zaglavlje); isto što backend prihvata. */
export type PoljeSorta = 'datum' | 'maxPoena';

/** `1 ispitanik`, `2 ispitanika`, `5 ispitanika`, `21 ispitanik`, `11 ispitanika`. */
export function brojIspitanika(n: number): string {
  return `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'ispitanik' : 'ispitanika'}`;
}

/** `1 polaganje`, `2 polaganja`, `5 polaganja`, `21 polaganje`. */
export function brojPolaganja(n: number): string {
  return `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'polaganje' : 'polaganja'}`;
}

/** Prosek uz max: `18,5 / 30`; bez proseka `—`. */
export function prosekPrikaz(t: Pick<TestListItem, 'prosek' | 'maxPoena'>): string {
  if (t.prosek === null || t.prosek === undefined) {
    return '—';
  }
  return t.maxPoena ? `${formatBroja(t.prosek)} / ${t.maxPoena}` : formatBroja(t.prosek);
}

export function prolazPrikaz(t: Pick<TestListItem, 'procenatProlaznosti'>): string {
  const p = t.procenatProlaznosti;
  return p === null || p === undefined || !Number.isFinite(p) ? '—' : `${Math.round(p)} %`;
}

/**
 * Tabela testova (spec 5: tip, datum, predmet, grupa, broj ispitanika, prosek, prolaz %, evidentiran); ispod 600 px
 * redovi su kartice. Koriste je lista testova i hubovi grupe i predmeta (`zakljucano` kolone se ne prikazuju).
 * Klik ili Enter na tip (ili klik na red) emituje `otvori(id)`.
 */
@Component({
  selector: 'app-testovi-tabela',
  imports: [DatumPipe, StatusChip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tabela-okvir">
      <table class="lista-tabela testovi">
        <caption class="sr-only">Testovi</caption>
        <thead>
          <tr>
            <th scope="col">Tip</th>
            <th scope="col" [attr.aria-sort]="ariaSort('datum')">
              <button type="button" class="sortiraj" data-sort="datum" (click)="sortiraj('datum')">Datum<span aria-hidden="true">{{ strelica('datum') }}</span></button>
            </th>
            @if (prikazPredmeta()) {
              <th scope="col">Predmet</th>
            }
            @if (prikazGrupe()) {
              <th scope="col">Grupa</th>
            }
            <th scope="col" class="broj">Ispitanika</th>
            <th scope="col" class="broj" [attr.aria-sort]="ariaSort('maxPoena')">
              <button type="button" class="sortiraj" data-sort="maxPoena" (click)="sortiraj('maxPoena')">Prosek / max<span aria-hidden="true">{{ strelica('maxPoena') }}</span></button>
            </th>
            <th scope="col" class="broj">Prolaz</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          @for (t of stavke(); track t.id) {
            <tr (click)="otvori.emit(t.id)">
              <td class="c-glavno">
                <button type="button" class="otvori" (click)="$event.stopPropagation(); otvori.emit(t.id)">{{ naziv(t) }}</button>
              </td>
              <td class="samo-desktop mono brojevi-sitno">{{ t.datum | datum }}</td>
              @if (prikazPredmeta()) {
                <td class="samo-desktop">{{ t.predmet?.naziv || '—' }}</td>
              }
              @if (prikazGrupe()) {
                <td class="samo-desktop brojevi-sitno" [class.nema]="!t.grupa">{{ t.grupa?.naziv || '—' }}</td>
              }
              <td class="samo-desktop mono broj">{{ t.brojPolaganja ?? 0 }}</td>
              <td class="samo-desktop mono broj brojevi-sitno">{{ prosek(t) }}</td>
              <td class="samo-desktop mono broj">{{ prolaz(t) }}</td>
              <td class="c-st">
                @if (t.pregledan === true) {
                  <app-status-chip tekst="Evidentiran" ton="ok" />
                } @else {
                  <app-status-chip tekst="Za evidentiranje" ton="warn" />
                }
              </td>
              <td class="c-meta">{{ meta(t) }}</td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: `
    :host { display: block; }
    .broj { text-align: right; }
    th.broj .sortiraj { margin-left: auto; }
    @media (max-width: 599.98px) {
      table.lista-tabela.testovi tr { grid-template-columns: 1fr auto; }
      table.lista-tabela.testovi .c-glavno { grid-column: 1; }
      table.lista-tabela.testovi .c-st { grid-column: 2; }
      table.lista-tabela.testovi .c-meta { grid-column: 1 / 3; }
    }
  `,
})
export class TestoviTabela {
  readonly stavke = input.required<readonly TestListItem[]>();
  readonly zakljucano = input<readonly ZakljucanaKolona[]>([]);
  /** Aktivni sort `polje,(asc|desc)`; `null` = zaglavlja bez oznake. */
  readonly sort = input<string | null>(null);
  /** Pun datum (sa godinom) u kartici na telefonu, kad lista prikazuje više školskih godina. */
  readonly punDatum = input(false);
  readonly otvori = output<number>();
  readonly sortChange = output<string>();

  protected readonly prikazPredmeta = computed(() => !this.zakljucano().includes('predmet'));
  protected readonly prikazGrupe = computed(() => !this.zakljucano().includes('grupa'));
  private readonly aktivan = computed(() => /^([A-Za-z]+),(asc|desc)$/.exec(this.sort() ?? ''));

  protected ariaSort(polje: PoljeSorta): 'ascending' | 'descending' | 'none' {
    const a = this.aktivan();
    return a?.[1] === polje ? (a[2] === 'asc' ? 'ascending' : 'descending') : 'none';
  }

  protected strelica(polje: PoljeSorta): string {
    const s = this.ariaSort(polje);
    return s === 'ascending' ? '↑' : s === 'descending' ? '↓' : '';
  }

  /** Isto polje menja smer; novo polje kreće od najvećeg (najnoviji datum, najviše poena). */
  protected sortiraj(polje: PoljeSorta): void {
    const s = this.ariaSort(polje);
    this.sortChange.emit(`${polje},${s === 'descending' ? 'asc' : 'desc'}`);
  }

  protected naziv(t: TestListItem): string {
    return t.tipTesta?.naziv?.trim() || 'Test';
  }

  protected prosek(t: TestListItem): string {
    return prosekPrikaz(t);
  }

  protected prolaz(t: TestListItem): string {
    return prolazPrikaz(t);
  }

  /** Red kartice na telefonu: `16. 10. · UPR · GD-2025 · 12 ispitanika · prosek 18,5 / 30`. */
  protected meta(t: TestListItem): string {
    const delovi = [formatDatum(t.datum, this.punDatum() ? 'pun' : 'kratko')];
    if (this.prikazPredmeta()) {
      delovi.push(t.predmet?.naziv || '—');
    }
    if (this.prikazGrupe()) {
      delovi.push(t.grupa?.naziv || '—');
    }
    delovi.push(brojIspitanika(t.brojPolaganja ?? 0));
    if (t.prosek !== null && t.prosek !== undefined) {
      delovi.push(`prosek ${prosekPrikaz(t)}`);
    }
    return delovi.join(' · ');
  }
}
