// PRIVREMENO (do Task 18-24): veza novog stabla ruta sa starim ekranima. Svaki ekran-zadatak briše ono što zameni;
// kad nestane poslednji stari ekran, briše se ceo direktorijum `features/privremeno/`.
import { HttpClient, HttpContext } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CanMatchFn, RouterLink } from '@angular/router';
import { catchError, map, Observable, of } from 'rxjs';

import { LOCAL_ERRORS } from '../../core/api/api-error';
import { API_URL } from '../../core/api/api-url';
import { JE_ID } from '../../core/route-matchers';

/**
 * Stari ekrani liste rade za jedan par grupa+predmet: sa `?grupa=&predmet=` ide stara lista, bez njih stari
 * izbor grupe i predmeta (koji posle izbora navigira na listu sa tim parametrima).
 */
export const imaGrupuIPredmet: CanMatchFn = (_route, _segmenti, snimak) =>
  JE_ID.test(String(snimak.queryParams['grupa'] ?? '')) && JE_ID.test(String(snimak.queryParams['predmet'] ?? ''));

/**
 * Bira staru stranicu pregleda za `/x/:id` (stavlja se na rutu pregleda, ispred rute beleženja/evidentiranja):
 * `?prikaz=pregled` -> pregled; drugi `prikaz` -> ne; bez njega po stanju (završeno/pregledan), kao nova stranica
 * detalja. Zahtev stanja je tih (`LOCAL_ERRORS`): ako ne uspe, otvara se beleženje i ono samo prikazuje grešku.
 */
export function prikazPregleda(putanjaApi: string, zavrseno: (dto: Record<string, unknown>) => boolean): CanMatchFn {
  return (_route, segmenti, snimak): boolean | Observable<boolean> => {
    const prikaz: unknown = snimak.queryParams['prikaz'];
    if (prikaz === 'pregled') {
      return true;
    }
    if (prikaz) {
      return false;
    }
    const id = segmenti[0]?.path;
    if (!id || !JE_ID.test(id)) {
      return false;
    }
    return inject(HttpClient)
      .get<Record<string, unknown>>(`${API_URL}/${putanjaApi}/${id}`, { context: new HttpContext().set(LOCAL_ERRORS, true) })
      .pipe(
        map(dto => !!dto && zavrseno(dto)),
        catchError(() => of(false)),
      );
  };
}

export const domaciPregledan = prikazPregleda('domaci', d => d['pregledan'] === true);
export const testPregledan = prikazPregleda('test', d => d['pregledan'] === true);

/** Ruta iz novog stabla čiji ekran još ne postoji (pravi ga kasniji zadatak). */
@Component({
  selector: 'app-uskoro',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="uskoro">
      <h1>Ovaj ekran stiže uskoro</h1>
      <p>Deo je novog izgleda koji je u izradi.</p>
      <a routerLink="/">Na početnu</a>
    </section>
  `,
  styles: `.uskoro { max-width: 520px; margin: 48px auto; text-align: center; } p { color: var(--ink-2); }`,
})
export class Uskoro {}
