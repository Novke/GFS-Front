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

/** Broj u pozicionom zapisu bez eksponenta, iz najkraćeg zapisa koji vraća `String`: 1e-7 -> "0.0000001", 1.5e21 -> "1500000000000000000000". */
function pozicioni(n: number): string {
  const tekst = String(n);
  const m = /^(\d)(?:\.(\d+))?e([+-]\d+)$/.exec(tekst);
  if (!m) return tekst;
  const cifre = m[1] + (m[2] ?? '');
  const eksp = Number(m[3]);
  return eksp >= 0
    ? cifre + '0'.repeat(Math.max(0, eksp + 1 - cifre.length)) + (cifre.length > eksp + 1 ? '.' + cifre.slice(eksp + 1) : '')
    : '0.' + '0'.repeat(-eksp - 1) + cifre;
}

/**
 * Broj sa svim decimalama (najkraći zapis koji se vraća u isti broj), decimalnim zarezom i hiljadama razdvojenim razmakom:
 * 0.0625 -> "0,0625", 1234.5678 -> "1 234,5678". Za tačne odgovore, koje ne sme da zaokruži `decimalni` (BROJ polje banke nema
 * ograničenje decimala, pa bi 0,0625 postalo "0,06"). Nije broj (NaN, beskonačno) daje prazan tekst.
 */
export function tacanBroj(n: number): string {
  if (!Number.isFinite(n)) return '';
  const [ceo, dec] = pozicioni(Math.abs(n)).split('.');
  const znak = n < 0 ? '-' : '';
  return znak + ceo.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP) + (dec ? ',' + dec : '');
}

/** Kod izvođenja u dve grupe radi čitljivosti sa daljine: "123456" -> "123 456". */
export function kodSaRazmakom(kod: string): string {
  return /^\d{6}$/.test(kod) ? `${kod.slice(0, 3)} ${kod.slice(3)}` : kod;
}

/** Link za prikaz: bez `http(s)://` i bez kose crte na kraju. */
export function bezProtokola(link: string): string {
  return link.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}
