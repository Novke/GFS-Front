/*
 * Parametar `nazad` (`/prijava?nazad=…`, `/nalog?nazad=…`): kuda posle prijave. Dolazi iz URL-a, pa ga bilo ko može
 * podmetnuti (link u mejlu, QR): sme biti samo relativna putanja **unutar aplikacije**, nikad spoljni ili apsolutni URL
 * (`//evil.com`, `https://x`, `/\evil`, `javascript:`). Spec prijave 5.1 tačka 6. Bez uvoza: koriste ga i javne rute.
 */

/** Dozvoljeni znaci (query sme zbog filtera lista, npr. `predavanja?grupa=1`); prvi znak slovo ili cifra. */
const DOZVOLJENO = /^[A-Za-z0-9][A-Za-z0-9/_.?=&%-]*$/;

/** Isti skup bez sidra, za kodiranje: sve van njega se kodira kao `%XX`. */
const VAN_SKUPA = /[^A-Za-z0-9/_.?=&%-]/gu;

/**
 * `v` ako je bezbedna relativna putanja aplikacije (uzorak {@link DOZVOLJENO}, bez `//`, `..`, `:` i `\`), inače `null`.
 * Rezultat ide u `router.navigateByUrl`, koji ga tumači od korena aplikacije (`<base href>`).
 */
export function bezbednoNazad(v: string | null | undefined): string | null {
  if (typeof v !== 'string' || !DOZVOLJENO.test(v) || v.includes('//') || v.includes('..') || v.includes(':') || v.includes('\\')) {
    return null;
  }
  return v;
}

/**
 * Vrednost `nazad` za trenutni URL rutera (`/predavanja?grupa=1` -> `predavanja?grupa=1`): bez vodeće `/` i bez fragmenta,
 * a znaci koje {@link bezbednoNazad} ne pušta (zarez iz sorta `datum,desc`, `:`, `@`, ...) se kodiraju, pa ih ruter posle
 * prijave dekodira nazad. `null` za početnu i za putanju koju ni tada ne bi pustio (npr. `a/../b`).
 */
export function nazadIzUrla(url: string): string | null {
  const bezFragmenta = url.split('#', 1)[0];
  const bezKose = bezFragmenta.startsWith('/') ? bezFragmenta.slice(1) : bezFragmenta;
  const kodirano = bezKose.replace(VAN_SKUPA, z => encodeURIComponent(z));
  return bezbednoNazad(kodirano);
}
