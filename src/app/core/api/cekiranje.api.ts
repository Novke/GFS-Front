import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { LOCAL_ERRORS } from './api-error';
import { API_URL } from './api-url';

/** Jedan čekiran student (`CekiranStudent`), za panel "Čekirani" na stranici predavanja. */
export interface CekiranStudent {
  studentId: number;
  ime: string;
  prezime: string;
  indeks: string;
  /** Lokalno vreme čekiranja (`yyyy-MM-ddTHH:mm:ss[.SSSSSS]`). */
  vreme: string;
  /** Čekiran više od 15 minuta posle prvog čekiranja na tom predavanju. */
  kasnio: boolean;
  /** Prvi student čekiran istim telefonom (`null` = niko pre njega). */
  istiTelefonKao: number | null;
}

/** `GET predavanja/{id}/cekiranje` (samo nastavnik). Tajna nikad ne dolazi do fronta, samo token trenutnog prozora. */
export interface CekiranjeInfo {
  /** `<predavanjeId>.<22 znaka>`, menja se na 10 s; `null` kad predavanje nije živo. */
  token: string | null;
  vaziDoMs: number | null;
  serverVremeMs: number;
  /** Datum predavanja nije današnji: projektor pita "Da li si hteo novo predavanje?". */
  datumNijeDanas: boolean;
  cekirani: CekiranStudent[];
}

/** Adresa iz QR-a za čekiranje (javna ruta `nalog/cas/:token`), relativno na `<base href>`. Deli je i Uživo. */
export function linkCekiranja(token: string, baseUri: string = document.baseURI): string {
  return new URL('nalog/cas/' + token, baseUri).href;
}

const tiho = new HttpContext().set(LOCAL_ERRORS, true);

/** Deli ga projektor predavanja, stranica predavanja i Uživo (QR na tabli): zato je u `core`, ne u feature-u. */
@Injectable({ providedIn: 'root' })
export class CekiranjeApi {
  private readonly http = inject(HttpClient);

  /** Uvek tiho: poziva se na 3-5 s, pa greška ne sme da puni snackbar. */
  info(predavanjeId: number): Observable<CekiranjeInfo> {
    return this.http.get<CekiranjeInfo>(`${API_URL}/predavanja/${predavanjeId}/cekiranje`, { context: tiho });
  }
}
