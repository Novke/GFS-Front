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
