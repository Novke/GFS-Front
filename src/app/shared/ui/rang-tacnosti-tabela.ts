import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { prikazVremena } from '../../core/api/rang.api';

/**
 * Red tabele ranga tačnosti: zajednički oblik `RangTacnostiStavka` (konzola, pregled izvođenja, predavanje, grupa) i
 * javnog reda na projektoru (bez id-jeva).
 */
export interface RangRed {
  mesto: number | null;
  studentId?: number | null;
  ucesnikId?: number | null;
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

/** Dodatne kolone: poeni (takmičenje), izvođenja (zbir predavanja), časovi (grupa). */
export type RangKolona = 'poeni' | 'izvodjenja' | 'casova';

/**
 * Tabela ranga tačnosti (spec `2026-10-28-rang-tacnosti-design.md`, 4): mesto, ime, tačnost (procenat i "x/y"),
 * prosečno vreme, ★. Studenti su linkovi na karticu kad je `linkoviStudenata`; gost nosi oznaku "gost". Red bez mesta
 * (student grupe bez ijednog pitanja) je prigušen, sa crticom.
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
              <th scope="col" class="br">#</th>
              <th scope="col">Ime</th>
              <th scope="col" class="br">Tačnost</th>
              <th scope="col" class="br">Prosek</th>
              <th scope="col" class="br"><span aria-hidden="true">★</span><span class="cdk-visually-hidden">Zvezdice</span></th>
              @for (k of kolone(); track k) {
                <th scope="col" class="br">{{ naslovKolone[k] }}</th>
              }
            </tr>
          </thead>
          <tbody>
            @for (r of stavke(); track kljuc(r, $index)) {
              <tr [class.bez-mesta]="r.mesto === null" [class.istaknut]="istakniStudenta() !== null && r.studentId === istakniStudenta()">
                <td class="br mesto">{{ r.mesto ?? '—' }}</td>
                <td class="ime">
                  @if (linkoviStudenata() && r.studentId) {
                    <a [routerLink]="['/studenti', r.studentId]">{{ r.ime }}</a>
                  } @else {
                    {{ r.ime }}
                  }
                  @if (r.gost) { <span class="gost">gost</span> }
                </td>
                <td class="br">
                  @if (r.procenat !== null) {
                    <strong>{{ r.procenat }}%</strong> <span class="razlomak">{{ r.tacnih }}/{{ r.dugovanih }}</span>
                  } @else { — }
                </td>
                <td class="br">{{ vreme(r.prosekMs) }}</td>
                <td class="br zvezdice">{{ r.zvezdice }}</td>
                @for (k of kolone(); track k) {
                  <td class="br">{{ r[k] ?? '—' }}</td>
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
    table.rang { width: 100%; border-collapse: collapse; font-size: 14px; }
    th { padding: 8px 10px; border-bottom: 1px solid var(--line); color: var(--muted); font-size: 12px; font-weight: 600;
      text-align: left; white-space: nowrap; }
    td { padding: 8px 10px; border-bottom: 1px solid var(--line); color: var(--ink); }
    tr:last-child td { border-bottom: 0; }
    .br { text-align: right; font-family: var(--font-mono); font-variant-numeric: tabular-nums; white-space: nowrap; }
    th.br { font-family: var(--font); }
    .mesto { color: var(--muted); width: 3em; }
    .ime { width: 100%; }
    .ime a { color: inherit; text-decoration: none; }
    .ime a:hover, .ime a:focus-visible { text-decoration: underline; }
    .razlomak { margin-left: 6px; color: var(--muted); font-size: 12px; }
    .zvezdice { color: var(--ink); }
    .gost { margin-left: 6px; padding: 0 6px; border: 1px solid var(--line); border-radius: 6px; color: var(--muted);
      font-family: var(--font); font-size: 11px; }
    .bez-mesta td { color: var(--muted); }
    .istaknut td { background: var(--primary-soft); font-weight: 600; }
    .rang--zbijeno th, .rang--zbijeno td { padding: 5px 8px; font-size: 13px; }
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

  protected readonly naslovKolone: Record<RangKolona, string> = { poeni: 'Poeni', izvodjenja: 'Izvođenja', casova: 'Časova' };
  protected readonly vreme = prikazVremena;

  protected kljuc(r: RangRed, i: number): string {
    return r.studentId ? `s${r.studentId}` : r.ucesnikId ? `u${r.ucesnikId}` : `i${i}`;
  }
}
