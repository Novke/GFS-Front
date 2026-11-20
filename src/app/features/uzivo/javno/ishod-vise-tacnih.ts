/**
 * Ishod pitanja sa više tačnih na telefonu posle "Tačno" (spec delimično tačno, maketa deo 2): čiste funkcije za
 * `app-ishod-ekran`. Sve je u lenjom chunk-u tog ekrana (budžet studentske stranice, `e2e/lenji-formule.spec.ts`).
 */

/** Stanje opcije u ishodu: tačna i izabrana, tačna a neizabrana, izabrana a netačna, ni jedno ni drugo. */
export type StanjeOpcije = 'pogodjena' | 'propustena' | 'pogresna' | 'ostala';

/** Stanje svake opcije, redom kao `opcije`. */
export function stanjaOpcija(
  opcije: readonly { id: number }[], tacne: readonly number[], izabrane: readonly number[],
): StanjeOpcije[] {
  return opcije.map(({ id }) => {
    const izabrana = izabrane.includes(id);
    if (tacne.includes(id)) return izabrana ? 'pogodjena' : 'propustena';
    return izabrana ? 'pogresna' : 'ostala';
  });
}

/** Redosled na spisku (maketa): pogođene, pa pogrešne, pa propuštene, pa ostale; u istom stanju redom opcija. */
export const RED_STANJA: Readonly<Record<StanjeOpcije, number>> = { pogodjena: 0, pogresna: 1, propustena: 2, ostala: 3 };

/** Red ispod opcije; ostale opcije nemaju red. */
export const OZNAKE_STANJA: Readonly<Record<StanjeOpcije, string | null>> = {
  pogodjena: '✓ Tvoj izbor, tačno',
  propustena: '○ I ovo je tačno, nisi zaokružio',
  pogresna: '✗ Tvoj izbor, nije tačno',
  ostala: null,
};

/** Naslov po udelu (0-1): pun udeo "Tačno!", deo "Delimično tačno", nula "Netačno". */
export function naslovUdela(udeo: number): 'Tačno!' | 'Delimično tačno' | 'Netačno' {
  return udeo >= 1 ? 'Tačno!' : udeo > 0 ? 'Delimično tačno' : 'Netačno';
}

/** "tačna" uz 2-4, "tačnog" uz 1 (21, 31, ...), inače "tačnih". */
function tacnihUz(n: number): string {
  const d = n % 10;
  const s = n % 100;
  if (d === 1 && s !== 11) return 'tačnog';
  return d >= 2 && d <= 4 && (s < 12 || s > 14) ? 'tačna' : 'tačnih';
}

/** Objašnjenje ispod naslova: koliko tačnih je pogođeno i da li pogrešan izbor poništava tačan. */
export function opisUdela(tacne: readonly number[], izabrane: readonly number[]): string {
  const pogodjeno = tacne.filter(id => izabrane.includes(id)).length;
  const pogresno = izabrane.filter(id => !tacne.includes(id)).length;
  if (!pogodjeno) return 'Nisi pogodio nijedan tačan.';
  if (!pogresno && pogodjeno === tacne.length) return 'Svi tačni odgovori.';
  const osnova = `Pogodio si ${pogodjeno} od ${tacne.length} ${tacnihUz(tacne.length)}`;
  if (!pogresno) return osnova + '.';
  return osnova + (pogresno > 1 ? ', ali svaki pogrešan izbor poništava jedan tačan.' : ', ali pogrešan izbor poništava jedan tačan.');
}
