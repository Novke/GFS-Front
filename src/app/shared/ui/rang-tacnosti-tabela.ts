import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { kratakIndeks, nivoTacnosti, prikazVremena } from '../../core/api/rang.api';

/**
 * Red tabele ranga tačnosti: zajednički oblik `RangTacnostiStavka` (konzola, pregled izvođenja, predavanje, grupa) i
 * javnog reda na projektoru (bez id-jeva).
 */
export interface RangRed {
  mesto: number | null;
  studentId?: number | null;
  ucesnikId?: number | null;
  indeks?: string | null;
  ime: string;
  gost: boolean;
  tacnih: number;
  dugovanih: number;
  procenat: number | null;
  prosekMs: number | null;
  zvezdice: number;
  poeni?: number | null;
  izvodjenja?: number | null;
  casova?: number | null;
}

/** Dodatne kolone: poeni (takmičenje), prezentacije (zbir predavanja), časovi (grupa). */
export type RangKolona = 'poeni' | 'izvodjenja' | 'casova';

/** Kolona po kojoj se tabela sortira: ★ (redosled servera: ★, pa prosek), tačnost ili prosečno vreme. */
export type RangSort = 'zvezdice' | 'tacnost' | 'vreme';

/**
 * Tabela ranga tačnosti (spec `2026-10-28-rang-tacnosti-design.md`, 4, dorada 2026-10-29): mesto, indeks, ime, ★,
 * tačnost (obojena pilula i "x/y"), prosečno vreme. Podrazumevano redom servera (★, pa kraći prosek); klik na ★, ✓ ili
 * ⏱ sortira po toj koloni (ponovni klik obrće smer), a mesto ostaje mesto iz ranga. Studenti su linkovi na karticu kad
 * je `linkoviStudenata`; gost nosi oznaku "gost". Red bez mesta (student grupe bez ijednog pitanja) je prigušen i
 * uvek na dnu.
 */
