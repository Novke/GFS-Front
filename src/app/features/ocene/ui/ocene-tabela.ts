import { formatNumber } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, LOCALE_ID, signal } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

import { formatIndeks } from '../../../shared/util/indeks.pipe';
import {
  KoeficijentiInfo,
  koloneTipova,
  ocenaTekst,
  poeniZaTip,
  RezultatiStudentaInfo,
  SmerSorta,
  sortirajPoUkupnom,
} from '../data-access/ocene.models';

function jeBroj(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Tabela predloga ocena (kolone kao u starom ekranu: #, student, indeks, domaći i aktivnost razdvojeno ili
 * "Predispitne" zbirno po koeficijentima predmeta, po kolona za svaki tip testa, ukupno, ocena). Sve vrednosti su sa
 * servera; front samo sortira (po ukupnom, klik na zaglavlje menja smer). Ispod 600 px redovi su kartice. Ime vodi na
 * karticu studenta na predmetu (`/studenti/:id/predmeti/:pid`).
 */
@Component({
  selector: 'app-ocene-tabela',
  imports: [MatIcon, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tabela-okvir">
      <table class="lista-tabela ocene">
        <caption class="sr-only">Predlog ocena</caption>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Student</th>
            <th scope="col">Indeks</th>
            @if (zbirno()) {
              <th scope="col" class="broj">Predispitne</th>
            } @else {
              <th scope="col" class="broj">Domaći</th>
              <th scope="col" class="broj">Aktivnost</th>
            }
            @for (k of kolone(); track k.id) {
              <th scope="col" class="broj" [attr.data-kolona-tipa]="k.id">{{ k.naziv }}</th>
            }
            <th scope="col" class="broj" [attr.aria-sort]="smer() === 'asc' ? 'ascending' : 'descending'">
              <button type="button" class="sortiraj" data-sort="ukupno" (click)="promeniSmer()">Ukupno<span aria-hidden="true">{{ smer() === 'asc' ? '↑' : '↓' }}</span></button>
            </th>
            <th scope="col">Ocena</th>
          </tr>
        </thead>
        <tbody>
          @for (r of redovi(); track r.studentInfo?.id ?? $index; let i = $index) {
            <tr [attr.data-student]="r.studentInfo?.id">
              <td class="c-rb mono">{{ i + 1 }}</td>
              <td class="c-glavno">
                @if (r.studentInfo?.id; as sid) {
                  <a class="otvori" [routerLink]="['/studenti', sid, 'predmeti', predmetId()]">{{ imePrezime(r) }}</a>
                } @else {
                  {{ imePrezime(r) }}
                }
              </td>
              <td class="samo-desktop mono brojevi-sitno">{{ indeks(r) }}</td>
              @if (zbirno()) {
                <td class="samo-desktop broj mono" [class.nema]="!jeBroj(r.poeniPredispitne)">{{ poeniTekst(r.poeniPredispitne) }}</td>
              } @else {
                <td class="samo-desktop broj mono" [class.nema]="!jeBroj(r.poeniDomaci)">{{ poeniTekst(r.poeniDomaci) }}</td>
                <td class="samo-desktop broj mono" [class.nema]="!jeBroj(r.poeniAktivnost)">{{ poeniTekst(r.poeniAktivnost) }}</td>
              }
              @for (k of kolone(); track k.id) {
                @let p = poeni(r, k.id);
                <td class="samo-desktop broj mono" [class.nema]="p === null">{{ poeniTekst(p) }}</td>
              }
              <td class="samo-desktop broj mono" [class.nema]="!jeBroj(r.ukupno)"><strong>{{ poeniTekst(r.ukupno) }}</strong></td>
              <td class="c-st">
                @if (r.predlogOcene !== null && r.predlogOcene !== undefined && r.predlogOcene >= 6) {
                  <span class="oznaka ton-ok" data-ocena>{{ r.predlogOcene }}</span>
                } @else {
                  <span class="oznaka ton-danger" data-ocena><mat-icon svgIcon="close" aria-hidden="true" />{{ ocena(r) }}</span>
                }
              </td>
              <td class="c-meta">{{ meta(r) }}</td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: `
    :host { display: block; }
    .otvori { text-decoration: none; }
    .ocene .broj { text-align: right; }
    .ocene th.broj .sortiraj { margin-left: auto; }
    .ocene tbody tr { cursor: default; }
    @media (max-width: 599.98px) { .ocene .broj { text-align: left; } }
  `,
})
export class OceneTabela {
  private readonly locale = inject(LOCALE_ID);

  readonly rezultati = input.required<readonly RezultatiStudentaInfo[]>();
  readonly koeficijenti = input<KoeficijentiInfo | null>(null);
  readonly predmetId = input.required<number>();

  protected readonly smer = signal<SmerSorta>('desc');
  protected readonly zbirno = computed(() => this.koeficijenti()?.prikaziZbirno === true);
  protected readonly kolone = computed(() => koloneTipova(this.koeficijenti(), this.rezultati()));
  protected readonly redovi = computed(() => sortirajPoUkupnom(this.rezultati(), this.smer()));

  protected promeniSmer(): void {
    this.smer.update(s => (s === 'desc' ? 'asc' : 'desc'));
  }

  protected readonly jeBroj = jeBroj;

  /** Poeni sa jednom decimalom po `LOCALE_ID` (`6,1`); nedostaje ili nije broj: `—` (kao kolone tipova). */
  protected poeniTekst(v: number | null | undefined): string {
    return jeBroj(v) ? formatNumber(v, this.locale, '1.1-1') : '—';
  }

  protected poeni(r: RezultatiStudentaInfo, tipId: number): number | null {
    return poeniZaTip(r, tipId);
  }

  protected ocena(r: RezultatiStudentaInfo): string {
    return ocenaTekst(r.predlogOcene);
  }

  /** `Petrović Ana`; bez imena i prezimena `—`. */
  protected imePrezime(r: RezultatiStudentaInfo): string {
    const s = r.studentInfo;
    return [s?.prezime?.trim(), s?.ime?.trim()].filter(Boolean).join(' ') || '—';
  }

  protected indeks(r: RezultatiStudentaInfo): string {
    const g = r.studentInfo?.godina;
    return formatIndeks(r.studentInfo?.indeks, g && g > 0 ? g : null);
  }

  /** Red kartice na telefonu: indeks i ukupno. */
  protected meta(r: RezultatiStudentaInfo): string {
    return `${this.indeks(r)} · ukupno ${this.poeniTekst(r.ukupno)}`;
  }
}
