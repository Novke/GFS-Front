// Beleške govornika (`p:notes`) u običan tekst za polje beleški slajda. Čiste funkcije bez Angular-a.
import type { Deo, FormatBroja, Pasus } from '../data-access/platno.models';
import { oznakeListe } from '../ui/platno-tekst';
import { GRANICE } from './granice';
import { formatBroja, pocetakListe } from './tekst';
import { brojAtr, deca, dete, NS, potomak } from './xml';

const DEO_PRAZAN: Omit<Deo, 'tekst'> = {
  font: 'Carlito', velicina: 18, boja: '#000000', podebljano: false, kurziv: false, podvuceno: false, precrtano: false, polozaj: 'OBICAN',
};

function jeTelo(sp: Element): boolean {
  const ph = potomak(dete(sp, NS.p, 'nvSpPr') ?? sp, NS.p, 'ph');
  return ph?.getAttribute('type') === 'body';
}

/** Tekst pasusa: `a:r` i `a:fld` daju `a:t`, `a:br` je novi red; ostalo (`a:pPr`, `a:endParaRPr`) se preskače. */
function tekstPasusa(p: Element): string {
  let s = '';
  for (const d of Array.from(p.children)) {
    if (d.namespaceURI !== NS.a) continue;
    if (d.localName === 'br') s += '\n';
    else if (d.localName === 'r' || d.localName === 'fld') s += dete(d, NS.a, 't')?.textContent ?? '';
  }
  return s;
}

/** Pasus platna samo za brojanje oznaka: numeracija i nivo iz `a:pPr`, jedan deo sa tekstom (prazan pasus nema oznaku). */
function zaOznake(p: Element, tekst: string): Pasus {
  const pPr = dete(p, NS.a, 'pPr');
  const nivo = Math.min(8, Math.max(0, Math.trunc(brojAtr(pPr, 'lvl', 0))));
  const num = pPr ? dete(pPr, NS.a, 'buAutoNum') : null;
  let lista: Pasus['lista'] = null;
  if (num) {
    const format: FormatBroja = formatBroja(num.getAttribute('type') ?? '').format;
    lista = { vrsta: 'BROJ', znak: null, boja: null, format, pocetak: pocetakListe(brojAtr(num, 'startAt', 1)) };
  } else if (pPr && dete(pPr, NS.a, 'buChar')) {
    lista = { vrsta: 'ZNAK', znak: '•', boja: null, format: null, pocetak: null };
  }
  return {
    poravnanje: 'LEVO', nivo, lista, uvlacenje: { levo: 0, prviRed: 0 }, razmakPre: 0, razmakPosle: 0, proredProcenat: 100,
    tabulatori: [], delovi: [{ ...DEO_PRAZAN, tekst }],
  };
}

/**
 * Beleške slajda: pasusi telesa (`p:ph type="body"`) spojeni sa `\n`, numerisane i označene liste sa prefiksom (brojanje je
 * `oznakeListe` kao u prikazu), prazni pasusi na kraju se brišu. Duže od 20 000 znakova (code point-a) se skraćuje
 * (`skraceno`; pozivalac dodaje `BELESKE_SKRACENE`). Nema beleški ili su prazne -> `tekst: null`.
 */
export function pretvoriBeleske(doc: Document | null): { tekst: string | null; skraceno: boolean } {
  const koren = doc?.documentElement;
  const sp = koren ? Array.from(koren.getElementsByTagNameNS(NS.p, 'sp')).find(jeTelo) : undefined;
  const txBody = sp ? dete(sp, NS.p, 'txBody') : null;
  if (!txBody) return { tekst: null, skraceno: false };
  const elementi = deca(txBody, NS.a, 'p');
  // pasus samo od razmaka i prelomaka je prazan (kao `prazanUNull` na serveru): bez oznake liste i briše se sa kraja
  const tekstovi = elementi.map(tekstPasusa).map((t) => (t.trim() === '' ? '' : t));
  const oznake = oznakeListe(elementi.map((p, i) => zaOznake(p, tekstovi[i])));
  const redovi = tekstovi.map((t, i) => (t === '' ? '' : `${oznake[i] ? `${oznake[i]} ` : ''}${t}`));
  while (redovi.length > 0 && redovi[redovi.length - 1] === '') redovi.pop();
  const tekst = redovi.join('\n');
  if (tekst === '') return { tekst: null, skraceno: false };
  const znaci = Array.from(tekst);
  if (znaci.length <= GRANICE.beleske) return { tekst, skraceno: false };
  return { tekst: znaci.slice(0, GRANICE.beleske).join(''), skraceno: true };
}
