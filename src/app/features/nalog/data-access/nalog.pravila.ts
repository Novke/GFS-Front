import { HttpErrorResponse } from '@angular/common/http';

import { PORUKA_SISTEM, toApiError } from '../../../core/api/api-error';
import { bezbednoNazad } from '../../../shared/util/nazad';

/*
 * Čista pravila naloga studenta (bez Angular servisa): normalizacija indeksa i koda, `nazad` javnih ruta, tekst greške za ekran.
 */

/** Indeks kao na serveru i u upisu: bez razmaka, velika slova (`gd 12` -> `GD12`). */
export function normalizujIndeks(v: string): string {
  return v.replace(/\s+/gu, '').toUpperCase();
}

/** Samo cifre, najviše 6 (`123 456`, `123-456` -> `123456`): nalepljen ili automatski popunjen kod. */
export function samoCifreKoda(v: string): string {
  return v.replace(/\D+/gu, '').slice(0, 6);
}

export const KOD = /^\d{6}$/;

/**
 * Tekst greške za baner: poruka servera (`reason`) doslovno za 4xx i za 503 (npr. "Slanje koda trenutno nije moguće. Javi se
 * nastavniku."; `toApiError` bi ga, kao svaku 5xx, sakrio), mreža i ostale 5xx opšte poruke.
 */
export function porukaGreske(e: unknown): string {
  if (!(e instanceof HttpErrorResponse)) {
    return PORUKA_SISTEM;
  }
  return (e.status === 503 ? razlogServera(e) : null) ?? toApiError(e).reason;
}

/** Neprazan `reason` iz tela greške servera, inače `null`. */
export function razlogServera(e: unknown): string | null {
  const reason = e instanceof HttpErrorResponse ? (e.error as { reason?: unknown } | null)?.reason : null;
  return typeof reason === 'string' && reason.trim() !== '' ? reason : null;
}

/** Prvi segment putanje na koju `/nalog` i `/nalog/moodle` smeju da vrate studenta: samo javne rute (`PublicLayout`). */
const JAVNI_PREFIKSI: readonly string[] = ['uzivo', 'upis', 'nalog'];

/**
 * `nazad` za javnu stranicu naloga: {@link bezbednoNazad} i još prvi segment mora biti javna ruta (`uzivo`, `upis`, `nalog`).
 * Nastavnička ruta (`predavanja/3`) se ignoriše kao da `nazad` ne postoji: student nema sesiju nastavnika, pa bi ga čuvar
 * odveo na `/prijava`. Svaki `%` ne prolazi (`uzivo%2F1`, `nalog/%2e%2e/x`, `uzivo/%2F%2Fevil`): ruter dekodira segmente, pa bi
 * kodirano `..` ili `//` zaobišlo proveru, a javne rute i inače nemaju razlog za kodirane znake.
 */
export function javnoNazad(v: string | null | undefined): string | null {
  const cilj = bezbednoNazad(v);
  if (cilj === null || cilj.includes('%')) {
    return null;
  }
  return JAVNI_PREFIKSI.includes(cilj.split(/[/?]/u, 1)[0]) ? cilj : null;
}

/** Putanja cilja bez query-ja i završne `/` (`nalog/?x=1` -> `nalog`): da li `nazad` vodi na istu stranicu. */
export function putanjaCilja(cilj: string): string {
  return cilj.split('?', 1)[0].replace(/\/+$/u, '');
}
