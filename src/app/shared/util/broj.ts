/** Brojevi za prikaz (srpski: decimalni zarez, hiljade razdvojene razmakom); deli ih `features/uzivo/ui/format` i tabela ranga. */

const NBSP = '\u00a0';

/** Celi broj sa hiljadama razdvojenim neprelomnim razmakom: 3450 -> "3 450". */
export function grupisiCifre(n: number): string {
  const znak = n < 0 ? '-' : '';
  const cifre = String(Math.trunc(Math.abs(n)));
  return znak + cifre.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

/** Broj sa najviše dve decimale i decimalnim zarezom, bez nula na kraju: 3.8 -> "3,8", 4 -> "4". */
export function decimalni(n: number): string {
  const [ceo, dec] = Math.abs(n).toFixed(2).split('.');
  const decimale = dec.replace(/0+$/, '');
  const znak = n < 0 && (Number(ceo) > 0 || decimale) ? '-' : '';
  return znak + grupisiCifre(Number(ceo)) + (decimale ? ',' + decimale : '');
}