@Component({
  selector: 'app-rang-tacnosti-tabela',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (stavke().length) {
      <div class="okvir">
        <table class="rang" [class.rang--zbijeno]="zbijeno()">
          <thead>
            <tr>
              <th scope="col" class="c-mesto">#</th>
              @if (imaIndekse()) { <th scope="col" class="c-indeks">Indeks</th> }
              <th scope="col" class="c-ime">Ime</th>
              @for (k of sortKolone; track k.id) {
                <th scope="col" [class]="'c-broj c-' + k.id" [attr.aria-sort]="ariaSort(k.id)">
                  <button type="button" class="sort" [class.sort--aktivno]="sort() === k.id" [title]="k.opis" (click)="sortiraj(k.id)">
                    <span aria-hidden="true" [class]="'ikona ikona-' + k.id">{{ k.ikona }}</span>
                    <span class="cdk-visually-hidden">{{ k.opis }}</span>
                    <span class="smer" aria-hidden="true">{{ sort() === k.id ? (opadajuce() ? '▼' : '▲') : '' }}</span>
                  </button>
                </th>
              }
              @for (k of kolone(); track k) {
                <th scope="col" class="c-broj">{{ naslovKolone[k] }}</th>
              }
            </tr>
          </thead>
          <tbody>
            @for (r of redovi(); track kljuc(r, $index)) {
              <tr [class.bez-mesta]="r.mesto === null" [class.istaknut]="istakniStudenta() !== null && r.studentId === istakniStudenta()">
                <td class="c-mesto mesto" [class.podijum]="r.mesto !== null && r.mesto <= 3">{{ r.mesto ?? '—' }}</td>
                @if (imaIndekse()) { <td class="c-indeks indeks">{{ indeks(r.indeks) }}</td> }
                <td class="c-ime ime">
                  @if (linkoviStudenata() && r.studentId) {
                    <a [routerLink]="['/studenti', r.studentId]">{{ r.ime }}</a>
                  } @else {
                    {{ r.ime }}
                  }
                  @if (r.gost) { <span class="gost">gost</span> }
                </td>
                <td class="c-broj c-zvezdice zvezdice">
                  @if (r.zvezdice) { <span class="zvezda" aria-hidden="true">★</span> }{{ r.zvezdice }}
                </td>
                <td class="c-broj c-tacnost">
                  @if (r.procenat !== null) {
                    <span class="pilula" [attr.data-nivo]="nivo(r.procenat)">{{ r.procenat }}%</span>
                    <span class="razlomak">{{ r.tacnih }}/{{ r.dugovanih }}</span>
                  } @else { — }
                </td>
                <td class="c-broj c-vreme">{{ vreme(r.prosekMs) }}</td>
                @for (k of kolone(); track k) {
                  <td class="c-broj">{{ r[k] ?? '—' }}</td>
                }
              </tr>
            }
          </tbody>
        </table>
      </div>
    } @else {
      <p class="prazno">{{ prazno() }}</p>
    }
  `,
  styles: `
    :host { display: block; }
    .okvir { overflow-x: auto; }
    table.rang { width: 100%; border-collapse: collapse; font-size: 15px; }
    th { padding: 6px 12px; border-bottom: 1px solid var(--line); color: var(--muted); font-size: 12px; font-weight: 600;
      text-align: left; white-space: nowrap; }
    td { padding: 9px 12px; border-bottom: 1px solid var(--line); color: var(--ink); }
    tbody tr:nth-child(even) td { background: var(--surface-2); }
    tr:last-child td { border-bottom: 0; }
    .c-mesto { width: 2.5em; text-align: right; }
    .c-indeks { width: 5.5em; }
    .c-ime { width: auto; }
    .c-broj { text-align: center; font-family: var(--font-mono); font-variant-numeric: tabular-nums; white-space: nowrap; }
    .c-zvezdice { width: 5em; }
    .c-tacnost { width: 9.5em; }
    .c-vreme { width: 6.5em; }
    th.c-broj { font-family: var(--font); }
    .mesto { color: var(--muted); font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
    .mesto.podijum { color: var(--ink); font-weight: 700; }
    .indeks { color: var(--ink-2); font-family: var(--font-mono); font-size: .93em; white-space: nowrap; }
    .ime { font-weight: 500; }
    .ime a { color: inherit; text-decoration: none; }
    .ime a:hover, .ime a:focus-visible { text-decoration: underline; }
    .zvezdice { font-weight: 700; }
    .zvezda { margin-right: 3px; color: var(--star); }
    .pilula { display: inline-block; min-width: 3.4em; padding: 1px 8px; border-radius: 999px; font-weight: 700; text-align: center; }
    .pilula[data-nivo='1'] { background: var(--tacnost-1); color: var(--tacnost-1-ink); }
    .pilula[data-nivo='2'] { background: var(--tacnost-2); color: var(--tacnost-2-ink); }
    .pilula[data-nivo='3'] { background: var(--tacnost-3); color: var(--tacnost-3-ink); }
    .pilula[data-nivo='4'] { background: var(--tacnost-4); color: var(--tacnost-4-ink); }
    .razlomak { display: inline-block; min-width: 2.6em; margin-left: 6px; color: var(--muted); font-size: 12px; text-align: left; }
    .sort { display: inline-flex; align-items: center; gap: 2px; min-height: 28px; padding: 0 6px; border: 0; border-radius: 6px;
      background: none; color: var(--muted); font: inherit; font-size: 16px; cursor: pointer; }
    .sort:hover { color: var(--ink); background: var(--surface-2); }
    .sort--aktivno { color: var(--ink); }
    .sort:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }
    .ikona-zvezdice { color: var(--star); }
    .ikona-tacnost { color: var(--ok); font-weight: 700; }
    .smer { min-width: .8em; font-size: 9px; }
    .gost { margin-left: 6px; padding: 0 6px; border: 1px solid var(--line); border-radius: 6px; color: var(--muted);
      font-size: 11px; font-weight: 400; }
    .bez-mesta td { color: var(--muted); }
    .istaknut td { background: var(--primary-soft); font-weight: 600; }
    .rang--zbijeno { font-size: 14px; }
    .rang--zbijeno th { padding: 3px 8px; }
    .rang--zbijeno td { padding: 5px 8px; }
    .rang--zbijeno .c-tacnost { width: 8.5em; }
    .prazno { margin: 0; padding: 12px 0; color: var(--muted); }
  `,
})
export class RangTacnostiTabela {
  readonly stavke = input<readonly RangRed[]>([]);
  readonly kolone = input<readonly RangKolona[]>([]);
  readonly linkoviStudenata = input(false);
  readonly zbijeno = input(false);
  readonly istakniStudenta = input<number | null>(null);
  readonly prazno = input('Još niko nije odgovarao na pitanja sa tačnim odgovorom.');

  protected readonly naslovKolone: Record<RangKolona, string> = { poeni: 'Poeni', izvodjenja: 'Prezentacije', casova: 'Časova' };
  protected readonly sortKolone: readonly { id: RangSort; ikona: string; opis: string }[] = [
    { id: 'zvezdice', ikona: '★', opis: 'Zvezdice' },
    { id: 'tacnost', ikona: '✓', opis: 'Tačnost' },
    { id: 'vreme', ikona: '⏱', opis: 'Prosečno vreme odgovora' },
  ];
  protected readonly vreme = prikazVremena;
  protected readonly nivo = nivoTacnosti;
  protected readonly indeks = kratakIndeks;

  protected readonly sort = signal<RangSort>('zvezdice');
  /** Smer izabrane kolone: ★ i tačnost podrazumevano opadajuće, vreme rastuće (najbrži prvi). */
  protected readonly opadajuce = signal(true);

  protected readonly imaIndekse = computed(() => this.stavke().some(r => !!r.indeks));

  /** Redovi u izabranom redosledu; jednaki zadržavaju redosled servera, redovi bez mesta su uvek na dnu. */
  protected readonly redovi = computed(() => {
    const sort = this.sort();
    const opad = this.opadajuce();
    const redovi = this.stavke().map((r, i) => ({ r, i }));
    if (sort === 'zvezdice' && opad) return this.stavke();
    const vrednost = (r: RangRed): number | null =>
      sort === 'zvezdice' ? r.zvezdice : sort === 'tacnost' ? r.procenat : r.prosekMs;
    return redovi.sort((a, b) => {
      if ((a.r.mesto === null) !== (b.r.mesto === null)) return a.r.mesto === null ? 1 : -1;
      const va = vrednost(a.r);
      const vb = vrednost(b.r);
      if (va === null || vb === null) return va === vb ? a.i - b.i : va === null ? 1 : -1;
      return va === vb ? a.i - b.i : (opad ? vb - va : va - vb);
    }).map(x => x.r);
  });

  protected sortiraj(k: RangSort): void {
    if (this.sort() === k) {
      this.opadajuce.update(o => !o);
    } else {
      this.sort.set(k);
      this.opadajuce.set(k !== 'vreme');
    }
  }

  protected ariaSort(k: RangSort): 'ascending' | 'descending' | null {
    return this.sort() === k ? (this.opadajuce() ? 'descending' : 'ascending') : null;
  }

  protected kljuc(r: RangRed, i: number): string {
    return r.studentId ? `s${r.studentId}` : r.ucesnikId ? `u${r.ucesnikId}` : `i${i}`;
  }
}
