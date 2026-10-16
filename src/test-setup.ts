import { TestBed } from '@angular/core/testing';
import { UCITAJ_FORMULE, UCITAJ_STIL_FORMULA, resetujUcitavanjeFormula } from './app/features/uzivo/ui/formula-ucitavanje';
import { UCITAJ_STIL_TEKSTA_FORMULE, resetujStilTekstaFormule } from './app/features/uzivo/ui/tekst-formule.component';

/*
 * Globalna priprema za `ng test` (Vitest + jsdom), pre svih specova.
 *
 * jsdom nema canvas: `getContext()` vraća `null` uz poruku "Not implemented" na konzoli (QR kod, paket `qrcode`). Isto
 * ponašanje (null, crtež ne uspe i komponenta prikaže svoju grešku), samo bez buke u izlazu testova.
 */
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, writable: true, value: () => null });

/*
 * jsdom nema raspored: `Range.getClientRects`/`getBoundingClientRect` i `document.elementFromPoint` ne postoje. Uređivač
 * teksta (ProseMirror, editor platna) ih zove kad pomera izbor u vidno polje (`scrollIntoView`, npr. Ctrl+Z u tekstu) i
 * kad čita koordinate. Isto što jsdom daje za elemente: prazni pravougaonici (nula), bez elementa na tački.
 */
if (typeof Range !== 'undefined' && !('getClientRects' in Range.prototype)) {
  Object.defineProperty(Range.prototype, 'getClientRects', {
    configurable: true, writable: true, value: () => Object.assign([], { item: () => null }),
  });
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', { configurable: true, writable: true, value: () => new DOMRect() });
}
if (typeof document !== 'undefined' && !('elementFromPoint' in document)) {
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, writable: true, value: () => null });
}

/*
 * Statički prikaz formula (`ui/formula-ucitavanje.ts`) kešira obećanja stila i modula za ceo prozor, a `ng test` deli
 * jedan jsdom među specovima. Posle svakog testa: zaboravi keš i ukloni `<link data-gfs="mathlive">`, da obećanje pod
 * lažnim tajmerima (nikad razrešeno) ili link jednog speca ne utiču na sledeći. Isto za lakši stil formula u tekstu
 * (`ucitajStilFormulaUTekstu`, `<link data-gfs="mathlive-tekst">`).
 *
 * Komponente (`app-formula-prikaz` u svakom prikazu platna) u specovima podrazumevano dobijaju učitavače koji se nikad ne
 * razreše: formula ostaje LaTeX izvor, bez lenjog modula i bez tajmera od 3 s stila (inače bi ga `saLaznimSatom` našao
 * u redu posle testa, zavisno od toga da li je neki raniji test već napunio keš); isto `app-tekst-formule` (tekst pitanja
 * i opcija sa `$...$`). Spec koji proverava markup daje svoje (`formula-prikaz.spec`, `tekst-formule.component.spec`);
 * same funkcije učitavanja (`formula-ucitavanje.spec`, `preducitavanje.spec`) rade i ovde.
 */
const nikad = () => new Promise<never>(() => undefined);
beforeEach(() => {
  TestBed.configureTestingModule({
    providers: [
      { provide: UCITAJ_FORMULE, useValue: nikad },
      { provide: UCITAJ_STIL_FORMULA, useValue: nikad },
      { provide: UCITAJ_STIL_TEKSTA_FORMULE, useValue: nikad },
    ],
  });
});


afterEach(() => {
  resetujUcitavanjeFormula();
  resetujStilTekstaFormule();
  if (typeof document !== 'undefined') {
    document.head.querySelectorAll('link[data-gfs="mathlive"], link[data-gfs="mathlive-tekst"]').forEach(l => l.remove());
  }
});
