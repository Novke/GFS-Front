/**
 * Putanja zahteva posle `api/` (u odnosu na `<base href>`), ili `null` kad zahtev nije ka backendu (npr. `assets/`).
 * `api/studenti/1` -> `studenti/1`; `api/public/upis/x` -> `public/upis/x`.
 */
export function putanjaApija(url: string): string | null {
  const baza = new URL(document.baseURI).pathname;
  const putanja = new URL(url, document.baseURI).pathname;
  const prefiks = `${baza}api/`;
  return putanja.startsWith(prefiks) ? putanja.slice(prefiks.length) : null;
}

/** Nastavnički API: sve pod `api/` osim `api/public/*` (javno, student na telefonu). Bez sesije server tu vraća 401. */
export function jeNastavnickiApi(url: string): boolean {
  const p = putanjaApija(url);
  return p !== null && p !== 'public' && !p.startsWith('public/');
}

/**
 * 401 na ovom zahtevu znači "sesija nastavnika je istekla ili je opozvana": nastavnički API osim `auth/prijava` (pogrešna
 * lozinka, prikazuje je forma), `auth/ja` (provera sesije, obrađuju je čuvar i `SesijaStore`) i `auth/odjava` (401 tu znači
 * da sesije već nema, što je za odjavu uspeh; meni korisnika sam vodi na `/prijava`, bez `nazad`).
 */
export function jeIstekSesije(url: string): boolean {
  if (!jeNastavnickiApi(url)) {
    return false;
  }
  const p = putanjaApija(url);
  return p !== 'auth/prijava' && p !== 'auth/ja' && p !== 'auth/odjava';
}
