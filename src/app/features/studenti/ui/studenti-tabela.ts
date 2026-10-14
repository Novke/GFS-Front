import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { StudentListItem } from '../../../core/api/studenti.api';
import { formatIndeks } from '../../../shared/util/indeks.pipe';
import { mailtoHref, punoIme, telHref } from '../data-access/studenti.models';

/** Kolone koje ruta može da zaključa (hub grupe zaključava `grupa`). */
export type ZakljucanaKolonaStudenata = 'grupa';

/** Polja po kojima se tabela sortira (zaglavlje); isto što backend prihvata. */
export type PoljeSortaStudenata = 'prezime' | 'indeks' | 'godina';

/**
 * Tabela studenata (spec 5: ime, indeks, grupa, godina upisa, email, telefon); ispod 600 px redovi su kartice. Klik na
 * red ili na ime emituje `otvori(id)`. Student bez emaila, telefona, godine ili grupe prikazuje `—` (bez `mailto:` i
 * `tel:` linka). Email i telefon su linkovi koji ne otvaraju profil.
 */
@Component({
  selector: 'app-studenti-tabela',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tabela-okvir">
      <table class="lista-tabela">
        <caption class="sr-only">Studenti</caption>
        <thead>
          <tr>
            <th scope="col" [attr.aria-sort]="ariaSort('prezime')">
              <button type="button" class="sortiraj" data-sort="prezime" (click)="sortiraj('prezime')">Student<span aria-hidden="true">{{ strelica('prezime') }}</span></button>
            </th>
            <th scope="col" [attr.aria-sort]="ariaSort('indeks')">
              <button type="button" class="sortiraj" data-sort="indeks" (click)="sortiraj('indeks')">Indeks<span aria-hidden="true">{{ strelica('indeks') }}</span></button>
            </th>
            @if (prikazGrupe()) {
              <th scope="col">Grupa</th>
            }
            <th scope="col" [attr.aria-sort]="ariaSort('godina')">
              <button type="button" class="sortiraj" data-sort="godina" (click)="sortiraj('godina')">Godina upisa<span aria-hidden="true">{{ strelica('godina') }}</span></button>
            </th>
            <th scope="col">Email</th>
            <th scope="col">Telefon</th>
          </tr>
        </thead>
        <tbody>
          @for (s of stavke(); track s.id) {
            <tr (click)="otvori.emit(s.id)" [attr.data-student]="s.id">
              <td class="c-glavno">
                <a class="otvori" [routerLink]="['/studenti', s.id]" (click)="$event.stopPropagation()">{{ prezimeIme(s) }}</a>
              </td>
              <td class="samo-desktop mono brojevi-sitno">{{ indeks(s) }}</td>
              @if (prikazGrupe()) {
                <td class="samo-desktop brojevi-sitno" [class.nema]="!s.grupa">{{ s.grupa?.naziv ?? '—' }}</td>
              }
              <td class="samo-desktop mono brojevi-sitno" [class.nema]="s.godina === null">{{ s.godina ?? '—' }}</td>
              <td class="samo-desktop" [class.nema]="!mail(s)">
                @if (mail(s); as href) {
                  <a class="veza" [href]="href" data-mail (click)="$event.stopPropagation()">{{ s.email }}</a>
                } @else {
                  —
                }
              </td>
              <td class="samo-desktop brojevi-sitno" [class.nema]="!tel(s)">
                @if (tel(s); as href) {
                  <a class="veza" [href]="href" data-tel (click)="$event.stopPropagation()">{{ s.brojTelefona }}</a>
                } @else {
                  —
                }
              </td>
              <td class="c-meta">{{ meta(s) }}</td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: `
    :host { display: block; }
    .otvori { text-decoration: none; }
    .veza { color: var(--primary); text-decoration: none; }
    .veza:hover { text-decoration: underline; }
  `,
})
export class StudentiTabela {
  readonly stavke = input.required<readonly StudentListItem[]>();
  readonly zakljucano = input<readonly ZakljucanaKolonaStudenata[]>([]);
  /** Aktivni sort `polje,(asc|desc)`; `null` = zaglavlja bez oznake. */
  readonly sort = input<string | null>(null);
  readonly otvori = output<number>();
  /** Novi sort (`polje,(asc|desc)`) posle klika na zaglavlje. */
  readonly sortChange = output<string>();

  protected readonly prikazGrupe = computed(() => !this.zakljucano().includes('grupa'));
  private readonly aktivan = computed(() => /^([a-z]+),(asc|desc)$/.exec(this.sort() ?? ''));

  protected ariaSort(polje: PoljeSortaStudenata): 'ascending' | 'descending' | 'none' {
    const a = this.aktivan();
    return a?.[1] === polje ? (a[2] === 'asc' ? 'ascending' : 'descending') : 'none';
  }

  protected strelica(polje: PoljeSortaStudenata): string {
    const s = this.ariaSort(polje);
    return s === 'ascending' ? '↑' : s === 'descending' ? '↓' : '';
  }

  /** Isto polje menja smer; novo polje kreće od A-Z (rastuće). */
  protected sortiraj(polje: PoljeSortaStudenata): void {
    this.sortChange.emit(`${polje},${this.ariaSort(polje) === 'ascending' ? 'desc' : 'asc'}`);
  }

  /** `Radić Ana` (tabela je sortirana po prezimenu). */
  protected prezimeIme(s: StudentListItem): string {
    return punoIme({ ime: s.prezime, prezime: s.ime });
  }

  protected indeks(s: StudentListItem): string {
    return formatIndeks(s.indeks, s.godina);
  }

  protected mail(s: StudentListItem): string | null {
    return mailtoHref(s.email);
  }

  protected tel(s: StudentListItem): string | null {
    return telHref(s.brojTelefona);
  }

  /** Red kartice na telefonu: `GD12/2025 · GD-2025 · ana@gf.uns.ac.rs · 064 123 456`. */
  protected meta(s: StudentListItem): string {
    const delovi = [this.indeks(s)];
    if (this.prikazGrupe()) {
      delovi.push(s.grupa?.naziv ?? 'bez grupe');
    }
    if (s.email?.trim()) {
      delovi.push(s.email.trim());
    }
    if (s.brojTelefona?.trim()) {
      delovi.push(s.brojTelefona.trim());
    }
    return delovi.join(' · ');
  }
}
