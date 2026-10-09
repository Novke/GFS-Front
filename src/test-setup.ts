/*
 * Globalna priprema za `ng test` (Vitest + jsdom), pre svih specova.
 *
 * jsdom nema canvas: `getContext()` vraća `null` uz poruku "Not implemented" na konzoli (QR kod, paket `qrcode`). Isto
 * ponašanje (null, crtež ne uspe i komponenta prikaže svoju grešku), samo bez buke u izlazu testova.
 */
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, writable: true, value: () => null });
