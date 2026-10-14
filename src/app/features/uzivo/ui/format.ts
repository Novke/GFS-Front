/** Formatiranje brojeva i kodova za prikaz uživo (srpski: decimalni zarez, hiljade razdvojene razmakom). */

const NBSP = ' ';

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

/** Kod izvođenja u dve grupe radi čitljivosti sa daljine: "123456" -> "123 456". */
export function kodSaRazmakom(kod: string): string {
  return /^\d{6}$/.test(kod) ? `${kod.slice(0, 3)} ${kod.slice(3)}` : kod;
}

/** Link za prikaz: bez `http(s)://` i bez kose crte na kraju. */
export function bezProtokola(link: string): string {
  return link.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}
